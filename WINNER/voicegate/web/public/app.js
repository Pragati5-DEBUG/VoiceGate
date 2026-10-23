import { createMcpClient } from "./mcp.js";
import { pendingIdFrom, routeLine } from "./route.js";

const status = document.querySelector("#status");
const pending = document.querySelector("#pending");
const hint = document.querySelector("#hint");
const cardKicker = document.querySelector("#card-kicker");
const readback = document.querySelector("#readback");
const heard = document.querySelector("#heard");
const stageLabel = document.querySelector("#stage-label");
const orb = document.querySelector("#orb");
const lightbar = document.querySelector("#lightbar");
const orderCard = document.querySelector("#order-card");
const cardTitle = document.querySelector("#card-title");
const cardMeta = document.querySelector("#card-meta");
const log = document.querySelector("#log");
const audit = document.querySelector("#audit");
const form = document.querySelector("#composer");
const line = document.querySelector("#line");
const mic = document.querySelector("#mic");
const clock = document.querySelector("#clock");
const confirmButton = document.querySelector("#confirm");
const cancelButton = document.querySelector("#cancel");
const buttons = [...document.querySelectorAll("[data-act]")];
const lineOut = document.querySelector("#line-out");
const sessionLive = document.querySelector("#session-live");
const proxyPrepare = document.querySelector("#proxy-prepare");
const proxyPrepareState = document.querySelector("#proxy-prepare-state");
const proxyPrepareDetail = document.querySelector("#proxy-prepare-detail");
const proxyTime = document.querySelector("#proxy-time");
const proxyTimeState = document.querySelector("#proxy-time-state");
const proxyTimeDetail = document.querySelector("#proxy-time-detail");
const proxyConfirm = document.querySelector("#proxy-confirm");
const proxyConfirmState = document.querySelector("#proxy-confirm-state");
const proxyConfirmDetail = document.querySelector("#proxy-confirm-detail");

const client = createMcpClient();
let pendingId = null;
let lastQuantity = null;
let needsTime = false;
let busy = false;
let recognition = null;
let listenSubmitted = false;

function tickClock() {
  clock.textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

tickClock();
setInterval(tickClock, 15_000);

function speakableFrom(text) {
  if (!text) {
    return "No reply.";
  }
  const cleaned = text
    .replace(/\nPending \d+\./g, "")
    .replace(/\nReplaced pending \d+\./g, "")
    .replace(/\nThis tool looks like a question, but it would place an order\./g, "")
    .trim();
  return cleaned || text.trim();
}

function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  const prefer = [
    /google us english/i,
    /microsoft aria/i,
    /microsoft jenny/i,
    /microsoft zira/i,
    /samantha/i,
    /en-us/i,
  ];
  for (const test of prefer) {
    const found = voices.find((voice) => test.test(`${voice.name} ${voice.lang}`));
    if (found) {
      return found;
    }
  }
  return voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ?? voices[0] ?? null;
}

window.speechSynthesis?.addEventListener("voiceschanged", () => {
  pickVoice();
});

function unlockSpeech() {
  if (!window.speechSynthesis) {
    return;
  }
  window.speechSynthesis.cancel();
  window.speechSynthesis.resume();
  const warm = new SpeechSynthesisUtterance(".");
  warm.volume = 0;
  warm.rate = 10;
  window.speechSynthesis.speak(warm);
}

function speak(text) {
  if (!window.speechSynthesis || !text) {
    return;
  }
  window.speechSynthesis.cancel();
  window.speechSynthesis.resume();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = "en-US";
  }
  utterance.rate = 0.88;
  utterance.pitch = 1;
  utterance.volume = 1;
  utterance.addEventListener("start", () => {
    document.body.classList.add("is-talking");
    stageLabel.textContent = "Speaking";
  });
  const done = () => document.body.classList.remove("is-talking");
  utterance.addEventListener("end", done);
  utterance.addEventListener("error", done);
  window.speechSynthesis.speak(utterance);
}

function setBusy(next) {
  busy = next;
  for (const button of buttons) {
    button.disabled = next;
  }
  const go = form.querySelector('button[type="submit"]');
  if (go) {
    go.disabled = next;
  }
  line.disabled = next;
  mic.disabled = next;
  paintPending();
}

function setOrb(state) {
  orb.dataset.state = state;
  lightbar.dataset.state = state;
}

function paintCard(display, waiting) {
  if (!waiting) {
    orderCard.hidden = true;
    return;
  }
  const first = display.split(/[.!?]/)[0]?.trim() || "Pending order";
  cardTitle.textContent = first;
  if (needsTime) {
    cardKicker.textContent = "Need a time";
    cardMeta.textContent = "Say 8.30 or seven. This is not a pizza count. Fake money only.";
  } else {
    cardKicker.textContent = "Hold — nothing placed yet";
    cardMeta.textContent = "Yes places it. No drops it. Fake money only.";
  }
  orderCard.hidden = false;
}

function setLine(text) {
  const raw = (text || "How can I help?").replace(/\s+/g, " ").trim();
  const one = raw.match(/^[^.!?]+[.!?]?/)?.[0]?.trim() || raw;
  if (lineOut) {
    lineOut.textContent = one;
  }
  readback.textContent = raw;
}

function paintProxy() {
  if (!proxyPrepare || !sessionLive) {
    return;
  }
  if (sessionLive) {
    if (document.body.classList.contains("is-listening")) {
      sessionLive.textContent = "Listening";
    } else if (document.body.classList.contains("is-talking")) {
      sessionLive.textContent = "Speaking";
    } else if (pendingId && needsTime) {
      sessionLive.textContent = "Waiting";
    } else if (pendingId) {
      sessionLive.textContent = "Confirm";
    } else {
      sessionLive.textContent = "Idle";
    }
  }
  if (pendingId) {
    proxyPrepare.dataset.state = "held";
    proxyPrepareState.textContent = "Held for confirmation";
    proxyPrepareDetail.textContent = needsTime
      ? "Read back to customer, awaiting a time"
      : "Read back to customer, awaiting reply";
    proxyTime.dataset.state = needsTime ? "held" : "done";
    proxyTimeState.textContent = needsTime ? "Needed" : "Set";
    proxyTimeDetail.textContent = needsTime ? "Say a time, like eight thirty." : "Time is on the pending order.";
    proxyConfirm.dataset.state = needsTime ? "idle" : "ready";
    proxyConfirmState.textContent = needsTime ? "Blocked" : "Ready";
    proxyConfirmDetail.textContent = needsTime
      ? "Nothing is placed until the customer confirms."
      : "Say yes to place it, or no to cancel.";
  } else {
    proxyPrepare.dataset.state = "idle";
    proxyPrepareState.textContent = "Waiting";
    proxyPrepareDetail.textContent = "Nothing is held yet.";
    proxyTime.dataset.state = "idle";
    proxyTimeState.textContent = "Needed";
    proxyTimeDetail.textContent = "Say a time after the order.";
    proxyConfirm.dataset.state = "idle";
    proxyConfirmState.textContent = "Blocked";
    proxyConfirmDetail.textContent = "Nothing is placed until the customer confirms.";
  }
}

function paintPending() {
  const live = document.body.classList.contains("is-listening") || document.body.classList.contains("is-talking");
  const atHome = !busy && !pendingId && !heard.textContent && !live;
  document.body.classList.toggle("is-waiting", Boolean(pendingId));
  document.body.classList.toggle("is-home", atHome);
  if (atHome) {
    document.body.dataset.step = "home";
    hint.textContent = "Say how many pizzas. Nothing is placed yet.";
  } else if (!pendingId) {
    document.body.dataset.step = "order";
    hint.textContent = "Step 1 — say an order, like two pizzas.";
  } else if (needsTime) {
    document.body.dataset.step = "time";
    hint.textContent = "Step 2 — say a time. 8.30 means eight thirty, not eight pizzas.";
  } else {
    document.body.dataset.step = "confirm";
    hint.textContent = "Step 3 — say yes to place it, or no to cancel.";
  }
  if (pendingId) {
    pending.textContent = needsTime ? "Waiting for a time." : `Ready to confirm · pending ${pendingId}.`;
    pending.classList.add("waiting");
    stageLabel.textContent = needsTime ? "What time?" : "Confirm?";
    if (!busy) {
      setOrb("waiting");
    }
  } else {
    pending.textContent = "Nothing is waiting.";
    pending.classList.remove("waiting");
    if (!busy) {
      stageLabel.textContent = "Listening";
      setOrb("idle");
    }
  }
  confirmButton.disabled = busy || !pendingId || needsTime;
  cancelButton.disabled = busy || !pendingId;
  paintProxy();
}

function addTurn(kind, who, text) {
  for (const item of log.querySelectorAll(".latest")) {
    item.classList.remove("latest");
  }
  const item = document.createElement("li");
  item.className = `${kind} latest`;
  const label = document.createElement("span");
  label.className = "who";
  label.textContent = who;
  const said = document.createElement("span");
  said.className = "said";
  said.textContent = text;
  item.append(label, said);
  log.append(item);
}

async function refreshAudit() {
  const result = await client.callTool("get_audit_log", {});
  audit.textContent = result.text || "Audit log is empty.";
}

async function run(youSaid, name, args) {
  heard.textContent = youSaid;
  document.body.classList.remove("is-home");
  addTurn("you", "You", youSaid);
  setBusy(true);
  setOrb("busy");
  stageLabel.textContent = "Thinking";
  try {
    const result = await client.callTool(name, args);
    if (typeof args.quantity === "number") {
      lastQuantity = args.quantity;
    }
    const found = pendingIdFrom(result.text);
    if (found) {
      pendingId = found;
    }
    if (name === "confirm_action" || name === "cancel_action") {
      pendingId = null;
      needsTime = false;
    } else if (found) {
      needsTime = /\bWhat time\?/.test(result.text);
    }
    const display = speakableFrom(result.text);
    setLine(display);
    paintCard(display, Boolean(pendingId));
    const kind = result.isError ? "gate bad" : "gate";
    addTurn(kind, `VoiceGate · ${name}`, result.text || "No reply.");
    if (!result.isError) {
      speak(display);
    }
    if (name === "confirm_action" && !result.isError) {
      setOrb("done");
      stageLabel.textContent = "Done";
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "The call failed.";
    setLine(message);
    paintCard("", false);
    addTurn("gate bad", "VoiceGate", message);
    speak(message);
  } finally {
    try {
      await refreshAudit();
    } catch {
      audit.textContent = "The audit log could not be read.";
    }
    setBusy(false);
    line.focus();
  }
}

const actions = {
  hours: ["What time do you open?", "get_hours", {}],
  menu: ["What's on the menu?", "get_menu", {}],
  two: ["Two pizzas.", "prepare_action", { tool: "place_order", quantity: 2 }],
  three: ["No, make it three.", "prepare_action", { tool: "place_order", quantity: 3 }],
  twenty: ["Twenty pizzas.", "prepare_action", { tool: "place_order", quantity: 20 }],
  seven: ["At seven.", "prepare_action", { tool: "place_order", when: "seven" }],
  half: ["Eight thirty.", "prepare_action", { tool: "place_order", when: "eight thirty" }],
  forty: ["Forty pizzas.", "prepare_action", { tool: "place_order", quantity: 40 }],
  undo: ["Undo.", "undo_last_action", {}],
  trap: ["Get order of two.", "prepare_action", { tool: "get_order", quantity: 2 }],
};

function submitLine(text) {
  const routed = routeLine(text, pendingId, lastQuantity, needsTime);
  if (!routed.ok) {
    heard.textContent = text.trim() || "…";
    addTurn("you", "You", text.trim() || "…");
    setLine(routed.error);
    paintCard("", false);
    addTurn("gate bad", "VoiceGate", routed.error);
    speak(routed.error);
    return;
  }
  void run(text.trim(), routed.name, routed.arguments);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (busy) {
    return;
  }
  const text = line.value;
  line.value = "";
  submitLine(text);
});

for (const button of buttons) {
  button.addEventListener("click", () => {
    if (busy) {
      return;
    }
    const act = button.dataset.act;
    if (act === "confirm") {
      const routed = routeLine("confirm", pendingId, lastQuantity, needsTime);
      if (!routed.ok) {
        setLine(routed.error);
        addTurn("gate bad", "VoiceGate", routed.error);
        return;
      }
      void run("Yes.", routed.name, routed.arguments);
      return;
    }
    if (act === "cancel") {
      const routed = routeLine("cancel", pendingId, lastQuantity, needsTime);
      if (!routed.ok) {
        setLine(routed.error);
        addTurn("gate bad", "VoiceGate", routed.error);
        return;
      }
      void run("No.", routed.name, routed.arguments);
      return;
    }
    const action = actions[act];
    if (!action) {
      return;
    }
    void run(action[0], action[1], action[2]);
  });
}

function getRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    return null;
  }
  if (recognition) {
    return recognition;
  }
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.addEventListener("result", (event) => {
    let transcript = "";
    for (const result of event.results) {
      transcript += result[0]?.transcript ?? "";
    }
    transcript = transcript.trim();
    if (transcript) {
      heard.textContent = transcript;
    }
    const last = event.results[event.results.length - 1];
    if (last?.isFinal && transcript && !listenSubmitted) {
      listenSubmitted = true;
      line.value = transcript;
      document.body.classList.remove("is-listening");
      mic.classList.remove("listening");
      submitLine(transcript);
    }
  });
  recognition.addEventListener("end", () => {
    mic.classList.remove("listening");
    document.body.classList.remove("is-listening");
    const leftover = heard.textContent.trim();
    if (!listenSubmitted && leftover && !busy) {
      listenSubmitted = true;
      submitLine(leftover);
      return;
    }
    paintPending();
  });
  recognition.addEventListener("error", (event) => {
    mic.classList.remove("listening");
    document.body.classList.remove("is-listening");
    const err = event.error;
    if (err === "no-speech" || err === "aborted") {
      paintPending();
      return;
    }
    if (err === "not-allowed") {
      setLine("Allow the microphone, then type if Chrome still blocks it.");
    } else {
      setLine("Mic failed. Type two pizzas in the box instead.");
    }
    line.focus();
    paintPending();
  });
  return recognition;
}

mic.addEventListener("click", () => {
  if (busy) {
    return;
  }
  const engine = getRecognition();
  if (!engine) {
    setLine("Mic is not in this browser. Type two pizzas, then Go.");
    line.focus();
    return;
  }
  try {
    unlockSpeech();
    listenSubmitted = false;
    mic.classList.add("listening");
    document.body.classList.add("is-listening");
    document.body.classList.remove("is-home");
    heard.textContent = "";
    stageLabel.textContent = "Listening";
    setOrb("busy");
    paintPending();
    engine.start();
  } catch {
    mic.classList.remove("listening");
    document.body.classList.remove("is-listening");
    paintPending();
  }
});

paintPending();
paintCard("", false);

try {
  const session = await client.connect();
  const names = session.tools.slice().sort().join(", ");
  status.textContent = `On · ${session.protocolVersion}`;
  status.title = names;
  await refreshAudit();
} catch (error) {
  status.textContent = "Offline — start cafe, then VoiceGate";
  setLine(error instanceof Error ? error.message : "Could not connect.");
  addTurn("gate bad", "VoiceGate", error instanceof Error ? error.message : "Could not connect.");
}
