const PROTOCOL = "2025-11-25";

function toolText(result) {
  const content = Array.isArray(result?.content) ? result.content : [];
  return content
    .filter((block) => block && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

export function createMcpClient(baseUrl = "") {
  let protocolVersion = PROTOCOL;
  let nextId = 0;
  const endpoint = `${baseUrl}/mcp`;

  async function post(message, isInitialize) {
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    if (!isInitialize) {
      headers["mcp-protocol-version"] = protocolVersion;
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(message),
    });
    if (response.status === 202) {
      await response.body?.cancel();
      return null;
    }
    const body = await response.json();
    if (!response.ok || body.error) {
      throw new Error(body.error?.message || `Request failed (${response.status})`);
    }
    return body;
  }

  return {
    async connect() {
      const initialized = await post(
        {
          jsonrpc: "2.0",
          id: ++nextId,
          method: "initialize",
          params: {
            protocolVersion: PROTOCOL,
            capabilities: {},
            clientInfo: { name: "voicegate-chat", version: "0.1.0" },
          },
        },
        true,
      );
      const negotiated = initialized?.result?.protocolVersion;
      if (!negotiated) {
        throw new Error("VoiceGate did not complete initialize.");
      }
      protocolVersion = negotiated;
      await post({ jsonrpc: "2.0", method: "notifications/initialized" }, false);
      const listed = await post({ jsonrpc: "2.0", id: ++nextId, method: "tools/list", params: {} }, false);
      const tools = Array.isArray(listed?.result?.tools) ? listed.result.tools.map((tool) => tool.name) : [];
      return { protocolVersion, tools };
    },

    async callTool(name, args) {
      const reply = await post(
        {
          jsonrpc: "2.0",
          id: ++nextId,
          method: "tools/call",
          params: { name, arguments: args },
        },
        false,
      );
      const result = reply?.result ?? {};
      return { text: toolText(result), isError: result.isError === true };
    },
  };
}
