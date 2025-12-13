import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class MCPChatbotClient {
  constructor() {
    this.client = null;
    this.transport = null;
    this.availableTools = [];
  }

  async connect() {
    try {
      console.log("🔄 Connecting to MCP server...");
      
      // Create client
      this.client = new Client({
        name: "mcp-chatbot-client",
        version: "1.0.0",
      }, {
        capabilities: {
          tools: {},
        }
      });

      // Get the absolute path to server.js
      const serverPath = join(__dirname, '../server.js');

      // Create stdio transport - it will spawn the process itself
      this.transport = new StdioClientTransport({
        command: "node",
        args: [serverPath],
        env: process.env,
        stderr: "inherit", // Show server errors in console
      });

      // Connect to server
      await this.client.connect(this.transport);
      
      // List available tools
      const toolsList = await this.client.listTools();
      this.availableTools = toolsList.tools;
      
      console.log("✅ Connected to MCP server successfully!");
      console.log(`📦 Available tools: ${this.availableTools.length}`);
      
      return true;
    } catch (error) {
      console.error("❌ Failed to connect to MCP server:", error.message);
      throw error;
    }
  }

  async callTool(toolName, params) {
    try {
      console.log(`\n🔧 Calling tool: ${toolName}`);
      console.log(`📝 Parameters:`, JSON.stringify(params, null, 2));
      
      // Set timeout based on tool (code generation needs more time)
      const timeout = toolName === 'generate-code' ? 120000 : 60000; // 120s for code gen, 60s for others
      
      // callTool signature: callTool(params, resultSchema, options)
      // resultSchema is undefined (use default), options is third param
      const result = await this.client.callTool(
        {
          name: toolName,
          arguments: params
        },
        undefined, // Use default result schema
        {
          timeout: timeout
        }
      );
      
      console.log("✅ Tool execution completed");
      return result;
    } catch (error) {
      console.error(`❌ Error calling tool ${toolName}:`, error.message);
      throw error;
    }
  }

  getAvailableTools() {
    return this.availableTools;
  }

  async disconnect() {
    if (this.transport) {
      await this.transport.close();
      console.log("👋 Disconnected from MCP server");
    }
  }
}

