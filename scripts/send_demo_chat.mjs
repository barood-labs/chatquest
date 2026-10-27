#!/usr/bin/env node
/**
 * Drive ChatQuest commands on Twitch IRC using TWITCH_* from .env.
 * Separate tmi connection so the bot sees messages as not-self.
 * Never logs tokens.
 */
import 'dotenv/config';
import tmi from 'tmi.js';

const channel = process.env.TWITCH_CHANNEL;
const username = process.env.TWITCH_BOT_USERNAME || channel;
const raw = process.env.TWITCH_BOT_TOKEN;
if (!channel || !raw) {
  console.error('[send] missing TWITCH_CHANNEL or TWITCH_BOT_TOKEN');
  process.exit(2);
}
const password = raw.startsWith('oauth:') ? raw : `oauth:${raw}`;

const msgs = process.argv.slice(2);
const sequence =
  msgs.length > 0
    ? msgs
    : ['!quest start', '!join', '!roll', '!roll', '!roll', '!roll', '!roll', '!progress'];

const client = new tmi.Client({
  options: { skipUpdatingEmotesets: true },
  identity: { username, password },
  channels: [channel],
  connection: { reconnect: false, secure: true },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

client.on('connected', () => console.log(`[send] connected as ${username} → #${channel}`));
client.on('notice', (_c, mid, msg) => console.log(`[send] notice ${mid || ''}: ${msg}`));
client.on('disconnected', (r) => console.log(`[send] disconnected: ${r}`));

try {
  await client.connect();
  await sleep(800);
  for (const m of sequence) {
    console.log(`[send] → ${m}`);
    try {
      await client.say(channel, m);
    } catch (e) {
      console.error(`[send] say failed for "${m}":`, e?.message || e);
      // Twitch often throws stringy notices for offline/auth
      throw e;
    }
    await sleep(2200);
  }
  await sleep(1500);
  await client.disconnect();
  console.log('[send] done');
  process.exit(0);
} catch (e) {
  console.error('[send] FATAL:', e?.message || e);
  try {
    await client.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
}
