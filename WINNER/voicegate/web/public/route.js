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

const CLOCK_WORD =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve";

const NUMBER_RE = new RegExp(`\\b(\\d{1,2}|${NUMBER_WORD})(?:-(one|two|three|four|five|six|seven|eight|nine))?\\b`, "gi");
const CLOCK_HM_RE = new RegExp(`\\b(?:at\\s+)?(\\d{1,2}|${CLOCK_WORD})\\s*[.:]\\s*(\\d{2})\\b`, "i");
const CLOCK_WORDS_RE = new RegExp(
  `\\b(?:at\\s+)?(${CLOCK_WORD})\\s+(thirty|fifteen|forty-five|o'?clock)\\b`,
  "i",
);
const HALF_PAST_RE = new RegExp(`\\bhalf past\\s+(${CLOCK_WORD}|\\d{1,2})\\b`, "i");
const WHEN_LINE_RE = new RegExp(`(?:\\bat\\s+|\\b)(\\d{1,2}|${CLOCK_WORD})(?:\\s*(?:o'?clock|am|pm))\\b|\\bat\\s+(\\d{1,2}|${CLOCK_WORD})\\b`, "i");

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

function numberHour(hour) {
  const names = {
    1: "one",
    2: "two",
    3: "three",
    4: "four",
    5: "five",
    6: "six",
    7: "seven",
    8: "eight",
    9: "nine",
    10: "ten",
    11: "eleven",
    12: "twelve",
  };
  return names[hour] ?? null;
}

function hourToken(token) {
  if (/^\d+$/.test(token)) {
    const hour = Number(token);
    if (hour === 0) {
      return "twelve";
    }
    return hour > 12 && hour <= 23 ? numberHour(hour - 12) : numberHour(hour);
  }
  const lower = token.toLowerCase();
  return ONES[lower] && ONES[lower] <= 12 ? lower : null;
}

function minuteWords(value) {
  const small = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty"];
  if (value < 20) {
    return small[value] ?? String(value);
  }
  const tensWord = tens[Math.floor(value / 10)];
  const ones = value % 10;
  return ones === 0 ? tensWord : `${tensWord}-${small[ones]}`;
}

function spokenClock(hourTokenValue, minutes) {
  const hour = hourToken(hourTokenValue);
  if (!hour) {
    return null;
  }
  if (!minutes) {
    return hour;
  }
  return `${hour} ${minuteWords(minutes)}`;
}

export function scanWhen(line) {
  const hm = CLOCK_HM_RE.exec(line);
  if (hm) {
    const minutes = Number(hm[2]);
    if (minutes >= 0 && minutes <= 59) {
      return spokenClock(hm[1], minutes);
    }
  }
  const half = HALF_PAST_RE.exec(line);
  if (half) {
    return spokenClock(half[1], 30);
  }
  const words = CLOCK_WORDS_RE.exec(line);
  if (words) {
    const minutePart = words[2].toLowerCase().replace("o'clock", "").replace("oclock", "");
    if (!minutePart) {
      return spokenClock(words[1], 0);
    }
    const minutes = minutePart === "thirty" ? 30 : minutePart === "fifteen" ? 15 : 45;
    return spokenClock(words[1], minutes);
  }
  const match = WHEN_LINE_RE.exec(line);
  const token = match?.[1] ?? match?.[2];
  if (!token) {
    return null;
  }
  return hourToken(token);
}

function withoutWhen(line) {
  return line
    .replace(CLOCK_HM_RE, " ")
    .replace(HALF_PAST_RE, " ")
    .replace(CLOCK_WORDS_RE, " ")
    .replace(WHEN_LINE_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function routeLine(line, pendingId, lastQuantity = null, needsTime = false) {
  const text = line.trim().toLowerCase().replace(/[.!?]+$/g, "").replace(/\s+/g, " ");
  if (!text) {
    return miss("Type a line first.");
  }

  let when = scanWhen(text);
  if (
    !when &&
    pendingId &&
    /^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})$/.test(text)
  ) {
    when = /^\d+$/.test(text) ? numberHour(Number(text)) : text;
  }
  const { value: quantity, outOfRange } = scanQuantity(withoutWhen(text));
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

  const orderVerb = /\b(order|buy|purchase|get me|i want|i would like|i'd like|id like|make it|make that|change it to|change to)\b/.test(text);
  if (!orderVerb && quantity === null && /\b(hour|hours|open|opening)\b/.test(text)) {
    return call("get_hours", {});
  }
  if (!orderVerb && quantity === null && /\b(menu|price|prices|cost|how much)\b/.test(text)) {
    return call("get_menu", {});
  }
  if (!orderVerb && quantity === null && /\b(audit|log)\b/.test(text)) {
    return call("get_audit_log", {});
  }
  if (/^(undo|undo that|undo it|take it back)$/.test(text)) {
    return call("undo_last_action", {});
  }

  const mentionsPizza = /\bpizzas?\b/.test(text);
  if (needsTime && !mentionsPizza && !orderVerb) {
    if (when) {
      return call("prepare_action", { tool: "place_order", when });
    }
    return miss("Say a time, like eight thirty.");
  }
  if (orderVerb || mentionsPizza) {
    if (quantity === null) {
      return miss(outOfRange ? "Say a number from one to forty." : "Say how many pizzas.");
    }
    return call("prepare_action", when ? { tool: "place_order", quantity, when } : { tool: "place_order", quantity });
  }

  if (when) {
    if (!pendingId && lastQuantity === null) {
      return miss("Say how many pizzas first.");
    }
    return call("prepare_action", { tool: "place_order", when });
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
