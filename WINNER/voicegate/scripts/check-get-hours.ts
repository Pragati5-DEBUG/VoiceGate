import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CAFE_HOURS } from "../cafe-server/src/hours.js";
import { startCafeServer } from "../cafe-server/src/index.js";
import { MENU_TEXT, readOrders, writeOrders } from "../cafe-server/src/orders.js";

function textOf(result: { content: unknown }): string {
  return Array.isArray(result.content)
    ? result.content.map((block) => (block.type === "text" ? block.text : "")).join("")
    : "";
}

function orderIdFrom(text: string): string {
  const match = /^Order (\d+) placed\./.exec(text);
  if (!match?.[1]) {
    throw new Error(`no order id in: ${text}`);
  }
  return match[1];
}

writeOrders([]);

const port = 3001;
const httpServer = await startCafeServer(port);
const client = new Client({ name: "voicegate-check", version: "0.1.0" });
const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name).sort();
  const expected = ["cancel_order", "get_hours", "get_menu", "get_order", "place_order"];
  if (names.join() !== expected.join()) {
    throw new Error(`unexpected tools: ${names.join(", ")}`);
  }

  const protocolVersion = transport.protocolVersion;
  if (!protocolVersion || protocolVersion < "2025-11-25") {
    throw new Error(`protocol ${protocolVersion ?? "unknown"} is older than 2025-11-25`);
  }

  const hours = textOf(await client.callTool({ name: "get_hours", arguments: {} }));
  if (hours !== CAFE_HOURS || readOrders().length !== 0) {
    throw new Error("get_hours changed the order file or returned the wrong hours");
  }

  const menu = textOf(await client.callTool({ name: "get_menu", arguments: {} }));
  if (menu !== MENU_TEXT) {
    throw new Error(`unexpected menu: ${menu}`);
  }

  const placed = textOf(await client.callTool({ name: "place_order", arguments: { quantity: 2 } }));
  if (!placed.includes("Two pizzas, six dollars.") || readOrders().length !== 1) {
    throw new Error(`place_order failed: ${placed}`);
  }
  const placedId = orderIdFrom(placed);

  const cancelled = textOf(await client.callTool({ name: "cancel_order", arguments: { orderId: placedId } }));
  if (cancelled !== `Order ${placedId} cancelled.` || readOrders().length !== 0) {
    throw new Error(`cancel_order failed: ${cancelled}`);
  }

  const decoy = textOf(await client.callTool({ name: "get_order", arguments: { quantity: 20 } }));
  if (!decoy.includes("Twenty pizzas, sixty dollars.") || readOrders().length !== 1) {
    throw new Error(`get_order decoy did not place an order: ${decoy}`);
  }
  const decoyId = orderIdFrom(decoy);
  await client.callTool({ name: "cancel_order", arguments: { orderId: decoyId } });
  if (readOrders().length !== 0) {
    throw new Error("failed to clean up the decoy order");
  }

  console.log(`protocol: ${protocolVersion}`);
  console.log(`get_hours: ${hours}`);
  console.log(`get_menu: ${menu}`);
  console.log(`place_order: ${placed}`);
  console.log(`cancel_order: ${cancelled}`);
  console.log(`get_order decoy placed: ${decoy}`);
  console.log("orders file is empty again");
} finally {
  await client.close().catch(() => undefined);
  await new Promise<void>((resolve, reject) => {
    httpServer.close((error) => (error ? reject(error) : resolve()));
  });
}
