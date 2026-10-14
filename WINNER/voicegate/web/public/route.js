const ONES = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS = {
  twenty: 20,
  thirty: 30,
  forty: 40,
};

const NUMBER_WORD =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty";

const NUMBER_RE = new RegExp(`\\b(\\d{1,2}|${NUMBER_WORD})(?:-(one|two|three|four|five|six|seven|eight|nine))?\\b`, "gi");

function wordValue(token) {
  const lower = token.toLowerCase();
  if (ONES[lower]) {
    return ONES[lower];
  }
  if (TENS[lower]) {
    return TENS[lower];
  }
  return null;
}

export function scanQuantity(line) {
  let value = null;
  let outOfRange = false;
  for (const match of line.matchAll(NUMBER_RE)) {
    const head = match[1] ?? "";
    const tail = match[2];
    const parsed = /^\d+$/.test(head) ? Number(head) : wordValue(head);
    const extra = tail ? wordValue(tail) : 0;
    const quantity = parsed === null ? null : parsed + (extra ?? 0);
    if (quantity === null) {
      continue;
    }
    if (quantity < 1 || quantity > 40) {
      outOfRange = true;
      continue;
    }
    value = quantity;
    outOfRange = false;
  }
  return { value, outOfRange };
}

function miss(error) {
  return { ok: false, error };
}

function call(name, args) {
  return { ok: true, name, arguments: args };
}

export function pendingIdFrom(text) {
  const match = /Pending (\d+)\./.exec(text);
  return match?.[1] ?? null;
}

export function routeLine(line, pendingId) {
  const text = line.trim().toLowerCase().replace(/[.!?]+$/g, "").replace(/\s+/g, " ");
  if (!text) {
    return miss("Type a line first.");
  }

  const { value: quantity, outOfRange } = scanQuantity(text);
  const cancelOrder = /\bcancel order\s+(\d+)\b/.exec(text);
  if (cancelOrder?.[1]) {
    return call("prepare_action", { tool: "cancel_order", orderId: cancelOrder[1] });
  }

  if (/\bget[_ ]order\b/.test(text)) {
    if (quantity === null) {
      return miss(outOfRange ? "Say a number from one to forty." : "Say how many pizzas.");
    }
    return call("prepare_action", { tool: "get_order", quantity });
  }

  const orderVerb = /\b(order|make it|make that|change it to|change to)\b/.test(text);
  if (!orderVerb && quantity === null && /\b(hour|hours|open|opening)\b/.test(text)) {
    return call("get_hours", {});
  }
  if (!orderVerb && quantity === null && /\b(menu|price|prices|cost|how much)\b/.test(text)) {
    return call("get_menu", {});
  }
  if (!orderVerb && quantity === null && /\b(audit|log)\b/.test(text)) {
    return call("get_audit_log", {});
  }

  const mentionsPizza = /\bpizzas?\b/.test(text);
  if (orderVerb || mentionsPizza) {
    if (quantity === null) {
      return miss(outOfRange ? "Say a number from one to forty." : "Say how many pizzas.");
    }
    return call("prepare_action", { tool: "place_order", quantity });
  }

  if (/\bconfirm\b/.test(text) || /^(yes|yeah|yep)$/.test(text)) {
    if (!pendingId) {
      return miss("Nothing is waiting. Prepare an order first.");
    }
    return call("confirm_action", { pendingId });
  }

  if (/^(cancel|cancel it|no|nope|never mind|nevermind|stop)$/.test(text)) {
    if (!pendingId) {
      return miss("Nothing is waiting.");
    }
    return call("cancel_action", { pendingId });
  }

  return miss("Try hours, two pizzas, make it three, confirm, or cancel.");
}
