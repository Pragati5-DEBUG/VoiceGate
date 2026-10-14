import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export function toolText(result: { content: unknown }): string {
  return Array.isArray(result.content)
    ? result.content.map((block) => (block.type === "text" ? String(block.text) : "")).join("")
    : "";
}

export async function callCafe(
  cafeUrl: string,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const client = new Client({ name: "voicegate", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(cafeUrl));
  await client.connect(transport);
  try {
    const listed = await client.listTools();
    const known = listed.tools.some((tool) => tool.name === name);
    if (!known) {
      return `The cafe has no tool named ${name}.`;
    }
    return toolText(await client.callTool({ name, arguments: args }));
  } finally {
    await client.close();
  }
}
