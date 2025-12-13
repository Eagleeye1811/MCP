import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  generateCode,
  detectBugs,
  checkBestPractices,
  autoCommitAndPush,
} from "./tools/index.js";

// Redirect stdout logs to stderr to keep stdio clean for MCP protocol
const originalError = console.error;
console.log = (...args) => originalError("[LOG]", ...args);
console.warn = (...args) => originalError("[WARN]", ...args);
console.error = (...args) => originalError("[ERROR]", ...args);

// Create server instance
const server = new McpServer({
  name: "code",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
    prompts: {},
  },
});

// MCP Tool 1: Code Generation
server.tool(
  "generate-code",
  "Generate code based on description and requirements",
  {
    description: z.string(),
    language: z.string().default("javascript"),
    framework: z.union([z.string(), z.undefined()]).optional(),
  },
  {
    title: "Code Generator",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  async (params) => {
    try {
      const data = await generateCode(params);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    } catch (error) {
      console.error("Generate code error:", error);
      return {
        content: [
          { type: "text", text: `Failed to generate code: ${error.message}` },
        ],
      };
    }
  }
);

// MCP Tool 2: Bug Detector
server.tool(
  "detect-bugs",
  "Analyze code for potential bugs and issues. Can analyze code directly or read from a file.",
  {
    code: z.union([z.string(), z.undefined()]).optional(),
    language: z.string(),
    rootDirectory: z.string(),
    fileName: z.string(),
  },
  {
    title: "Bug Detector",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async (params) => {
    try {
      const data = await detectBugs(params);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    } catch (error) {
      console.error("Detect bugs error:", error);
      return {
        content: [
          { type: "text", text: `Failed to detect bugs: ${error.message}` },
        ],
      };
    }
  }
);

server.tool(
  "check-best-practices",
  "Check code against best practices and coding standards",
  {
    code: z.string(),
    language: z.string(),
    framework: z.union([z.string(), z.undefined()]).optional(),
    strictMode: z.union([z.boolean(), z.undefined()]).optional(),
  },
  {
    title: "Best Practices Checker",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async (params) => {
    try {
      return await checkBestPractices(params);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to check best practices: ${error.message}`,
          },
        ],
      };
    }
  }
);

// MCP Tool 4: GitHub Commit
server.tool(
  "github-commit",
  "Create and push a commit to GitHub repository",
  {
    localPath: z.string(),
    repo: z.string(),
    branch: z.string(),
    message: z.string(),
    owner: z.union([z.string(), z.undefined()]).optional(),
  },
  {
    title: "GitHub Commit",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  async (params) => {
    try {
      await autoCommitAndPush(params);
      return {
        content: [
          {
            type: "text",
            text: "✅ Successfully committed and pushed to GitHub!",
          },
        ],
      };
    } catch (error) {
      console.error("GitHub commit error:", error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to create GitHub commit: ${error.message}`,
          },
        ],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
