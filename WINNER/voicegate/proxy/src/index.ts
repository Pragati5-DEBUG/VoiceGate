import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createVoiceGateServer } from "./create-server.js";

const MCP_PATH = "/mcp";
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/public");

export function createApp(cafeUrl: string): Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, server: "voicegate", cafe: cafeUrl });
  });

  app.post(MCP_PATH, async (req, res) => {
    const server = createVoiceGateServer(cafeUrl);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("VoiceGate request failed", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  const methodNotAllowed = (_req: express.Request, res: express.Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  };

  app.get(MCP_PATH, methodNotAllowed);
  app.delete(MCP_PATH, methodNotAllowed);
  app.use(express.static(publicDir));

  return app;
}

export function startVoiceGate(port: number, cafeUrl: string): Promise<ReturnType<Express["listen"]>> {
  const app = createApp(cafeUrl);
  return new Promise((resolve) => {
    const httpServer = app.listen(port, "127.0.0.1", () => {
      console.log(`voicegate listening on http://127.0.0.1:${port}/mcp`);
      console.log(`chat page on http://127.0.0.1:${port}/`);
      resolve(httpServer);
    });
  });
}

const isDirectRun = process.argv[1]?.replaceAll("\\", "/").endsWith("proxy/src/index.ts");

if (isDirectRun) {
  const port = Number(process.env.PORT ?? 3002);
  const cafeUrl = process.env.CAFE_URL ?? "http://127.0.0.1:3001/mcp";
  await startVoiceGate(port, cafeUrl);
}
