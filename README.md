# ChatQuest Overlay

Twitch chat spawns short co-op quests. A Node bot (Twitch chat now, EventSub later) drives a transparent OBS browser-source overlay with a quest title, progress bar, and dice rolls.

> Starter scaffold only. The real build happens with OpenAI Codex during the Codex × TwitchCon submission period.

## Setup
1. Node 20+. Run `npm install`.
2. Create a Twitch app at https://dev.twitch.tv/console/apps (OAuth redirect `http://localhost:3000`).
3. `cp .env.example .env` and fill in:
   - `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`: from the app (for EventSub/Helix later)
   - `TWITCH_BOT_TOKEN`: user access token for the bot account with `chat:read chat:edit`
   - `TWITCH_BOT_USERNAME` (optional, defaults to the channel), `TWITCH_CHANNEL`: the channel to join
   - `PORT` (default 3000)

Never commit `.env`.

## Run
```bash
npm start        # server + overlay + bot (the bot is skipped if Twitch env is missing)
npm run dev      # restarts when files change
```
Chat commands: `!quest` starts a quest, and `!roll` rolls a d6 toward the goal.

Test without Twitch:
```bash
curl -X POST localhost:3000/api/test/quest
curl -X POST "localhost:3000/api/test/roll?user=alice"
```

## OBS
Add a **Browser Source** with URL `http://localhost:3000/overlay/` at 1920×1080. The background is transparent.

## TODO (to build with Codex)
- EventSub: follows, subs, and raids spawn or boost quests
- More quest types, timers, rewards, and channel points
