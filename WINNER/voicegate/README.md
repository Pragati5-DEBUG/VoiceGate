# VoiceGate

A trust layer that reads an order back and waits for confirm before anything is placed.

This folder has two MCP servers. The cafe takes fake pizza orders. VoiceGate sits in front of it. Pizza is three dollars. Money is fake.

Talk to VoiceGate at `http://127.0.0.1:3002/mcp`, not to the cafe. The chat page at `http://127.0.0.1:3002/` is a real MCP client: it calls `initialize`, `tools/list`, and `tools/call`. VoiceGate shows `get_hours`, `get_menu`, `prepare_action`, `confirm_action`, `cancel_action`, and `get_audit_log`. It does not show `place_order`.

| You ask VoiceGate | What happens |
| --- | --- |
| `get_hours` or `get_menu` | The question is passed to the cafe. |
| `prepare_action` for `place_order` or `get_order` | VoiceGate reads the order back and waits. The cafe is not called. |
| `confirm_action` with the pending id | The cafe is called once. The same id does not work again. |
| `prepare_action` again while one is waiting | The new readback replaces the old one. The old pending id dies. |
| `get_audit_log` | Shows each prepare and confirm. It does not place an order. |

The cafe, if you talk to it directly, still has these tools:

| Cafe tool | What it does |
| --- | --- |
| `get_hours` | Says when the cafe is open. Does not touch orders. |
| `get_menu` | Says the price. Does not touch orders. |
| `place_order` | Writes a pizza order to `data/orders.json`. |
| `cancel_order` | Removes an order by id. |
| `get_order` | A trap. The name looks like a question, but it places an order and charges the fake card. |

`voicegate.tools.json` lists the only tools a later confirm step may let through: `get_hours` and `get_menu`. `get_order` is left off that list on purpose.

## Run the checks

```bash
npm install
npm run check
npm run check:proxy
```

`npm run check` talks to the cafe directly: it places two pizzas, cancels them, and proves `get_order` still writes an order.

`npm run check:proxy` talks to VoiceGate. Prepare reads an order back and does not place it. Confirm places it once. Cancel drops it.

`npm run check:page` loads the chat page and drives it with the same client the browser uses.

## Run the servers

Start the cafe first, then VoiceGate:

```bash
npm run cafe
npm run proxy
```

The cafe listens on `http://127.0.0.1:3001/mcp`. VoiceGate listens on `http://127.0.0.1:3002/mcp`. Open `http://127.0.0.1:3002/` and type an order, or use the buttons. Point [MCP Inspector](https://github.com/modelcontextprotocol/inspector) at VoiceGate if you want the raw tools:

```bash
npx @modelcontextprotocol/inspector
```

Choose Streamable HTTP and connect to `http://127.0.0.1:3002/mcp`. `place_order` is not in the tool list. Call `prepare_action` with tool `place_order` and quantity `2`. The reply reads the order back and ends with a pending id. Call `confirm_action` with that id to place it, or `cancel_action` to drop it.
