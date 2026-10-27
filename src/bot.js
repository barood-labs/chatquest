// Twitch chat bot + quest state. EventSub (follows/subs/raids) wired via engine hooks.
import tmi from 'tmi.js';

/** Quest catalog: type drives overlay theme + chat flavor. */
export const QUESTS = [
  {
    id: 'pixel-dragon',
    title: 'Slay the Pixel Dragon',
    goal: 20,
    type: 'combat',
    icon: '🐉',
    blurb: 'Chat rolls smash the boss HP bar.',
  },
  {
    id: 'lost-llama',
    title: 'Escort the Lost Llama',
    goal: 15,
    type: 'escort',
    icon: '🦙',
    blurb: 'Keep the llama moving — every roll is a step.',
  },
  {
    id: 'vault-code',
    title: 'Crack the Vault Code',
    goal: 25,
    type: 'puzzle',
    icon: '🔐',
    blurb: 'Dice are digits. Hit the goal to crack it.',
  },
  {
    id: 'neon-fox',
    title: 'Rescue the Neon Fox',
    goal: 18,
    type: 'rescue',
    icon: '🦊',
    blurb: 'Party up and pull the fox from the glitch.',
  },
  {
    id: 'stream-gate',
    title: 'Hack the Stream Gate',
    goal: 22,
    type: 'hack',
    icon: '🖥️',
    blurb: 'Bypass the firewall one roll at a time.',
  },
  {
    id: 'raid-banner',
    title: 'Raise the Raid Banner',
    goal: 30,
    type: 'raid',
    icon: '🚩',
    blurb: 'Big goal — perfect when a raid lands.',
  },
  {
    id: 'emote-storm',
    title: 'Survive the Emote Storm',
    goal: 16,
    type: 'survival',
    icon: '⛈️',
    blurb: 'Weather the chat spam. Roll to endure.',
  },
];

const TYPE_ALIASES = {
  combat: 'combat',
  fight: 'combat',
  boss: 'combat',
  escort: 'escort',
  puzzle: 'puzzle',
  vault: 'puzzle',
  rescue: 'rescue',
  hack: 'hack',
  raid: 'raid',
  survival: 'survival',
  storm: 'survival',
};

function pickQuest(selector) {
  if (typeof selector === 'number' && Number.isInteger(selector)) {
    return QUESTS[((selector % QUESTS.length) + QUESTS.length) % QUESTS.length];
  }
  if (typeof selector === 'string' && selector) {
    const key = selector.toLowerCase();
    const byId = QUESTS.find((q) => q.id === key || q.title.toLowerCase() === key);
    if (byId) return byId;
    const type = TYPE_ALIASES[key];
    if (type) {
      const pool = QUESTS.filter((q) => q.type === type);
      if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
    }
  }
  return QUESTS[Math.floor(Math.random() * QUESTS.length)];
}

export function createQuestEngine(broadcast) {
  let quest = null;
  const contributors = new Set();
  let lastEvent = null;

  const state = () => ({
    quest: quest ? { ...quest } : null,
    contributors: contributors.size,
    heroes: [...contributors],
    lastEvent,
    catalog: QUESTS.map(({ id, title, goal, type, icon, blurb }) => ({
      id,
      title,
      goal,
      type,
      icon,
      blurb,
    })),
  });

  const push = (type, extra = {}) => {
    const payload = { type, ...state(), ...extra };
    broadcast(payload);
    return payload;
  };

  const FOLLOW_BOOST = Number(process.env.CHATQUEST_FOLLOW_BOOST) || 3;
  const SUB_BOOST = Number(process.env.CHATQUEST_SUB_BOOST) || 6;
  const RAID_BOOST_CAP = Number(process.env.CHATQUEST_RAID_BOOST_CAP) || 15;

  const beginQuest = (selector, meta = {}) => {
    const q = pickQuest(selector);
    quest = {
      ...q,
      progress: 0,
      startedAt: Date.now(),
    };
    contributors.clear();
    if (meta.user) contributors.add(String(meta.user).slice(0, 32));
    lastEvent = {
      kind: meta.reason || 'start',
      user: meta.user || null,
      at: Date.now(),
    };
    return push('quest', { user: meta.user || null, reason: meta.reason || 'start' });
  };

  const applyBoost = (user, amount, reason) => {
    const name = String(user || 'anon').slice(0, 32);
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (!quest) return { started: false, boosted: false, amount: 0, reason, ok: false, error: 'no_quest' };
    contributors.add(name);
    quest.progress = Math.min(quest.goal, quest.progress + n);
    lastEvent = { kind: reason, user: name, amount: n, at: Date.now() };
    push('boost', { user: name, amount: n, reason });
    let completed = false;
    if (quest.progress >= quest.goal) {
      completed = true;
      const done = { ...quest };
      push('complete', { quest: done, finisher: name, reason });
      quest = null;
      lastEvent = { kind: 'complete', user: name, at: Date.now() };
    }
    return { started: false, boosted: true, amount: n, reason, completed, user: name, ...state() };
  };

  const startOrBoost = (user, amount, reason) => {
    if (!quest) {
      const started = beginQuest(reason === 'raid' ? 'raid' : undefined, { user, reason });
      return { started: true, boosted: false, amount: 0, reason, quest: started.quest, ...state() };
    }
    return applyBoost(user, amount, reason);
  };

  return {
    state,
    catalog: () => QUESTS.slice(),
    start(selector) {
      return beginQuest(selector);
    },
    join(user) {
      if (!quest) return { ok: false, reason: 'no_quest' };
      const name = String(user || 'anon').slice(0, 32);
      const wasNew = !contributors.has(name);
      contributors.add(name);
      lastEvent = { kind: 'join', user: name, at: Date.now() };
      push('join', { user: name, wasNew });
      return { ok: true, wasNew, ...state() };
    },
    roll(user) {
      if (!quest) return { ok: false, reason: 'no_quest', die: null };
      const name = String(user || 'anon').slice(0, 32);
      const die = 1 + Math.floor(Math.random() * 6);
      const crit = die === 6;
      quest.progress = Math.min(quest.goal, quest.progress + die);
      contributors.add(name);
      lastEvent = { kind: 'roll', user: name, die, crit, at: Date.now() };
      push('roll', { user: name, die, crit });
      let completed = false;
      if (quest.progress >= quest.goal) {
        completed = true;
        const done = { ...quest };
        push('complete', { quest: done, finisher: name, die });
        quest = null;
        lastEvent = { kind: 'complete', user: name, at: Date.now() };
      }
      return { ok: true, die, crit, completed, ...state() };
    },
    progress() {
      return state();
    },
    stop() {
      if (!quest) return { ok: false, reason: 'no_quest' };
      const prev = state();
      quest = null;
      contributors.clear();
      lastEvent = { kind: 'stop', at: Date.now() };
      push('stop');
      return { ok: true, ...prev };
    },
    onFollow(user) {
      return startOrBoost(user, FOLLOW_BOOST, 'follow');
    },
    onSubscribe(user, _meta = {}) {
      return startOrBoost(user, SUB_BOOST, 'subscribe');
    },
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
  const arg2 = (parts[2] || '').toLowerCase();
  if (head === '!quest') {
    if (!arg || arg === 'start') return { cmd: 'start', selector: arg2 || undefined };
    if (arg === 'join') return { cmd: 'join' };
    if (arg === 'progress' || arg === 'status') return { cmd: 'progress' };
    if (arg === 'stop' || arg === 'end') return { cmd: 'stop' };
    if (arg === 'list' || arg === 'types') return { cmd: 'list' };
    if (arg === 'help') return { cmd: 'help' };
    // !quest combat | !quest puzzle | !quest neon-fox
    if (TYPE_ALIASES[arg] || QUESTS.some((q) => q.id === arg)) {
      return { cmd: 'start', selector: arg };
    }
    return { cmd: 'help' };
  }
  if (head === '!roll') return { cmd: 'roll' };
  if (head === '!join') return { cmd: 'join' };
  if (head === '!progress' || head === '!status') return { cmd: 'progress' };
  if (head === '!quests' || head === '!questlist') return { cmd: 'list' };
  if (head === '!help' || head === '!chatquest') return { cmd: 'help' };
  return null;
}

const HELP =
  'ChatQuest: !quest start · !quest combat|escort|puzzle|rescue|hack|raid · !join · !roll · !progress · !quest list · !quest stop';

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
      if (parsed.cmd === 'list') {
        const types = [...new Set(QUESTS.map((q) => q.type))].join(', ');
        client.say(channel, `Quest types: ${types}. Try !quest combat or !quest puzzle.`);
        return;
      }
      if (parsed.cmd === 'start') {
        const s = engine.start(parsed.selector);
        const q = s.quest;
        client.say(
          channel,
          `${q.icon} New ${q.type} quest: ${q.title}! Goal ${q.goal}. Type !join then !roll.`,
        );
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
        } else if (r.crit) {
          client.say(channel, `CRIT! ${user} rolled a 6 🎲`);
        }
        return;
      }
      if (parsed.cmd === 'progress') {
        const s = engine.progress();
        if (!s.quest) client.say(channel, 'No active quest — type !quest start');
        else {
          client.say(
            channel,
            `${s.quest.icon} ${s.quest.title}: ${s.quest.progress}/${s.quest.goal} · ${s.contributors} heroes`,
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
