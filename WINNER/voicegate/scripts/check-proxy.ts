import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Server } from "node:http";
import { CAFE_HOURS } from "../cafe-server/src/hours.js";
import { startCafeServer } from "../cafe-server/src/index.js";
import { MENU_TEXT, readOrders, writeOrders } from "../cafe-server/src/orders.js";
import { clearAudit } from "../proxy/src/audit.js";
import { toolText } from "../proxy/src/cafe-client.js";
import { clearLast } from "../proxy/src/last.js";
import { clearPending } from "../proxy/src/pending.js";
import { startVoiceGate } from "../proxy/src/index.js";

function textOf(result: { content: unknown }): string {
  return toolText(result);
}

function pendingIdFrom(text: string): string {
  const match = /Pending (\d+)\./.exec(text);
  if (!match?.[1]) {
    throw new Error(`no pending id in: ${text}`);
  }
  return match[1];
}

writeOrders([]);
clearPending();
clearLast();

const cafeUrl = "http://127.0.0.1:3001/mcp";
const cafe = await startCafeServer(3001);
const proxy = await startVoiceGate(3002, cafeUrl);
const client = new Client({ name: "voicegate-check", version: "0.1.0" });
const transport = new StreamableHTTPClientTransport(new URL("http://127.0.0.1:3002/mcp"));

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

try {
  await client.connect(transport);
  const protocolVersion = transport.protocolVersion;
  if (!protocolVersion || protocolVersion < "2025-11-25") {
    throw new Error(`protocol ${protocolVersion ?? "unknown"} is older than 2025-11-25`);
  }

  const names = (await client.listTools()).tools.map((tool) => tool.name).sort();
  const expected = [
    "cancel_action",
    "confirm_action",
    "get_audit_log",
    "get_hours",
    "get_menu",
    "prepare_action",
    "undo_last_action",
  ];
  if (names.join() !== expected.join()) {
    throw new Error(`proxy exposed the wrong tools: ${names.join(", ")}`);
  }

  const hours = textOf(await client.callTool({ name: "get_hours", arguments: {} }));
  if (hours !== CAFE_HOURS || readOrders().length !== 0) {
    throw new Error(`get_hours did not pass through: ${hours}`);
  }

  const menu = textOf(await client.callTool({ name: "get_menu", arguments: {} }));
  if (menu !== MENU_TEXT) {
    throw new Error(`get_menu did not pass through: ${menu}`);
  }

  const asked = textOf(
    await client.callTool({ name: "prepare_action", arguments: { tool: "place_order", quantity: 2 } }),
  );
  const askedId = pendingIdFrom(asked);
  if (!asked.includes("Two pizzas, six dollars. What time?") || readOrders().length !== 0) {
    throw new Error(`prepare did not ask for a time: ${asked}`);
  }
  const tooSoon = textOf(await client.callTool({ name: "confirm_action", arguments: { pendingId: askedId } }));
  if (!tooSoon.includes("Say a time first") || readOrders().length !== 0) {
    throw new Error(`confirm ran before a time was set: ${tooSoon}`);
  }
  const prepared = textOf(
    await client.callTool({ name: "prepare_action", arguments: { tool: "place_order", when: "seven" } }),
  );
  const pendingId = pendingIdFrom(prepared);
  if (!prepared.includes("Two pizzas, six dollars, at seven. Say confirm or cancel.") || readOrders().length !== 0) {
    throw new Error(`prepare did not read the order back: ${prepared}`);
  }

  const confirmed = textOf(await client.callTool({ name: "confirm_action", arguments: { pendingId } }));
  if (!confirmed.includes("Two pizzas, six dollars.") || readOrders().length !== 1) {
    throw new Error(`confirm did not place the order: ${confirmed}`);
  }

  const second = textOf(await client.callTool({ name: "confirm_action", arguments: { pendingId } }));
  if (!second.includes("No pending action") || readOrders().length !== 1) {
    throw new Error(`confirm was accepted twice: ${second}`);
  }

  const orderId = /^Order (\d+) placed\./.exec(confirmed)?.[1];
  if (!orderId) {
    throw new Error(`no cafe order id in: ${confirmed}`);
  }
  const prepareCancel = textOf(
    await client.callTool({ name: "prepare_action", arguments: { tool: "cancel_order", orderId } }),
  );
  if (readOrders().length !== 1) {
    throw new Error("prepare cancel changed the order file");
  }
  const cancelPendingId = pendingIdFrom(prepareCancel);
  const cancelled = textOf(await client.callTool({ name: "confirm_action", arguments: { pendingId: cancelPendingId } }));
  if (!cancelled.includes("cancelled") || readOrders().length !== 0) {
    throw new Error(`confirm cancel failed: ${cancelled}`);
  }

  const trap = textOf(
    await client.callTool({ name: "prepare_action", arguments: { tool: "get_order", quantity: 20 } }),
  );
  const trapId = pendingIdFrom(trap);
  if (!trap.includes("Twenty pizzas, sixty dollars. What time?") || !trap.includes("looks read-only") || readOrders().length !== 0) {
    throw new Error(`get_order trap was sent to the cafe: ${trap}`);
  }
  const dropped = textOf(await client.callTool({ name: "cancel_action", arguments: { pendingId: trapId } }));
  if (dropped !== "Cancelled. Nothing was ordered." || readOrders().length !== 0) {
    throw new Error(`cancel_action failed: ${dropped}`);
  }

  clearAudit();
  const twenty = textOf(
    await client.callTool({ name: "prepare_action", arguments: { tool: "place_order", quantity: 20 } }),
  );
  pendingIdFrom(twenty);
  const timedTwenty = textOf(
    await client.callTool({ name: "prepare_action", arguments: { tool: "place_order", when: "seven" } }),
  );
  const timedTwentyId = pendingIdFrom(timedTwenty);
  const corrected = textOf(
    await client.callTool({ name: "prepare_action", arguments: { tool: "place_order", quantity: 3 } }),
  );
  const threeId = pendingIdFrom(corrected);
  if (
    timedTwentyId === threeId ||
    !corrected.includes("Three pizzas, nine dollars, at seven.") ||
    !corrected.includes(`Replaced pending ${timedTwentyId}.`) ||
    readOrders().length !== 0
  ) {
    throw new Error(`correction did not replace the pending order: ${corrected}`);
  }
  const stale = textOf(await client.callTool({ name: "confirm_action", arguments: { pendingId: timedTwentyId } }));
  if (!stale.includes("No pending action") || readOrders().length !== 0) {
    throw new Error(`old pending id still confirmed: ${stale}`);
  }
  const threeConfirmed = textOf(await client.callTool({ name: "confirm_action", arguments: { pendingId: threeId } }));
  const orders = readOrders();
  if (!threeConfirmed.includes("Three pizzas, nine dollars.") || orders.length !== 1 || orders[0]?.quantity !== 3) {
    throw new Error(`correction confirm failed: ${threeConfirmed}`);
  }
  const log = textOf(await client.callTool({ name: "get_audit_log", arguments: {} }));
  const preparedLines = log.split("\n").filter((line) => line.startsWith("prepared place_order"));
  const confirmedLines = log.split("\n").filter((line) => line.startsWith("confirmed place_order"));
  if (preparedLines.length !== 3 || confirmedLines.length !== 1 || !log.includes("quantity 20") || !log.includes("quantity 3")) {
    throw new Error(`audit log is wrong:\n${log}`);
  }
  const cleanupId = pendingIdFrom(
    textOf(
      await client.callTool({
        name: "prepare_action",
        arguments: { tool: "cancel_order", orderId: orders[0].id },
      }),
    ),
  );
  await client.callTool({ name: "confirm_action", arguments: { pendingId: cleanupId } });
  if (readOrders().length !== 0) {
    throw new Error("failed to clean up the corrected order");
  }

  let hidden = false;
  try {
    const direct = await client.callTool({ name: "place_order", arguments: { quantity: 2 } });
    hidden = direct.isError === true;
  } catch {
    hidden = true;
  }
  const over = textOf(
    await client.callTool({ name: "prepare_action", arguments: { tool: "place_order", quantity: 40 } }),
  );
  if (!over.includes("household limit") || readOrders().length !== 0) {
    throw new Error(`over-limit prepare failed: ${over}`);
  }

  const undoPrep = pendingIdFrom(
    textOf(
      await client.callTool({
        name: "prepare_action",
        arguments: { tool: "place_order", quantity: 2, when: "seven" },
      }),
    ),
  );
  await client.callTool({ name: "confirm_action", arguments: { pendingId: undoPrep } });
  if (readOrders().length !== 1) {
    throw new Error("undo setup did not place an order");
  }
  const undone = textOf(await client.callTool({ name: "undo_last_action", arguments: {} }));
  if (!undone.includes("Undone") || readOrders().length !== 0) {
    throw new Error(`undo failed: ${undone}`);
  }

  if (!hidden || readOrders().length !== 0) {
    throw new Error("place_order was callable on VoiceGate");
  }

  console.log(`protocol: ${protocolVersion}`);
  console.log(`tools: ${names.join(", ")}`);
  console.log(`get_hours: ${hours}`);
  console.log(`prepare: ${prepared.replaceAll("\n", " | ")}`);
  console.log(`confirm: ${confirmed}`);
  console.log(`confirm again: ${second}`);
  console.log(`cancel confirmed: ${cancelled}`);
  console.log(`trap: ${trap.replaceAll("\n", " | ")}`);
  console.log(`trap cancelled: ${dropped}`);
  console.log(`correction: ${corrected.replaceAll("\n", " | ")}`);
  console.log(`correction confirm: ${threeConfirmed}`);
  console.log(`audit:\n${log}`);
  console.log("place_order is hidden");
  console.log("orders file is empty again");
} finally {
  await client.close().catch(() => undefined);
  await close(proxy);
  await close(cafe);
}
