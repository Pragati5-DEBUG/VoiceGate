import { PIZZA_CENTS } from "../../cafe-server/src/orders.js";
import { speakPizzaOrder } from "../../cafe-server/src/words.js";

export function pizzaReadback(quantity: number, when?: string): string {
  const spoken = speakPizzaOrder(quantity, quantity * PIZZA_CENTS).replace(/\.$/, "");
  if (!when) {
    return `${spoken}. What time?`;
  }
  return `${spoken}, at ${when}. Say confirm or cancel.`;
}

export function cancelReadback(orderId: string): string {
  return `Cancel order ${orderId}. Say confirm or cancel.`;
}
