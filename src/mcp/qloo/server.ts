import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createQlooClient,
  type QlooClient,
} from "@/lib/qloo/create-qloo-client";
import {
  compareTaste,
  compareTasteInput,
  compareTasteOutput,
  recommend,
  recommendInput,
  recommendOutput,
  searchEntities,
  searchEntitiesInput,
  searchEntitiesOutput,
} from "@/mcp/qloo/tools";

function asToolResult<T extends Record<string, unknown>>(result: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    structuredContent: result,
  };
}

/**
 * Thin Qloo MCP server. Uses fixtures unless QLOO_API_KEY is set (see createQlooClient).
 */
export function createQlooMcpServer(client: QlooClient = createQlooClient()) {
  const server = new McpServer({ name: "glosses-qloo", version: "0.1.0" });

  server.registerTool(
    "search_entities",
    {
      title: "Search Qloo entities",
      description:
        "Find Qloo entities (music, film, books, places, food, tv) by name within one domain. Empty query lists the domain.",
      inputSchema: searchEntitiesInput,
      outputSchema: searchEntitiesOutput,
      annotations: { readOnlyHint: true, openWorldHint: client.mode === "live" },
    },
    async (args) => asToolResult(await searchEntities(client, args)),
  );

  server.registerTool(
    "recommend",
    {
      title: "Cross-domain next thing",
      description:
        "Rank cross-domain 'next thing' picks for a taste profile by traversing the Qloo affinity graph.",
      inputSchema: recommendInput,
      outputSchema: recommendOutput,
      annotations: { readOnlyHint: true, openWorldHint: client.mode === "live" },
    },
    async (args) => asToolResult(await recommend(client, args)),
  );

  server.registerTool(
    "compare_taste",
    {
      title: "Compare taste",
      description:
        "Rank people by taste match against a viewer, then blend the viewer with one person and suggest a shared outing.",
      inputSchema: compareTasteInput,
      outputSchema: compareTasteOutput,
      annotations: { readOnlyHint: true, openWorldHint: client.mode === "live" },
    },
    async (args) => asToolResult(await compareTaste(client, args)),
  );

  return server;
}
