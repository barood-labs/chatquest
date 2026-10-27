# Contributing to ChatQuest

## Dev loop
```bash
npm install
npm run start:mock   # never talks to Twitch
# another terminal:
npm run smoke
open http://localhost:3000/control/
```

## Layout
| Path | Role |
| --- | --- |
| `src/bot.js` | Quest engine + Twitch IRC commands |
| `src/eventsub.js` | Twitch EventSub WebSocket (follow / sub / raid) |
| `src/server.js` | Express + overlay static + `/api/test/*` + WS broadcast |
| `public/overlay/` | Transparent OBS browser source |
| `public/control/` | Local simulator / HUD preview |
| `public/demo/` | Side-by-side Twitch chat + overlay stage |

## Rules of the road
- Never commit `.env` or `CODEX_SESSION_ID.txt`.
- Prefer mock APIs + `npm run smoke` over live Twitch for CI.
- EventSub scope failures must stay non-fatal (raid/chat can still work).
- Keep overlay background fully transparent for OBS.
