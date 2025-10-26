// server/src/index.ts
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import { add_paper } from "./tools/add_paper";
import { index_paper } from "./tools/index_paper";
import { get_paper_chunk } from "./tools/get_paper_chunk";
import { save_note } from "./tools/save_note";
import { render_library } from "./tools/render_library";
import { delete_paper } from "./tools/delete_paper";

// Load built widget bundle
const WIDGET_JS = readFileSync("../web/dist/widget.js", "utf8");

// MCP server
const mcp = new McpServer({ name: "research-notes", version: "1.0.0" });

// UI Resource
mcp.registerResource(
  "widget",
  "ui://widget/research-notes.html",
  {},
  async () => ({
    contents: [
      {
        uri: "ui://widget/research-notes.html",
        mimeType: "text/html+skybridge",
        text: `<div id="root"></div>\n<script type="module">${WIDGET_JS}</script>`,
        _meta: { "openai/widgetPrefersBorder": true }
      }
    ]
  })
);

const metaUI = {
  "openai/outputTemplate": "ui://widget/research-notes.html",
  "openai/widgetAccessible": true
} as const;

const metaSilent = {
  "openai/widgetAccessible": false
} as const;

// Tools
mcp.registerTool(
  "render_library",
  {
    title: "Render Research Notes App",
    _meta: { ...metaUI, "openai/toolInvocation/invoking": "Loading library…" },
    inputSchema: {}
  },
  async () => ({
    structuredContent: await render_library(),
    content: [{ type: "text", text: "Your library UI is shown above." }]
  })
);

mcp.registerTool(
  "add_paper",
  {
    title: "Add paper (DOI/URL/PDF)",
    description: "Add a paper by DOI, landing page, stamp page, or direct .pdf.",
    _meta: metaUI,
    inputSchema: { url: z.string().min(5, "Provide a DOI or URL") }
  },
  async ({ url }: { url: string }) => {
    const { id, title } = await add_paper({ url });
    return {
      structuredContent: await render_library(),
      content: [{ type: "text", text: `Added: ${title} (id: ${id}).` }]
    };
  }
);

mcp.registerTool(
  "index_paper",
  {
    title: "List sections for a paper",
    _meta: { ...metaSilent, "openai/toolInvocation/invoking": "Indexing paper…" },
    inputSchema: { paperId: z.string() }
  },
  async ({ paperId }: { paperId: string }) => {
    const payload = await index_paper({ paperId });
    return {
      // text-only payload the model can parse; won't trigger widget render
      content: [{ type: "text", text: JSON.stringify(payload) }]
    };
  }
);

mcp.registerTool(
  "get_paper_chunk",
  {
    title: "Get text for a section",
    _meta: { ...metaSilent, "openai/toolInvocation/invoking": "Reading section…" },
    inputSchema: { paperId: z.string(), sectionId: z.string() }
  },
  async ({ paperId, sectionId }: { paperId: string; sectionId: string }) => ({
    content: [{ type: "text", text: (await get_paper_chunk({ paperId, sectionId })).text }]
  })
);

mcp.registerTool(
  "save_note",
  {
    title: "Save a note for a paper",
    _meta: metaUI,
    inputSchema: { paperId: z.string(), title: z.string(), summary: z.string() }
  },
  async ({ paperId, title, summary }: { paperId: string; title: string; summary: string }) => {
    await save_note({ paperId, title, summary });
    return {
      structuredContent: await render_library(),
      content: [{ type: "text", text: "Saved note." }]
    };
  }
);

mcp.registerTool(
  "delete_paper",
  {
    title: "Delete a paper",
    description: "Delete a paper by id. Removes its notes, sections, and local PDF.",
    _meta: metaUI,
    inputSchema: { paperId: z.string().min(1) }
  },
  async ({ paperId }: { paperId: string }) => {
    const res = await delete_paper({ paperId });
    return {
      structuredContent: await render_library(),
      content: [
        { type: "text", text: res.ok ? `🗑️ Deleted: ${res.title}` : "Paper not found." }
      ]
    };
  }
);

const transports = new Map<string, StreamableHTTPServerTransport>();
const port = parseInt(process.env.PORT || "2091", 10);

function getHeader(req: IncomingMessage, name: string) {
  return (req.headers[name.toLowerCase()] as string | undefined) ?? undefined;
}

async function handleInitOrReuse(req: IncomingMessage, res: ServerResponse) {
  const sid = getHeader(req, "mcp-session-id");
  let transport = sid ? transports.get(sid) : undefined;

  if (!transport) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId: string) => {
        transports.set(sessionId, transport!);
      }
    });
    await mcp.connect(transport);
  }

  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  return transport.handleRequest(req, res);
}

async function handleByExistingSession(req: IncomingMessage, res: ServerResponse) {
  const sid = getHeader(req, "mcp-session-id");
  if (!sid) {
    res.statusCode = 400;
    return res.end("Bad Request: Missing Mcp-Session-Id");
  }
  const transport = transports.get(sid);
  if (!transport) {
    res.statusCode = 404;
    return res.end("Not Found: Unknown session");
  }
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  return transport.handleRequest(req, res);
}

const httpServer = createServer(async (req, res) => {
  try {
    const url = req.url || "/";
    const method = req.method || "GET";

    if (url === "/" && method === "GET") {
      res.statusCode = 200;
      return res.end("ok");
    }

    if (url === "/mcp") {
      if (method === "POST") {
        return handleInitOrReuse(req, res);
      }
      if (method === "GET") {
        return handleByExistingSession(req, res);
      }
      if (method === "DELETE") {
        const sid = getHeader(req, "mcp-session-id");
        const transport = sid ? transports.get(sid) : undefined;
        if (transport && sid) {
          transports.delete(sid);
          transport.close();
          res.statusCode = 200;
          return res.end("closed");
        }
        res.statusCode = 404;
        return res.end("Not Found");
      }
      res.statusCode = 405;
      res.setHeader("Allow", "GET,POST,DELETE");
      return res.end("Method Not Allowed");
    }

    res.statusCode = 404;
    res.end("Not Found");
  } catch (e: any) {
    res.statusCode = 500;
    res.end(`Internal Server Error: ${e?.message ?? String(e)}`);
  }
});

httpServer.listen(port, () => {
  console.log(`MCP server listening on http://127.0.0.1:${port}/mcp`);
});
