// Twitch chat bot + quest state. EventSub (follows/subs/raids) wired via engine hooks.
import tmi from 'tmi.js';

const QUESTS = [
  { title: 'Slay the Pixel Dragon', goal: 20 },
  { title: 'Escort the Lost Llama', goal: 15 },
  { title: 'Crack the Vault Code', goal: 25 },
  { title: 'Rescue the Neon Fox', goal: 18 },
  { title: 'Hack the Stream Gate', goal: 22 },
];

export function createQuestEngine(broadcast) {
  let quest = null;
  const contributors = new Set();

  const state = () => ({
    quest: quest ? { ...quest } : null,
    contributors: contributors.size,
    heroes: [...contributors],
  });

  const push = (type, extra = {}) => {
    const payload = { type, ...state(), ...extra };
    broadcast(payload);
    return payload;
  };

  const FOLLOW_BOOST = Number(process.env.CHATQUEST_FOLLOW_BOOST) || 3;
  const SUB_BOOST = Number(process.env.CHATQUEST_SUB_BOOST) || 6;
  const RAID_BOOST_CAP = Number(process.env.CHATQUEST_RAID_BOOST_CAP) || 15;

  const applyBoost = (user, amount, reason) => {
    const name = String(user || 'anon').slice(0, 32);
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (!quest) return { started: false, boosted: false, amount: 0, reason, ok: false, error: 'no_quest' };
    contributors.add(name);
    quest.progress = Math.min(quest.goal, quest.progress + n);
    push('boost', { user: name, amount: n, reason });
    let completed = false;
    if (quest.progress >= quest.goal) {
      completed = true;
      push('complete');
      quest = null;
    }
    return { started: false, boosted: true, amount: n, reason, completed, user: name, ...state() };
  };

  const startOrBoost = (user, amount, reason) => {
    if (!quest) {
      const started = (() => {
        const i = Math.floor(Math.random() * QUESTS.length);
        const q = QUESTS[i];
        quest = { ...q, progress: 0, startedAt: Date.now() };
        contributors.clear();
        const name = String(user || 'anon').slice(0, 32);
        contributors.add(name);
        return push('quest', { user: name, reason });
      })();
      return { started: true, boosted: false, amount: 0, reason, quest: started.quest, ...state() };
    }
    return applyBoost(user, amount, reason);
  };

  return {
    state,
    start(idx) {
      const i = Number.isInteger(idx) ? idx % QUESTS.length : Math.floor(Math.random() * QUESTS.length);
      const q = QUESTS[i];
      quest = { ...q, progress: 0, startedAt: Date.now() };
      contributors.clear();
      return push('quest');
    },
    join(user) {
      if (!quest) return { ok: false, reason: 'no_quest' };
      const name = String(user || 'anon').slice(0, 32);
      const wasNew = !contributors.has(name);
      contributors.add(name);
      push('join', { user: name, wasNew });
      return { ok: true, wasNew, ...state() };
    },
    roll(user) {
      if (!quest) return { ok: false, reason: 'no_quest', die: null };
      const name = String(user || 'anon').slice(0, 32);
      const die = 1 + Math.floor(Math.random() * 6);
      quest.progress = Math.min(quest.goal, quest.progress + die);
      contributors.add(name);
      push('roll', { user: name, die });
      let completed = false;
      if (quest.progress >= quest.goal) {
        completed = true;
        push('complete');
        quest = null;
      }
      return { ok: true, die, completed, ...state() };
    },
    progress() {
      return state();
    },
    stop() {
      if (!quest) return { ok: false, reason: 'no_quest' };
      const prev = state();
      quest = null;
      contributors.clear();
      push('stop');
      return { ok: true, ...prev };
    },
    /** EventSub: follow starts a quest if none, else boosts progress. */
    onFollow(user) {
      return startOrBoost(user, FOLLOW_BOOST, 'follow');
    },
    /** EventSub: subscribe starts or boosts. */
    onSubscribe(user, _meta = {}) {
      return startOrBoost(user, SUB_BOOST, 'subscribe');
    },
    /** EventSub: raid starts or boosts (scaled by viewers, capped). */
    onRaid(fromUser, viewers = 0) {
      const v = Math.max(0, Math.floor(Number(viewers) || 0));
      const amount = Math.min(RAID_BOOST_CAP, Math.max(5, v));
      return startOrBoost(fromUser, amount, 'raid');
    },
    boost(user, amount, reason = 'boost') {
      return applyBoost(user, amount, reason);
    },
  };
}

function parseCommand(msg) {
  const parts = msg.trim().split(/\s+/);
  if (!parts[0]) return null;
  const head = parts[0].toLowerCase();
  const arg = (parts[1] || '').toLowerCase();
  if (head === '!quest') {
    if (!arg || arg === 'start') return { cmd: 'start' };
    if (arg === 'join') return { cmd: 'join' };
    if (arg === 'progress' || arg === 'status') return { cmd: 'progress' };
    if (arg === 'stop' || arg === 'end') return { cmd: 'stop' };
    if (arg === 'help') return { cmd: 'help' };
    return { cmd: 'help' };
  }
  if (head === '!roll') return { cmd: 'roll' };
  if (head === '!join') return { cmd: 'join' };
  if (head === '!progress' || head === '!status') return { cmd: 'progress' };
  if (head === '!help' || head === '!chatquest') return { cmd: 'help' };
  return null;
}

const HELP =
  'ChatQuest: !quest start · !join · !roll · !progress · !quest stop';

export function startBot(engine) {
  const mock = process.env.CHATQUEST_MOCK === '1' || process.env.CHATQUEST_MOCK === 'true';
  if (mock) {
    console.warn('[bot] CHATQUEST_MOCK=1 — Twitch chat disabled; use /api/test/*');
    return null;
  }

  const { TWITCH_BOT_TOKEN, TWITCH_BOT_USERNAME, TWITCH_CHANNEL } = process.env;
  if (!TWITCH_BOT_TOKEN || !TWITCH_CHANNEL) {
    console.warn('[bot] Twitch env missing; running overlay-only (use /api/test/* to simulate).');
    return null;
  }

  const token = TWITCH_BOT_TOKEN.startsWith('oauth:') ? TWITCH_BOT_TOKEN : `oauth:${TWITCH_BOT_TOKEN}`;
  const client = new tmi.Client({
    options: { skipUpdatingEmotesets: true },
    identity: { username: TWITCH_BOT_USERNAME || TWITCH_CHANNEL, password: token },
    channels: [TWITCH_CHANNEL],
    connection: { reconnect: true, secure: true },
  });

  client.on('message', (channel, tags, msg, self) => {
    if (self) return;
    const parsed = parseCommand(msg);
    if (!parsed) return;
    const user = tags['display-name'] || tags.username || 'viewer';

    try {
      if (parsed.cmd === 'help') {
        client.say(channel, HELP);
        return;
      }
      if (parsed.cmd === 'start') {
        const s = engine.start();
        const q = s.quest;
        client.say(channel, `New quest: ${q.title}! Goal ${q.goal}. Type !join then !roll.`);
        return;
      }
      if (parsed.cmd === 'join') {
        const r = engine.join(user);
        if (!r.ok) client.say(channel, 'No active quest — type !quest start');
        else if (r.wasNew) client.say(channel, `${user} joined the party! (${r.contributors} heroes)`);
        return;
      }
      if (parsed.cmd === 'roll') {
        const r = engine.roll(user);
        if (!r.ok) {
          client.say(channel, 'No active quest — type !quest start');
          return;
        }
        if (r.completed) {
          client.say(channel, `Quest complete! ${user} landed the finishing roll (${r.die}).`);
        }
        return;
      }
      if (parsed.cmd === 'progress') {
        const s = engine.progress();
        if (!s.quest) client.say(channel, 'No active quest — type !quest start');
        else {
          client.say(
            channel,
            `${s.quest.title}: ${s.quest.progress}/${s.quest.goal} · ${s.contributors} heroes`,
          );
        }
        return;
      }
      if (parsed.cmd === 'stop') {
        const r = engine.stop();
        if (!r.ok) client.say(channel, 'No active quest to stop.');
        else client.say(channel, 'Quest ended by chat.');
      }
    } catch (e) {
      console.error('[bot] command error', e);
    }
  });

  client.on('connected', () => console.log(`[bot] joined #${TWITCH_CHANNEL}`));
  client.connect().catch((e) => console.error('[bot] connect failed', e?.message || e));
  return client;
}
