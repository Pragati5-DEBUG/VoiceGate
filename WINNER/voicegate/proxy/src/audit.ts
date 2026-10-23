import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type AuditDecision = "prepared" | "confirmed" | "cancelled" | "blocked" | "undone";

type AuditArguments = {
  quantity?: number;
  orderId?: string;
  when?: string;
};

type AuditEntry = {
  at: string;
  pendingId: string;
  tool: string;
  decision: AuditDecision;
  arguments?: AuditArguments;
};

const auditPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/audit.json");

function readEntries(): AuditEntry[] {
  if (!fs.existsSync(auditPath)) {
    return [];
  }
  return (JSON.parse(fs.readFileSync(auditPath, "utf8")) as { entries?: AuditEntry[] }).entries ?? [];
}

export function clearAudit(): void {
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.writeFileSync(auditPath, `${JSON.stringify({ entries: [] }, null, 2)}\n`);
}

export function writeAudit(entry: Omit<AuditEntry, "at">): void {
  const existing = readEntries();
  existing.push({ ...entry, at: new Date().toISOString() });
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.writeFileSync(auditPath, `${JSON.stringify({ entries: existing }, null, 2)}\n`);
}

export function auditText(): string {
  const entries = readEntries();
  if (entries.length === 0) {
    return "Audit log is empty.";
  }
  return entries
    .map((entry) => {
      const quantity = entry.arguments?.quantity !== undefined ? ` quantity ${entry.arguments.quantity}` : "";
      const orderId = entry.arguments?.orderId ? ` order ${entry.arguments.orderId}` : "";
      return `${entry.decision} ${entry.tool}${quantity}${orderId} pending ${entry.pendingId}`;
    })
    .join("\n");
}
