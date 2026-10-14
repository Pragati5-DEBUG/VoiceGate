import { createMcpClient } from "./mcp.js";
import { pendingIdFrom, routeLine } from "./route.js";

const status = document.querySelector("#status");
const pending = document.querySelector("#pending");
const log = document.querySelector("#log");
const audit = document.querySelector("#audit");
const form = document.querySelector("#composer");
const line = document.querySelector("#line");
const confirmButton = document.querySelector("#confirm");
const cancelButton = document.querySelector("#cancel");
const buttons = [...document.querySelectorAll("[data-act]")];

const client = createMcpClient();
let pendingId = null;
let busy = false;

function setBusy(next) {
  busy = next;
  for (const button of buttons) {
    button.disabled = next;
  }
  form.querySelector("button").disabled = next;
  line.disabled = next;
  paintPending();
}

function paintPending() {
  if (pendingId) {
    pending.textContent = `Waiting on pending ${pendingId}.`;
    pending.classList.add("waiting");
  } else {
    pending.textContent = "Nothing is waiting.";
    pending.classList.remove("waiting");
  }
  confirmButton.disabled = busy || !pendingId;
  cancelButton.disabled = busy || !pendingId;
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
  item.scrollIntoView({ block: "nearest" });
}

async function refreshAudit() {
  const result = await client.callTool("get_audit_log", {});
  audit.textContent = result.text || "Audit log is empty.";
}

async function run(youSaid, name, args) {
  addTurn("you", "You", youSaid);
  setBusy(true);
  try {
    const result = await client.callTool(name, args);
    const found = pendingIdFrom(result.text);
    if (found) {
      pendingId = found;
    }
    if (name === "confirm_action" || name === "cancel_action") {
      pendingId = null;
    }
    addTurn(result.isError ? "gate bad" : "gate", `VoiceGate · ${name}`, result.text || "No reply.");
  } catch (error) {
    addTurn("gate bad", "VoiceGate", error instanceof Error ? error.message : "The call failed.");
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
  trap: ["Get order of twenty.", "prepare_action", { tool: "get_order", quantity: 20 }],
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (busy) {
    return;
  }
  const text = line.value;
  const routed = routeLine(text, pendingId);
  line.value = "";
  if (!routed.ok) {
    addTurn("you", "You", text.trim() || "…");
    addTurn("gate bad", "VoiceGate", routed.error);
    return;
  }
  void run(text.trim(), routed.name, routed.arguments);
});

for (const button of buttons) {
  button.addEventListener("click", () => {
    if (busy) {
      return;
    }
    const act = button.dataset.act;
    if (act === "confirm") {
      const routed = routeLine("confirm", pendingId);
      if (!routed.ok) {
        addTurn("gate bad", "VoiceGate", routed.error);
        return;
      }
      void run("Confirm.", routed.name, routed.arguments);
      return;
    }
    if (act === "cancel") {
      const routed = routeLine("cancel", pendingId);
      if (!routed.ok) {
        addTurn("gate bad", "VoiceGate", routed.error);
        return;
      }
      void run("Cancel.", routed.name, routed.arguments);
      return;
    }
    const action = actions[act];
    if (!action) {
      return;
    }
    void run(action[0], action[1], action[2]);
  });
}

paintPending();

try {
  const session = await client.connect();
  const names = session.tools.slice().sort().join(", ");
  status.textContent = `Connected. Protocol ${session.protocolVersion}. Tools: ${names}.`;
  await refreshAudit();
} catch (error) {
  status.textContent = "VoiceGate is not running. Start the cafe, then start VoiceGate, then reload this page.";
  addTurn("gate bad", "VoiceGate", error instanceof Error ? error.message : "Could not connect.");
}
