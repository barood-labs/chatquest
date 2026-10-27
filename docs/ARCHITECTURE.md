# ChatQuest architecture

```
Twitch IRC (tmi.js) ──┐
                      ├──► Quest engine (src/bot.js) ──broadcast──► WebSocket /ws ──► OBS overlay
EventSub WS (Helix) ──┘                         │
                                                └──► chat replies (optional)

Local / mock path: POST /api/test/* hits the same engine (CHATQUEST_MOCK=1 skips Twitch).
```

## Quest lifecycle
1. `start` picks a typed quest (`combat`, `escort`, `puzzle`, …) with goal + icon.
2. Viewers `join` the party; names show as chips on the HUD.
3. `roll` adds 1–6 (crit on 6). Follow / sub / raid apply configured boosts.
4. At goal → `complete` event, confetti + toast; engine clears active quest.

## Overlay events
`state` · `quest` · `join` · `roll` · `boost` · `complete` · `stop`

Boost `reason` is one of `follow` | `subscribe` | `raid` | `boost` so the HUD can theme toasts.
