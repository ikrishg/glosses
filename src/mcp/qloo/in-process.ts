import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { QlooClient } from "@/lib/qloo/client";
import { createQlooMcpServer } from "@/mcp/qloo/server";
import type {
  CompareTasteArgs,
  CompareTasteResult,
  QlooToolName,
  RecommendArgs,
  RecommendResult,
  SearchEntitiesArgs,
  SearchEntitiesResult,
} from "@/mcp/qloo/tools";

export interface QlooToolMap {
  search_entities: { args: SearchEntitiesArgs; result: SearchEntitiesResult };
  recommend: { args: RecommendArgs; result: RecommendResult };
  compare_taste: { args: CompareTasteArgs; result: CompareTasteResult };
}

/** Calls a Qloo MCP tool over an in-memory MCP transport (same protocol path as stdio). */
export async function callQlooTool<N extends QlooToolName>(
  name: N,
  args: QlooToolMap[N]["args"],
  qlooClient?: QlooClient,
): Promise<QlooToolMap[N]["result"]> {
  const server = createQlooMcpServer(qlooClient);
  const mcpClient = new Client({ name: "glosses-app", version: "0.1.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    mcpClient.connect(clientTransport),
  ]);
  try {
    const result = await mcpClient.callTool({
      name,
      arguments: args as Record<string, unknown>,
    });
    if (result.isError) {
      const text = Array.isArray(result.content)
        ? result.content
            .map((c) => (c.type === "text" ? c.text : ""))
            .join(" ")
        : "";
      throw new Error(`Qloo MCP tool ${name} failed: ${text}`);
    }
    return result.structuredContent as QlooToolMap[N]["result"];
  } finally {
    await mcpClient.close();
    await server.close();
  }
}
