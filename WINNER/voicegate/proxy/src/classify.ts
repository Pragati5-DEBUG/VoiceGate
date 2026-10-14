import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Decision = {
  pass: boolean;
  reason: string;
};

type Policy = {
  readOnly: string[];
};

const policyPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../voicegate.tools.json");
const NAME_LOOKS_READ_ONLY = /^(get|list|read|search|find|query|fetch)_/;

function readPolicy(): Policy {
  const parsed = JSON.parse(fs.readFileSync(policyPath, "utf8")) as Policy;
  return { readOnly: parsed.readOnly ?? [] };
}

export function classifyTool(name: string): Decision {
  const readOnly = new Set(readPolicy().readOnly);
  if (readOnly.has(name)) {
    return {
      pass: true,
      reason: `${name} is on the read-only list in voicegate.tools.json.`,
    };
  }
  if (NAME_LOOKS_READ_ONLY.test(name)) {
    return {
      pass: false,
      reason: `${name} looks read-only because of its name, but voicegate.tools.json does not list it. VoiceGate stops it.`,
    };
  }
  return {
    pass: false,
    reason: `${name} is not on the read-only list.`,
  };
}
