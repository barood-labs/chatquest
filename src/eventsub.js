// Twitch EventSub WebSocket client (channel.follow, channel.subscribe, channel.raid).
// Docs: https://dev.twitch.tv/docs/eventsub/handling-websocket-events
import WebSocket from 'ws';

const HELIX = 'https://api.twitch.tv/helix';
const EVENTSUB_WS = 'wss://eventsub.wss.twitch.tv/ws';

function bareToken(token) {
  if (!token) return '';
  return token.startsWith('oauth:') ? token.slice('oauth:'.length) : token;
}

async function helixJson(path, { clientId, token, method = 'GET', body } = {}) {
  const res = await fetch(`${HELIX}${path}`, {
    method,
    headers: {
      'Client-ID': clientId,
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.message || data?.error || text || res.statusText;
    const err = new Error(`Helix ${method} ${path} → ${res.status}: ${msg}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function resolveUserId({ clientId, token, login, overrideId }) {
  if (overrideId) return String(overrideId);
  if (!login) throw new Error('TWITCH_CHANNEL (or TWITCH_BROADCASTER_USER_ID) required for EventSub');
  const data = await helixJson(`/users?login=${encodeURIComponent(login)}`, { clientId, token });
  const id = data?.data?.[0]?.id;
  if (!id) throw new Error(`No Twitch user found for login=${login}`);
  return String(id);
}

async function createSubscription({ clientId, token, type, version, condition, sessionId }) {
  return helixJson('/eventsub/subscriptions', {
    clientId,
    token,
    method: 'POST',
    body: {
      type,
      version,
      condition,
      transport: { method: 'websocket', session_id: sessionId },
    },
  });
}

/**
 * Start EventSub WebSocket listener. No-ops in mock mode or when creds missing.
 * @returns {{ disconnect: () => void } | null}
 */
export function startEventSub(engine, { onChatSay } = {}) {
  const mock = process.env.CHATQUEST_MOCK === '1' || process.env.CHATQUEST_MOCK === 'true';
  if (mock) {
    console.warn('[eventsub] CHATQUEST_MOCK=1 — EventSub disabled');
    return null;
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const token = bareToken(process.env.TWITCH_BOT_TOKEN);
  const channel = process.env.TWITCH_CHANNEL;
  if (!clientId || !token || !channel) {
    console.warn('[eventsub] missing TWITCH_CLIENT_ID / TWITCH_BOT_TOKEN / TWITCH_CHANNEL — skipped');
    return null;
  }

  let ws = null;
  let closed = false;
  let reconnectTimer = null;
  let keepaliveMs = 10_000;
  let lastMsgAt = Date.now();
  let watchdog = null;

  const say = (msg) => {
    try {
      onChatSay?.(msg);
    } catch (e) {
      console.error('[eventsub] chat say failed', e?.message || e);
    }
  };

  const handleNotification = (subscriptionType, event) => {
    try {
      if (subscriptionType === 'channel.follow') {
        const user = event.user_name || event.user_login || 'follower';
        const r = engine.onFollow(user);
        if (r?.started) say(`New follower ${user} started a quest: ${r.quest?.title}!`);
        else if (r?.boosted) say(`${user} followed — quest boost +${r.amount}!`);
        return;
      }
      if (subscriptionType === 'channel.subscribe') {
        const user = event.user_name || event.user_login || 'subscriber';
        const r = engine.onSubscribe(user, { tier: event.tier, isGift: event.is_gift });
        if (r?.started) say(`${user} subscribed and started a quest: ${r.quest?.title}!`);
        else if (r?.boosted) say(`${user} subscribed — quest boost +${r.amount}!`);
        return;
      }
      if (subscriptionType === 'channel.raid') {
        const from = event.from_broadcaster_user_name || event.from_broadcaster_user_login || 'raider';
        const viewers = Number(event.viewers) || 0;
        const r = engine.onRaid(from, viewers);
        if (r?.started) say(`${from} raided with ${viewers} — quest started: ${r.quest?.title}!`);
        else if (r?.boosted) say(`${from} raided with ${viewers} — quest boost +${r.amount}!`);
      }
    } catch (e) {
      console.error('[eventsub] handleNotification', e?.message || e);
    }
  };

  const subscribeAll = async (sessionId) => {
    const broadcasterId = await resolveUserId({
      clientId,
      token,
      login: channel,
      overrideId: process.env.TWITCH_BROADCASTER_USER_ID,
    });
    const moderatorId =
      process.env.TWITCH_MODERATOR_USER_ID ||
      (await resolveUserId({
        clientId,
        token,
        login: process.env.TWITCH_BOT_USERNAME || channel,
        overrideId: process.env.TWITCH_BROADCASTER_USER_ID,
      }));

    const specs = [
      {
        type: 'channel.follow',
        version: '2',
        condition: { broadcaster_user_id: broadcasterId, moderator_user_id: moderatorId },
      },
      {
        type: 'channel.subscribe',
        version: '1',
        condition: { broadcaster_user_id: broadcasterId },
      },
      {
        type: 'channel.raid',
        version: '1',
        condition: { to_broadcaster_user_id: broadcasterId },
      },
    ];

    for (const spec of specs) {
      try {
        const res = await createSubscription({ clientId, token, sessionId, ...spec });
        const status = res?.data?.[0]?.status || 'ok';
        console.log(`[eventsub] subscribed ${spec.type} (${status})`);
      } catch (e) {
        // Missing scopes (e.g. channel:read:subscriptions) should not kill the rest.
        console.warn(`[eventsub] subscribe ${spec.type} failed: ${e.message}`);
      }
    }
  };

  const connect = (url = EVENTSUB_WS) => {
    if (closed) return;
    ws = new WebSocket(url);

    ws.on('open', () => {
      console.log('[eventsub] websocket connected');
      lastMsgAt = Date.now();
    });

    ws.on('message', async (buf) => {
      lastMsgAt = Date.now();
      let msg;
      try {
        msg = JSON.parse(String(buf));
      } catch {
        return;
      }
      const type = msg?.metadata?.message_type;
      if (type === 'session_welcome') {
        const sessionId = msg.payload?.session?.id;
        const ka = Number(msg.payload?.session?.keepalive_timeout_seconds);
        if (Number.isFinite(ka) && ka > 0) keepaliveMs = ka * 1000;
        console.log(`[eventsub] welcome session=${sessionId}`);
        try {
          await subscribeAll(sessionId);
        } catch (e) {
          console.error('[eventsub] subscribeAll failed', e?.message || e);
        }
        return;
      }
      if (type === 'session_keepalive') return;
      if (type === 'notification') {
        handleNotification(msg.payload?.subscription?.type, msg.payload?.event || {});
        return;
      }
      if (type === 'session_reconnect') {
        const reconnectUrl = msg.payload?.session?.reconnect_url;
        console.warn('[eventsub] reconnect requested');
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
        if (reconnectUrl) connect(reconnectUrl);
        else scheduleReconnect();
        return;
      }
      if (type === 'revocation') {
        console.warn('[eventsub] subscription revoked', msg.payload?.subscription?.type);
      }
    });

    ws.on('close', () => {
      if (closed) return;
      console.warn('[eventsub] websocket closed — will reconnect');
      scheduleReconnect();
    });

    ws.on('error', (e) => {
      console.error('[eventsub] websocket error', e?.message || e);
    });
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 3000);
  };

  watchdog = setInterval(() => {
    if (closed) return;
    if (Date.now() - lastMsgAt > keepaliveMs * 2 + 5000) {
      console.warn('[eventsub] keepalive stale — forcing reconnect');
      try {
        ws?.terminate();
      } catch {
        /* ignore */
      }
    }
  }, 5000);
  watchdog.unref?.();

  connect();

  return {
    disconnect() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (watchdog) clearInterval(watchdog);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    },
  };
}
