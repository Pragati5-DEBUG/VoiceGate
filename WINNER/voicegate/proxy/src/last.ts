import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type LastConfirm = {
  orderId: string;
  at: number;
};

const lastPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/last.json");
export const UNDO_WINDOW_MS = 60_000;

export function readLast(): LastConfirm | null {
  if (!fs.existsSync(lastPath)) {
    return null;
  }
  const parsed = JSON.parse(fs.readFileSync(lastPath, "utf8")) as Partial<LastConfirm>;
  if (!parsed.orderId || !parsed.at) {
    return null;
  }
  return { orderId: parsed.orderId, at: parsed.at };
}

export function saveLast(orderId: string): void {
  fs.mkdirSync(path.dirname(lastPath), { recursive: true });
  fs.writeFileSync(lastPath, `${JSON.stringify({ orderId, at: Date.now() }, null, 2)}\n`);
}

export function clearLast(): void {
  if (fs.existsSync(lastPath)) {
    fs.unlinkSync(lastPath);
  }
}
