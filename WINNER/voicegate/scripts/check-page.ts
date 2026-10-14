import type { Server } from "node:http";
import { CAFE_HOURS } from "../cafe-server/src/hours.js";
import { startCafeServer } from "../cafe-server/src/index.js";
import { readOrders, writeOrders } from "../cafe-server/src/orders.js";
import { clearAudit } from "../proxy/src/audit.js";
import { clearPending } from "../proxy/src/pending.js";
import { startVoiceGate } from "../proxy/src/index.js";
import { createMcpClient } from "../web/public/mcp.js";
import { pendingIdFrom, routeLine } from "../web/public/route.js";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function expectCall(line: string, pendingId: string | null, name: string, args: Record<string, unknown>): void {
  const routed = routeLine(line, pendingId);
  assert(routed.ok, `${line} should route, got ${JSON.stringify(routed)}`);
  if (!routed.ok) {
    return;
  }
  assert(routed.name === name, `${line} called ${routed.name}`);
  assert(JSON.stringify(routed.arguments) === JSON.stringify(args), `${line} args ${JSON.stringify(routed.arguments)}`);
}

expectCall("two pizzas", null, "prepare_action", { tool: "place_order", quantity: 2 });
expectCall("No, make it three.", "4", "prepare_action", { tool: "place_order", quantity: 3 });
expectCall("twenty pizzas", null, "prepare_action", { tool: "place_order", quantity: 20 });
expectCall("what time do you open?", null, "get_hours", {});
expectCall("how much is pizza?", null, "get_menu", {});
expectCall("confirm", "5", "confirm_action", { pendingId: "5" });
expectCall("cancel", "5", "cancel_action", { pendingId: "5" });
expectCall("cancel order 1001", null, "prepare_action", { tool: "cancel_order", orderId: "1001" });
expectCall("get order of twenty", null, "prepare_action", { tool: "get_order", quantity: 20 });

const confirmMissing = routeLine("confirm", null);
assert(!confirmMissing.ok && confirmMissing.error.includes("Nothing is waiting"), "confirm without a pending id should stop");
const unknown = routeLine("hello", null);
assert(!unknown.ok, "hello should not call a tool");
assert(pendingIdFrom("Twenty pizzas.\nPending 4.\nReplaced pending 3.") === "4", "pending id parse failed");

writeOrders([]);
clearPending();
clearAudit();

const cafePort = 3011;
const pagePort = 3012;
const cafeUrl = `http://127.0.0.1:${cafePort}/mcp`;
const pageUrl = `http://127.0.0.1:${pagePort}`;

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

const cafe = await startCafeServer(cafePort);
const proxy = await startVoiceGate(pagePort, cafeUrl);

try {
  const page = await fetch(`${pageUrl}/`);
  const html = await page.text();
  assert(page.ok && html.includes("VoiceGate") && html.includes('id="line"'), "chat page did not load");

  const blocked = await fetch(`${pageUrl}/mcp`);
  assert(blocked.status === 405, `GET /mcp returned ${blocked.status}`);

  const client = createMcpClient(pageUrl);
  const session = await client.connect();
  assert(session.protocolVersion >= "2025-11-25", `protocol ${session.protocolVersion}`);
  assert(!session.tools.includes("place_order"), "place_order was listed on the page client");
  assert(session.tools.includes("prepare_action") && session.tools.includes("confirm_action"), "page client missed tools");

  const prepared = await client.callTool("prepare_action", { tool: "place_order", quantity: 20 });
  const twentyId = pendingIdFrom(prepared.text);
  assert(
    !prepared.isError &&
      twentyId !== null &&
      prepared.text.includes("Twenty pizzas, sixty dollars, at seven. Say confirm or cancel.") &&
      readOrders().length === 0,
    `prepare from the page client failed: ${prepared.text}`,
  );

  const corrected = await client.callTool("prepare_action", { tool: "place_order", quantity: 3 });
  const threeId = pendingIdFrom(corrected.text);
  assert(
    threeId !== null &&
      threeId !== twentyId &&
      corrected.text.includes("Three pizzas, nine dollars, at seven.") &&
      corrected.text.includes(`Replaced pending ${twentyId}.`) &&
      readOrders().length === 0,
    `correction from the page client failed: ${corrected.text}`,
  );

  const stale = await client.callTool("confirm_action", { pendingId: twentyId });
  assert(stale.isError && stale.text.includes("No pending action") && readOrders().length === 0, `old id confirmed: ${stale.text}`);

  const confirmed = await client.callTool("confirm_action", { pendingId: threeId });
  const orders = readOrders();
  assert(
    !confirmed.isError && confirmed.text.includes("Three pizzas, nine dollars.") && orders.length === 1 && orders[0]?.quantity === 3,
    `confirm from the page client failed: ${confirmed.text}`,
  );

  const hours = await client.callTool("get_hours", {});
  assert(hours.text === CAFE_HOURS && readOrders().length === 1, `hours failed: ${hours.text}`);

  const orderId = orders[0]?.id;
  if (!orderId) {
    throw new Error("missing order id");
  }
  const prepareCancel = await client.callTool("prepare_action", { tool: "cancel_order", orderId });
  const cancelId = pendingIdFrom(prepareCancel.text);
  if (!cancelId) {
    throw new Error(`no cancel pending id: ${prepareCancel.text}`);
  }
  await client.callTool("confirm_action", { pendingId: cancelId });
  assert(readOrders().length === 0, "page client left an order behind");

  const log = await client.callTool("get_audit_log", {});
  assert(log.text.includes("quantity 20") && log.text.includes("quantity 3") && log.text.includes("confirmed place_order"), `audit:\n${log.text}`);

  console.log(`page: ${pageUrl}/`);
  console.log(`protocol: ${session.protocolVersion}`);
  console.log(`tools: ${session.tools.slice().sort().join(", ")}`);
  console.log(`prepare: ${prepared.text.replaceAll("\n", " | ")}`);
  console.log(`correction: ${corrected.text.replaceAll("\n", " | ")}`);
  console.log(`confirm: ${confirmed.text}`);
  console.log("chat page client placed nothing until confirm");
} finally {
  writeOrders([]);
  clearPending();
  await close(proxy);
  await close(cafe);
}
