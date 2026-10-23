import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PIZZA_CENTS } from "../../cafe-server/src/orders.js";
import { numberWords } from "../../cafe-server/src/words.js";

const limitPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/limit.json");
const DEFAULT_CAP_CENTS = 9_900;

type LimitStore = { capCents: number };

function readLimit(): LimitStore {
  if (!fs.existsSync(limitPath)) {
    return { capCents: DEFAULT_CAP_CENTS };
  }
  const parsed = JSON.parse(fs.readFileSync(limitPath, "utf8")) as { capCents?: number };
  return { capCents: parsed.capCents ?? DEFAULT_CAP_CENTS };
}

export function capCents(): number {
  return readLimit().capCents;
}

export function orderCents(quantity: number): number {
  return quantity * PIZZA_CENTS;
}

export function overCap(quantity: number): boolean {
  return orderCents(quantity) > capCents();
}

export function capSpeakable(): string {
  return `${numberWords(capCents() / 100)} dollars`;
}

function dollarsWords(cents: number): string {
  const dollars = cents / 100;
  return dollars <= 99 ? numberWords(dollars) : String(dollars);
}

export function blockReadback(quantity: number): string {
  return `That would be ${dollarsWords(orderCents(quantity))} dollars. The household limit is ${capSpeakable()}. Nothing was placed.`;
}
