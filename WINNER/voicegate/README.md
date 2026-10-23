# VoiceGate

A household confirm layer for voice orders. It reads the order back, asks for a time, and waits for yes. The cafe is not called until then. Pizza is three dollars. Money is fake.

![VoiceGate idle screen: voice session on the left, live MCP proxy on the right](docs/screenshot.png)

The page at `http://127.0.0.1:3002/` is a real MCP client (`initialize`, `tools/list`, `tools/call`). Talk to VoiceGate at `http://127.0.0.1:3002/mcp`, not to the cafe.

## How it works

1. **Order** — “two pizzas.” VoiceGate holds it. Nothing is placed.
2. **Time** — “8.30.” That is eight thirty, not eight pizzas.
3. **Confirm** — “yes.” Now the cafe writes the fake order.

A new prepare replaces the old pending id. Tools that look read-only but would charge (`get_order`) still have to prepare. Orders over the household cap ($100, in `data/limit.json`) are blocked. After a confirm, **undo** works for 60 seconds.

| You ask VoiceGate | What happens |
| --- | --- |
| `get_hours` / `get_menu` | Passed through. No confirm. |
| `prepare_action` | Speakable readback. Asks for time if missing. Cafe not called. |
| `confirm_action` | Places or cancels once. Same id cannot run again. |
| `cancel_action` | Drops the hold. |
| `undo_last_action` | Cancels the last placed order if still in the window. |
| `get_audit_log` | Record only. Does not order. |

`place_order` is never listed on VoiceGate. `voicegate.tools.json` is the only pass-through list.

## Run

```bash
npm install
npm run cafe
npm run proxy
```

Open `http://127.0.0.1:3002/` in Chrome or Edge. Allow the mic, or type: two pizzas → 8.30 → Make it three → Yes.

```bash
npm run check
npm run check:proxy
npm run check:page
```
