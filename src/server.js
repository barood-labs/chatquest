import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createQuestEngine, startBot } from './bot.js';
import { startEventSub } from './eventsub.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
app.use(express.json());
app.use(express.static(path.join(root, 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const broadcast = (msg) => {
  const data = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === 1) c.send(data);
};
const engine = createQuestEngine(broadcast);
wss.on('connection', (ws) => ws.send(JSON.stringify({ type: 'state', ...engine.state() })));

app.get('/api/state', (_req, res) => res.json(engine.state()));
app.get('/api/catalog', (_req, res) => res.json({ quests: engine.catalog() }));
app.post('/api/test/quest', (req, res) => {
  const selector = req.query.type || req.query.id || req.body?.type || req.body?.id;
  res.json(engine.start(selector || undefined));
});
app.post('/api/test/join', (req, res) => {
  const user = req.query.user || req.body?.user || 'tester';
  res.json(engine.join(user));
});
app.post('/api/test/roll', (req, res) => {
  const user = req.query.user || req.body?.user || 'tester';
  res.json(engine.roll(user));
});
app.post('/api/test/stop', (_req, res) => res.json(engine.stop()));
app.post('/api/test/follow', (req, res) => {
  const user = req.query.user || req.body?.user || 'follower';
  res.json(engine.onFollow(user));
});
app.post('/api/test/subscribe', (req, res) => {
  const user = req.query.user || req.body?.user || 'subscriber';
  res.json(engine.onSubscribe(user));
});
app.post('/api/test/raid', (req, res) => {
  const user = req.query.user || req.body?.user || 'raider';
  const viewers = Number(req.query.viewers || req.body?.viewers || 10);
  res.json(engine.onRaid(user, viewers));
});

const bot = startBot(engine);
const eventsub = startEventSub(engine, {
  onChatSay: (msg) => {
    try {
      const channel = process.env.TWITCH_CHANNEL;
      if (bot && channel) bot.say(channel, msg);
    } catch (e) {
      console.error('[server] eventsub chat', e?.message || e);
    }
  },
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => {
  console.log(`[server] overlay:  http://localhost:${port}/overlay/`);
  console.log(`[server] control:  http://localhost:${port}/control/`);
  console.log(`[server] demo:     http://localhost:${port}/demo/stage.html`);
  console.log(
    `[server] mock APIs: POST /api/test/quest|join|roll|stop|follow|subscribe|raid  GET /api/state|/api/catalog`,
  );
});

function shutdown() {
  try {
    eventsub?.disconnect?.();
  } catch {
    /* ignore */
  }
  try {
    bot?.disconnect?.();
  } catch {
    /* ignore */
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
