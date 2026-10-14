import express, { type Express } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createCafeServer } from "./create-server.js";

const MCP_PATH = "/mcp";

export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, server: "cafe-server" });
  });

  app.post(MCP_PATH, async (req, res) => {
    const server = createCafeServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP request failed", error);
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

  return app;
}

export function startCafeServer(port: number): Promise<ReturnType<Express["listen"]>> {
  const app = createApp();
  return new Promise((resolve) => {
    const httpServer = app.listen(port, "127.0.0.1", () => {
      console.log(`cafe-server listening on http://127.0.0.1:${port}/mcp`);
      resolve(httpServer);
    });
  });
}

const isDirectRun = process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js");

if (isDirectRun) {
  const port = Number(process.env.PORT ?? 3001);
  await startCafeServer(port);
}
