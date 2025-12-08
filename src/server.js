import dotenv from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { generateCode, detectBugs, checkBestPractices, createGitHubCommit } from "./tools/index.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Suppress console output to avoid interfering with stdio transport
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

// Redirect stdout logs to stderr to keep stdio clean for MCP protocol
console.log = (...args) => originalError("[LOG]", ...args);
console.warn = (...args) => originalError("[WARN]", ...args);
console.error = (...args) => originalError("[ERROR]", ...args);

dotenv.config({ path: join(__dirname, "../.env") });

// Create server instance
const server = new McpServer({
  name: "code",
  version: "1.0.0",
  capabilities:{
    resources:{},
    tools:{},
    prompts :{}
  }
});

//tools


// MCP Tool 1: Code Generation
server.tool(
  "generate-code",
  "Generate code based on description and requirements",
  {
    description: z.string(),
    language: z.string().default("javascript"),
    framework: z.string().optional(),
  },
  {
    title: "Code Generator",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  },
  async (params) => {
    try {
      const data = await generateCode(params)
      return{
        content:[
            {type:"text" , text : JSON.stringify(data, null, 2) }
        ]
      }
    } catch (error) {
      console.error("Generate code error:", error);
      return {
        content: [
          { type: "text", text: `Failed to generate code: ${error.message}` }
        ]
      };
    }
  }
);

// MCP Tool 2: Bug Detector
server.tool(
  "detect-bugs",
  "Analyze code for potential bugs and issues",
  {
    code: z.string(),
    language: z.string(),
  },
  {
    title: "Bug Detector",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  },
  async (params) => {
    try {

      await detectBugs(params);
    } catch {
      return {
        content: [
          { type: "text", text: "Failed to detect bugs" }
        ]
      };
    }
    return {};
  }
);

server.tool(
  "check-best-practices",
  "Check code against best practices and coding standards",
  {
    code: z.string(),
    language: z.string(),
    framework: z.string().optional(),
    strictMode: z.boolean().optional()
  },
  {
    title: "Best Practices Checker",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  },
  async (params) => {
    try {

      await checkBestPractices(params);
    } catch {
      return {
        content: [
          { type: "text", text: "Failed to check best practices" }
        ]
      };
    }
    return {};
  }
);

// MCP Tool 4: GitHub Commit
server.tool(
  "github-commit",
  "Create and push a commit to GitHub repository",
  {
    repo: z.string(),
    branch: z.string(),
    message: z.string(),
    files: z.array(z.object({
      path: z.string(),
      content: z.string()
    })),
    token: z.string().optional()
  },
  {
    title: "GitHub Commit",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  },
  async (params) => {
    try {
    
      await createGitHubCommit(params);
    } catch {
      return {
        content: [
          { type: "text", text: "Failed to create GitHub commit" }
        ]
      };
    }
    return {};
  }
);




async function main() {
    const transport = new StdioServerTransport()
    await server.connect(transport);
    
}
main()


