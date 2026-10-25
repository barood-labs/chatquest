import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createQuestEngine, startBot } from './bot.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
app.use(express.static(path.join(root, 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const broadcast = (msg) => {
  const data = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === 1) c.send(data);
};
const engine = createQuestEngine(broadcast);
wss.on('connection', (ws) => ws.send(JSON.stringify({ type: 'state', ...engine.state() })));

// Local test endpoints (simulate chat without Twitch)
app.post('/api/test/quest', (_req, res) => res.json(engine.start()));
app.post('/api/test/roll', (req, res) => res.json({ die: engine.roll(req.query.user || 'tester') }));

startBot(engine);
const port = Number(process.env.PORT) || 3000;
server.listen(port, () => console.log(`[server] overlay: http://localhost:${port}/overlay/`));
