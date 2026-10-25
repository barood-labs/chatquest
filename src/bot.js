// Twitch chat bot + quest state. EventSub (follows/subs/raids) hooks are TODO.
import tmi from 'tmi.js';

const QUESTS = [
  { title: 'Slay the Pixel Dragon', goal: 20 },
  { title: 'Escort the Lost Llama', goal: 15 },
  { title: 'Crack the Vault Code', goal: 25 },
];

export function createQuestEngine(broadcast) {
  let quest = null;
  const contributors = new Set();
  const state = () => ({ quest, contributors: contributors.size });

  return {
    state,
    start(idx) {
      const q = QUESTS[idx ?? Math.floor(Math.random() * QUESTS.length)];
      quest = { ...q, progress: 0, startedAt: Date.now() };
      contributors.clear();
      broadcast({ type: 'quest', ...state() });
      return quest;
    },
    roll(user) {
      if (!quest) return null;
      const die = 1 + Math.floor(Math.random() * 6);
      quest.progress = Math.min(quest.goal, quest.progress + die);
      contributors.add(user);
      broadcast({ type: 'roll', user, die, ...state() });
      if (quest.progress >= quest.goal) {
        broadcast({ type: 'complete', ...state() });
        quest = null;
      }
      return die;
    },
  };
}

export function startBot(engine) {
  const { TWITCH_BOT_TOKEN, TWITCH_BOT_USERNAME, TWITCH_CHANNEL } = process.env;
  if (!TWITCH_BOT_TOKEN || !TWITCH_CHANNEL) {
    console.warn('[bot] Twitch env missing; running overlay-only (use /api/test/* to simulate).');
    return null;
  }
  const token = TWITCH_BOT_TOKEN.startsWith('oauth:') ? TWITCH_BOT_TOKEN : `oauth:${TWITCH_BOT_TOKEN}`;
  const client = new tmi.Client({
    identity: { username: TWITCH_BOT_USERNAME || TWITCH_CHANNEL, password: token },
    channels: [TWITCH_CHANNEL],
  });
  client.on('message', (channel, tags, msg, self) => {
    if (self) return;
    const cmd = msg.trim().toLowerCase();
    const user = tags['display-name'] || tags.username;
    if (cmd === '!quest') {
      const q = engine.start();
      client.say(channel, `New quest: ${q.title}! Type !roll to help (goal ${q.goal}).`);
    } else if (cmd === '!roll') {
      const die = engine.roll(user);
      if (die === null) client.say(channel, 'No active quest — type !quest');
    }
  });
  client.connect().then(() => console.log(`[bot] joined #${TWITCH_CHANNEL}`)).catch(e => console.error('[bot]', e));
  return client;
}
