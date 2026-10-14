import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type PendingAction = {
  id: string;
  tool: string;
  quantity?: number;
  orderId?: string;
  speakable: string;
  expiresAt: string;
};

const pendingPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/pending.json");
const TWO_MINUTES_MS = 2 * 60 * 1000;

type PendingStore = {
  nextId: number;
  pending: PendingAction[];
};

function readStore(): PendingStore {
  if (!fs.existsSync(pendingPath)) {
    return { nextId: 1, pending: [] };
  }
  const parsed = JSON.parse(fs.readFileSync(pendingPath, "utf8")) as {
    nextId?: number;
    pending?: PendingAction[];
  };
  const pending = parsed.pending ?? [];
  const highest = pending.reduce((max, action) => Math.max(max, Number(action.id)), 0);
  return { nextId: parsed.nextId ?? highest + 1, pending };
}

function writeStore(store: PendingStore): void {
  fs.mkdirSync(path.dirname(pendingPath), { recursive: true });
  fs.writeFileSync(pendingPath, `${JSON.stringify(store, null, 2)}\n`);
}

export function clearPending(): void {
  writeStore({ nextId: 1, pending: [] });
}

export function savePending(input: Omit<PendingAction, "id" | "expiresAt">): {
  action: PendingAction;
  replacedIds: string[];
} {
  const store = readStore();
  const replacedIds = store.pending.map((action) => action.id);
  const action: PendingAction = {
    ...input,
    id: String(store.nextId),
    expiresAt: new Date(Date.now() + TWO_MINUTES_MS).toISOString(),
  };
  writeStore({ nextId: store.nextId + 1, pending: [action] });
  return { action, replacedIds };
}

export function takePending(id: string): { action: PendingAction } | { error: string } {
  const pending = readStore().pending;
  const found = pending.find((action) => action.id === id);
  if (!found) {
    return { error: `No pending action with id ${id}.` };
  }
  writeStore({ ...readStore(), pending: pending.filter((action) => action.id !== id) });
  if (Date.parse(found.expiresAt) <= Date.now()) {
    return { error: `Pending ${id} expired. Prepare the order again.` };
  }
  return { action: found };
}
