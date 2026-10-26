# ChatQuest Overlay

Twitch chat spawns short co-op quests. A Node bot drives a transparent OBS browser-source overlay with quest title, progress bar, dice rolls, and party size.

Built for the [Codex × TwitchCon Hackathon](https://twitchcon-codex.devpost.com/).

## Setup
1. Node 20+. Run `npm install`.
2. Twitch app at https://dev.twitch.tv/console/apps (OAuth redirect `http://localhost:3000`).
3. `cp .env.example .env` and fill in:
   - `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` — app credentials (EventSub/Helix later)
   - `TWITCH_BOT_TOKEN` — user access token with `chat:read chat:edit` (`oauth:…` or raw)
   - `TWITCH_BOT_USERNAME` — bot login (e.g. `satrtools`)
   - `TWITCH_CHANNEL` — channel to join (e.g. `satrtools`)
   - `PORT` — default `3000`
   - `CHATQUEST_MOCK=1` — skip Twitch connect (local overlay + `/api/test/*` only)

Never commit `.env`.

## Run
```bash
npm start          # server + overlay + Twitch bot (skipped if env missing)
npm run start:mock # never connects to Twitch
npm run smoke      # automated mock smoke test
npm run dev        # restart on file changes
```

## Chat commands
| Command | Action |
| --- | --- |
| `!quest` / `!quest start` | Start a random co-op quest |
| `!join` / `!quest join` | Join the party |
| `!roll` | Roll a d6 toward the goal |
| `!progress` / `!quest progress` | Show progress in chat |
| `!quest stop` | End the current quest |
| `!help` | List commands |

## Test without Twitch
```bash
npm run start:mock
curl -X POST localhost:3000/api/test/quest
curl -X POST "localhost:3000/api/test/join?user=alice"
curl -X POST "localhost:3000/api/test/roll?user=bob"
curl localhost:3000/api/state
```

## OBS
Add a **Browser Source** → `http://localhost:3000/overlay/` at 1920×1080. Background is transparent.

## TODO (Codex build thread)
- EventSub: follows, subs, raids spawn or boost quests
- Channel points / timers / rewards
- Codex Session ID via `/status` for Devpost
- ≤3 min YouTube demo (live Twitch + Codex footage)
