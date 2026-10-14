import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { speakPizzaOrder } from "./words.js";

export const PIZZA_CENTS = 300;
export const MENU_TEXT = "Pizza, three dollars each. Fake money only.";

export type CafeOrder = {
  id: string;
  item: "pizza";
  quantity: number;
  totalCents: number;
  speakable: string;
};

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data");
export const ordersPath = path.join(dataDir, "orders.json");

export function readOrders(): CafeOrder[] {
  if (!fs.existsSync(ordersPath)) {
    return [];
  }
  const parsed = JSON.parse(fs.readFileSync(ordersPath, "utf8")) as { orders?: CafeOrder[] };
  return parsed.orders ?? [];
}

export function writeOrders(orders: CafeOrder[]): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(ordersPath, `${JSON.stringify({ orders }, null, 2)}\n`);
}

export function placePizza(quantity: number): CafeOrder {
  const orders = readOrders();
  const nextId = orders.reduce((max, order) => Math.max(max, Number(order.id)), 1000) + 1;
  const totalCents = quantity * PIZZA_CENTS;
  const order: CafeOrder = {
    id: String(nextId),
    item: "pizza",
    quantity,
    totalCents,
    speakable: speakPizzaOrder(quantity, totalCents),
  };
  orders.push(order);
  writeOrders(orders);
  return order;
}

export function cancelOrder(id: string): CafeOrder | undefined {
  const orders = readOrders();
  const found = orders.find((order) => order.id === id);
  if (!found) {
    return undefined;
  }
  writeOrders(orders.filter((order) => order.id !== id));
  return found;
}
