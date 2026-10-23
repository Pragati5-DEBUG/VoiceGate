import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { auditText, writeAudit } from "./audit.js";
import { callCafe } from "./cafe-client.js";
import { classifyTool } from "./classify.js";
import { clearLast, readLast, saveLast, UNDO_WINDOW_MS } from "./last.js";
import { blockReadback, overCap } from "./limit.js";
import { currentPending, peekPending, savePending, takePending } from "./pending.js";
import { cancelReadback, pizzaReadback } from "./readback.js";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};

function cafeArgs(quantity: number | undefined, orderId: string | undefined): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  if (quantity !== undefined) {
    args.quantity = quantity;
  }
  if (orderId !== undefined) {
    args.orderId = orderId;
  }
  return args;
}

export function createVoiceGateServer(cafeUrl: string): McpServer {
  const server = new McpServer({
    name: "voicegate",
    version: "0.1.0",
  });

  const forward = async (name: string) => {
    const decision = classifyTool(name);
    if (!decision.pass) {
      return {
        content: [{ type: "text" as const, text: `Would confirm ${name}. ${decision.reason} The cafe was not called.` }],
      };
    }
    const text = await callCafe(cafeUrl, name, {});
    return { content: [{ type: "text" as const, text }] };
  };

  server.registerTool(
    "get_hours",
    {
      title: "Cafe hours",
      description: "Ask the cafe when it opens. VoiceGate forwards this because it is read-only.",
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    async () => forward("get_hours"),
  );

  server.registerTool(
    "get_menu",
    {
      title: "Cafe menu",
      description: "Ask the cafe for the menu. VoiceGate forwards this because it is read-only.",
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    async () => forward("get_menu"),
  );

  const held = {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  };

  server.registerTool(
    "prepare_action",
    {
      title: "Prepare an action",
      description:
        "Read an order back and wait. Read-only tools are forwarded. An order is not placed until confirm_action.",
      inputSchema: z.object({
        tool: z.string().describe("Cafe tool name, such as place_order or get_order"),
        quantity: z.number().int().min(1).max(40).optional().describe("How many pizzas"),
        orderId: z.string().optional().describe("Order id for cancel_order"),
        when: z.string().optional().describe("Ready time, such as seven"),
      }),
      annotations: held,
    },
    async ({ tool, quantity, orderId, when }) => {
      const held = currentPending();
      if ((tool === "place_order" || tool === "get_order") && quantity === undefined && held?.quantity !== undefined) {
        quantity = held.quantity;
        tool = held.tool;
        orderId = held.orderId;
      }
      if ((tool === "place_order" || tool === "get_order") && !when && held?.when && held.tool === tool) {
        when = held.when;
      }
      const decision = classifyTool(tool);
      if (decision.pass) {
        const text = await callCafe(cafeUrl, tool, cafeArgs(quantity, orderId));
        return { content: [{ type: "text" as const, text }] };
      }
      if ((tool === "place_order" || tool === "get_order") && quantity === undefined) {
        return { content: [{ type: "text" as const, text: "Say how many pizzas." }], isError: true };
      }
      if (tool === "cancel_order" && orderId === undefined) {
        return { content: [{ type: "text" as const, text: "Say which order to cancel." }], isError: true };
      }
      if ((tool === "place_order" || tool === "get_order") && quantity !== undefined && overCap(quantity)) {
        writeAudit({
          pendingId: "none",
          tool,
          decision: "blocked",
          arguments: { quantity, when },
        });
        return {
          content: [{ type: "text" as const, text: blockReadback(quantity) }],
          isError: true,
        };
      }

      const speakable =
        tool === "cancel_order" && orderId !== undefined
          ? cancelReadback(orderId)
          : pizzaReadback(quantity ?? 1, when);
      const { action: pending, replacedIds } = savePending({ tool, quantity, orderId, when, speakable });
      writeAudit({
        pendingId: pending.id,
        tool,
        decision: "prepared",
        arguments: { quantity, orderId, when },
      });
      const trapNote = decision.reason.includes("looks read-only") ? `\n${decision.reason}` : "";
      const replacedNote = replacedIds.length > 0 ? `\nReplaced pending ${replacedIds.join(", ")}.` : "";
      return {
        content: [
          { type: "text" as const, text: `${speakable}\nPending ${pending.id}.${replacedNote}${trapNote}` },
        ],
      };
    },
  );

  server.registerTool(
    "confirm_action",
    {
      title: "Confirm a pending action",
      description: "Place or cancel the pending order. The pending id works once.",
      inputSchema: z.object({
        pendingId: z.string().describe("The pending id from prepare_action"),
      }),
      annotations: held,
    },
    async ({ pendingId }) => {
      const held = peekPending(pendingId);
      if (held && (held.tool === "place_order" || held.tool === "get_order") && !held.when) {
        return {
          content: [{ type: "text" as const, text: "Say a time first. Nothing was placed." }],
          isError: true,
        };
      }
      const taken = takePending(pendingId);
      if ("error" in taken) {
        return { content: [{ type: "text" as const, text: taken.error }], isError: true };
      }
      const { action } = taken;
      const text = await callCafe(cafeUrl, action.tool, cafeArgs(action.quantity, action.orderId));
      const placed = /^Order (\d+) placed\./.exec(text);
      if (placed?.[1] && (action.tool === "place_order" || action.tool === "get_order")) {
        saveLast(placed[1]);
      }
      writeAudit({
        pendingId: action.id,
        tool: action.tool,
        decision: "confirmed",
        arguments: { quantity: action.quantity, orderId: action.orderId, when: action.when },
      });
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.registerTool(
    "cancel_action",
    {
      title: "Cancel a pending action",
      description: "Drop a pending order before it reaches the cafe.",
      inputSchema: z.object({
        pendingId: z.string().describe("The pending id from prepare_action"),
      }),
      annotations: held,
    },
    async ({ pendingId }) => {
      const taken = takePending(pendingId);
      if ("error" in taken) {
        return { content: [{ type: "text" as const, text: taken.error }], isError: true };
      }
      writeAudit({
        pendingId: taken.action.id,
        tool: taken.action.tool,
        decision: "cancelled",
        arguments: { quantity: taken.action.quantity, orderId: taken.action.orderId },
      });
      return { content: [{ type: "text" as const, text: "Cancelled. Nothing was ordered." }] };
    },
  );

  server.registerTool(
    "undo_last_action",
    {
      title: "Undo last confirm",
      description: "Cancel the last placed order if it is still inside the short undo window.",
      inputSchema: z.object({}),
      annotations: held,
    },
    async () => {
      const last = readLast();
      if (!last) {
        return { content: [{ type: "text" as const, text: "Nothing to undo." }], isError: true };
      }
      if (Date.now() - last.at > UNDO_WINDOW_MS) {
        return {
          content: [{ type: "text" as const, text: "The undo window closed. The order stays." }],
          isError: true,
        };
      }
      const text = await callCafe(cafeUrl, "cancel_order", { orderId: last.orderId });
      clearLast();
      writeAudit({
        pendingId: "none",
        tool: "cancel_order",
        decision: "undone",
        arguments: { orderId: last.orderId },
      });
      return { content: [{ type: "text" as const, text: `Undone. ${text}` }] };
    },
  );

  server.registerTool(
    "get_audit_log",
    {
      title: "Audit log",
      description: "Read the record of prepares, confirms, and cancels. This does not place an order.",
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    async () => ({
      content: [{ type: "text" as const, text: auditText() }],
    }),
  );

  return server;
}
