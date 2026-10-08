import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createQlooMcpServer } from "@/mcp/qloo/server";

const server = createQlooMcpServer();
server
  .connect(new StdioServerTransport())
  .then(() => {
    // stdout carries the MCP protocol, so status goes to stderr.
    console.error(
      `glosses-qloo MCP server on stdio (${process.env.QLOO_API_KEY?.trim() ? "live" : "fixture"} mode)`,
    );
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
