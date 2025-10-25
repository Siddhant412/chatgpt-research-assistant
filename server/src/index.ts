import express from "express";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import { add_paper } from "./tools/add_paper";
import { index_paper } from "./tools/index_paper";
import { get_paper_chunk } from "./tools/get_paper_chunk";
import { save_note } from "./tools/save_note";
import { render_library } from "./tools/render_library";

// Load the built widget bundle
const WIDGET_JS = readFileSync("../web/dist/widget.js", "utf8");

const server = new McpServer({ name: "research-notes", version: "1.0.0" });

// ---------- UI Resource (component template) ----------
server.registerResource(
  "widget",
  "ui://widget/research-notes.html",
  {},
  async () => ({
    contents: [
      {
        uri: "ui://widget/research-notes.html",
        mimeType: "text/html+skybridge",
        text: `
<div id="root"></div>
<script type="module">${WIDGET_JS}</script>
`.trim(),
        _meta: {
          "openai/widgetPrefersBorder": true
        }
      }
    ]
  })
);

// Common widget metadata
const toolMeta = {
  "openai/outputTemplate": "ui://widget/research-notes.html",
  "openai/widgetAccessible": true
};

// ---------- Tools ----------

server.registerTool(
  "render_library",
  {
    title: "Render Research Notes App",
    _meta: { ...toolMeta, "openai/toolInvocation/invoking": "Loading library…" },
    inputSchema: {} // ZodRawShape (empty)
  },
  async () => ({
    structuredContent: await render_library(),
    content: [{ type: "text", text: "Your library UI is shown above." }]
  })
);

server.registerTool(
  "add_paper",
  {
    title: "Add paper by URL",
    description: "Download a PDF (direct link, arXiv PDF, or DOI redirect) and index pages.",
    _meta: toolMeta,
    inputSchema: {
      url: z.string().url()
    }
  },
  async ({ url }: { url: string }) => {
    const { id, title } = await add_paper({ url });
    return {
      structuredContent: { lastAdded: { id, title } },
      content: [{ type: "text", text: `Added "${title}".` }]
    };
  }
);

server.registerTool(
  "index_paper",
  {
    title: "List sections for a paper",
    _meta: toolMeta,
    inputSchema: {
      paperId: z.string()
    }
  },
  async ({ paperId }: { paperId: string }) => ({
    structuredContent: await index_paper({ paperId }),
    // add a minimal content message to satisfy the type
    content: [{ type: "text", text: "Fetched section list." }]
  })
);

server.registerTool(
  "get_paper_chunk",
  {
    title: "Get text for a section",
    _meta: toolMeta,
    inputSchema: {
      paperId: z.string(),
      sectionId: z.string()
    }
  },
  async ({ paperId, sectionId }: { paperId: string; sectionId: string }) => ({
    content: [{ type: "text", text: (await get_paper_chunk({ paperId, sectionId })).text }]
  })
);

server.registerTool(
  "save_note",
  {
    title: "Save a note for a paper",
    _meta: toolMeta,
    inputSchema: {
      paperId: z.string(),
      title: z.string(),
      summary: z.string()
    }
  },
  async ({ paperId, title, summary }: { paperId: string; title: string; summary: string }) => ({
    structuredContent: await save_note({ paperId, title, summary }),
    content: [{ type: "text", text: "Saved note." }]
  })
);

// ---------- HTTP transport (/mcp) ----------
const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true
  });

  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const port = parseInt(process.env.PORT || "2091", 10);
app.listen(port, () => {
  console.log(`MCP server on http://127.0.0.1:${port}/mcp`);
});
