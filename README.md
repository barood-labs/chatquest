# ChatQuest Overlay

Twitch chat spawns short co-op quests. A Node bot drives a transparent OBS browser-source overlay with quest title, progress bar, dice rolls, and party size. EventSub WebSocket listens for follows, subs, and raids to start or boost quests.

Built for the [Codex × TwitchCon Hackathon](https://twitchcon-codex.devpost.com/).

## Setup
1. Node 20+. Run `npm install`.
2. Twitch app at https://dev.twitch.tv/console/apps (OAuth redirect `http://localhost:3000`).
3. `cp .env.example .env` and fill in:
   - `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` — app credentials (Helix + EventSub)
   - `TWITCH_BOT_TOKEN` — user access token with:
     - `chat:read chat:edit` — IRC chat bot
     - `moderator:read:followers` — `channel.follow` EventSub (v2)
     - `channel:read:subscriptions` — `channel.subscribe` EventSub
     - (raid needs no extra scope)
   - `TWITCH_BOT_USERNAME` — bot login (e.g. `satrtools`)
   - `TWITCH_CHANNEL` — channel to join (e.g. `satrtools`)
   - `TWITCH_BROADCASTER_USER_ID` / `TWITCH_MODERATOR_USER_ID` — optional; resolved via Helix from channel/bot login when omitted
   - `PORT` — default `3000`
   - `CHATQUEST_MOCK=1` — skip Twitch chat + EventSub (local overlay + `/api/test/*` only)
   - `CHATQUEST_FOLLOW_BOOST` / `CHATQUEST_SUB_BOOST` / `CHATQUEST_RAID_BOOST_CAP` — EventSub progress boosts (defaults 3 / 6 / 15)

Never commit `.env`.

## Run
```bash
npm start          # server + overlay + Twitch bot + EventSub (skipped if env missing / mock)
npm run start:mock # never connects to Twitch
npm run smoke      # automated mock smoke test (includes EventSub sim endpoints)
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

## EventSub (WebSocket)
Connects to `wss://eventsub.wss.twitch.tv/ws` and creates Helix subscriptions after `session_welcome`:

| Event | Behavior |
| --- | --- |
| `channel.follow` (v2) | Starts a quest if none active; otherwise boosts progress |
| `channel.subscribe` (v1) | Starts or boosts (larger boost) |
| `channel.raid` (v1, `to_broadcaster_user_id`) | Starts or boosts (scaled by viewers, capped) |

Skipped when `CHATQUEST_MOCK=1` or required env vars are missing. Individual subscription failures (e.g. missing scope) are logged and do not stop the others.

## Test without Twitch
```bash
npm run start:mock
curl -X POST localhost:3000/api/test/quest
curl -X POST "localhost:3000/api/test/join?user=alice"
curl -X POST "localhost:3000/api/test/roll?user=bob"
curl -X POST "localhost:3000/api/test/follow?user=newbie"
curl -X POST "localhost:3000/api/test/subscribe?user=patron"
curl -X POST "localhost:3000/api/test/raid?user=raider&viewers=12"
curl localhost:3000/api/state
```

## OBS
Add a **Browser Source** → `http://localhost:3000/overlay/` at 1920×1080. Background is transparent.

## TODO (Codex build thread)
- Channel points / timers / rewards
- ≤3 min YouTube demo (live Twitch + Codex footage)
- Devpost Submit (Session ID already captured for the entry)
