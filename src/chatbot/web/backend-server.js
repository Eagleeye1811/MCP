#!/usr/bin/env node

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { MCPChatbotClient } from '../client.js';
import { CommandParser } from '../command-parser.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.WEB_PORT || 3001;

// Serve static files from the web directory
app.use(express.static(__dirname));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'MCP Chatbot Backend is running' });
});

// WebSocket connection handling
wss.on('connection', async (ws) => {
  console.log('🔌 New client connected');
  
  const client = new MCPChatbotClient();
  const parser = new CommandParser();
  let isConnected = false;

  // Helper to send messages to client
  const sendMessage = (type, data) => {
    ws.send(JSON.stringify({ type, data }));
  };

  // Connect to MCP server
  try {
    await client.connect();
    isConnected = true;
    const tools = client.getAvailableTools();
    
    sendMessage('connected', {
      message: 'Connected to MCP server',
      tools: tools.map(t => ({
        name: t.name,
        description: t.description
      }))
    });
    
    console.log('✅ MCP client connected for WebSocket client');
  } catch (error) {
    console.error('❌ Failed to connect to MCP server:', error.message);
    sendMessage('error', {
      message: 'Failed to connect to MCP server',
      error: error.message
    });
    ws.close();
    return;
  }

  // Handle incoming messages
  ws.on('message', async (message) => {
    try {
      const { type, data } = JSON.parse(message.toString());

      if (type === 'command') {
        const userInput = data.input;
        
        // Send processing status
        sendMessage('processing', { message: 'Processing your request...' });

        // Handle special commands
        if (userInput.toLowerCase() === 'help') {
          sendMessage('response', {
            type: 'help',
            content: getHelpMessage()
          });
          return;
        }

        if (userInput.toLowerCase() === 'tools') {
          const tools = client.getAvailableTools();
          sendMessage('response', {
            type: 'tools',
            content: formatToolsList(tools)
          });
          return;
        }

        // Parse command
        const parsed = parser.parseCommand(userInput);
        
        if (!parsed) {
          sendMessage('response', {
            type: 'error',
            content: `I couldn't understand that command.\n\nTry commands like:\n• "Generate a todo app in React"\n• "Detect bugs in file: server.js language: javascript"\n• Type "help" for more examples`
          });
          return;
        }

        // Extract parameters
        const params = parser.extractParams(userInput, parsed.tool);
        
        // Validate parameters
        const validation = parser.validateParams(params, parsed.tool);
        
        if (!validation.valid) {
          sendMessage('response', {
            type: 'error',
            content: `Missing required parameters: ${validation.missing.join(', ')}\n\nPlease provide all required information.`
          });
          return;
        }

        // Call the tool
        try {
          sendMessage('executing', { 
            tool: parsed.tool,
            params: params
          });

          // Send progress updates for long-running operations
          if (parsed.tool === 'generate-code') {
            sendMessage('progress', { 
              message: 'Generating code with AI... This may take 30-60 seconds.' 
            });
          }

          const result = await client.callTool(parsed.tool, params);
          
          // Format the response based on tool type
          const formattedResponse = formatToolResponse(parsed.tool, result);
          
          // For code generation, also send the raw data for interactive options
          let rawData = null;
          if (parsed.tool === 'generate-code') {
            try {
              const content = result.content?.[0]?.text;
              if (content) {
                rawData = JSON.parse(content);
              }
            } catch (e) {
              // Not JSON, ignore
            }
          }
          
          sendMessage('response', {
            type: 'success',
            tool: parsed.tool,
            content: formattedResponse,
            projectData: rawData // Send raw project data for web projects
          });
          
        } catch (error) {
          sendMessage('response', {
            type: 'error',
            content: `Error executing tool: ${error.message}`
          });
        }
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendMessage('error', {
        message: 'Error processing request',
        error: error.message
      });
    }
  });

  // Handle client disconnect
  ws.on('close', async () => {
    console.log('👋 Client disconnected');
    if (isConnected) {
      await client.disconnect();
    }
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Helper function to format tool responses
function formatToolResponse(toolName, result) {
  try {
    // Extract content from result
    let content = result;
    if (result.content && Array.isArray(result.content)) {
      content = result.content[0].text;
    }

    // Try to parse as JSON for structured formatting
    let data;
    try {
      data = typeof content === 'string' ? JSON.parse(content) : content;
    } catch {
      return content; // Return as-is if not JSON
    }

    // Format based on tool type
    switch (toolName) {
      case 'generate-code':
        return formatCodeGenerationResponse(data);
      
      case 'detect-bugs':
        return formatBugDetectionResponse(data);
      
      case 'check-best-practices':
        return formatBestPracticesResponse(content);
      
      case 'github-commit':
        return formatGitHubCommitResponse(data);
      
      default:
        return JSON.stringify(data, null, 2);
    }
  } catch (error) {
    console.error('Error formatting response:', error);
    return 'Response received but formatting failed. Check console for details.';
  }
}

function formatCodeGenerationResponse(data) {
  if (!data.success) {
    return `❌ Code generation failed.`;
  }

  let output = `# 🎉 Project Generated Successfully!\n\n`;
  output += `**Project Name:** ${data.projectName}\n\n`;
  output += `**Total Files:** ${data.summary?.totalFiles || data.files?.length || 0}\n`;
  output += `**Language:** ${data.summary?.language || 'N/A'}\n\n`;

  // File structure
  output += `## 📁 File Structure\n\n`;
  output += `\`\`\`\n`;
  output += formatFileTree(data.fileStructure);
  output += `\`\`\`\n\n`;

  // Files preview
  output += `## 📄 Generated Files\n\n`;
  if (data.files && data.files.length > 0) {
    data.files.slice(0, 3).forEach(file => {
      output += `### ${file.path}\n`;
      if (file.description) {
        output += `*${file.description}*\n\n`;
      }
      output += `\`\`\`${getFileLanguage(file.path)}\n`;
      output += file.content.substring(0, 300);
      if (file.content.length > 300) {
        output += '\n... (truncated)';
      }
      output += `\n\`\`\`\n\n`;
    });

    if (data.files.length > 3) {
      output += `*... and ${data.files.length - 3} more files*\n\n`;
    }
  }

  // Setup instructions
  if (data.setupInstructions) {
    output += `## 🚀 Setup Instructions\n\n`;
    
    if (data.setupInstructions.prerequisites?.length > 0) {
      output += `**Prerequisites:**\n`;
      data.setupInstructions.prerequisites.forEach(p => {
        output += `• ${p}\n`;
      });
      output += `\n`;
    }

    if (data.setupInstructions.installCommands?.length > 0) {
      output += `**Install:**\n\`\`\`bash\n`;
      data.setupInstructions.installCommands.forEach(cmd => {
        output += `${cmd}\n`;
      });
      output += `\`\`\`\n\n`;
    }

    if (data.setupInstructions.runCommands?.length > 0) {
      output += `**Run:**\n\`\`\`bash\n`;
      data.setupInstructions.runCommands.forEach(cmd => {
        output += `${cmd}\n`;
      });
      output += `\`\`\`\n\n`;
    }
  }

  if (data.additionalNotes) {
    output += `## 📝 Additional Notes\n\n${data.additionalNotes}\n`;
  }

  return output;
}

function formatBugDetectionResponse(data) {
  if (!data.success) {
    return `❌ Bug detection failed.`;
  }

  let output = `# 🐛 Bug Analysis Results\n\n`;
  
  if (data.fileName) {
    output += `**File:** ${data.fileName}\n`;
  }
  output += `**Language:** ${data.language}\n`;
  output += `**Lines of Code:** ${data.linesOfCode}\n\n`;

  // Summary
  if (data.summary) {
    output += `## 📊 Summary\n\n`;
    output += `• **Total Issues:** ${data.summary.totalIssues}\n`;
    output += `• **Critical:** ${data.summary.critical} 🔴\n`;
    output += `• **Warning:** ${data.summary.warning} ⚠️\n`;
    output += `• **Info:** ${data.summary.info} ℹ️\n\n`;
  }

  // Issues
  if (data.issues && data.issues.length > 0) {
    output += `## 🔍 Issues Found\n\n`;
    data.issues.forEach((issue, index) => {
      const icon = issue.severity === 'critical' ? '🔴' : 
                   issue.severity === 'warning' ? '⚠️' : 'ℹ️';
      
      output += `### ${icon} Issue ${index + 1}: ${issue.type}\n`;
      output += `**Severity:** ${issue.severity}\n`;
      output += `**Line:** ${issue.line}\n\n`;
      output += `**Description:** ${issue.description}\n\n`;
      
      if (issue.codeSnippet) {
        output += `**Code:**\n\`\`\`${data.language}\n${issue.codeSnippet}\n\`\`\`\n\n`;
      }
      
      output += `**Suggestion:** ${issue.suggestion}\n\n`;
      output += `---\n\n`;
    });
  } else {
    output += `## ✅ No Issues Found!\n\nYour code looks good!\n\n`;
  }

  // Overall assessment
  if (data.overallAssessment) {
    output += `## 📋 Overall Assessment\n\n${data.overallAssessment}\n`;
  }

  return output;
}

function formatBestPracticesResponse(content) {
  // Best practices often returns markdown already
  if (typeof content === 'string') {
    return content;
  }
  return JSON.stringify(content, null, 2);
}

function formatGitHubCommitResponse(data) {
  if (!data.success) {
    return `❌ GitHub commit failed.`;
  }

  let output = `# 🚀 Successfully Committed to GitHub!\n\n`;
  output += `**Commit SHA:** \`${data.sha}\`\n`;
  output += `**Message:** ${data.message}\n`;
  output += `**Files Committed:** ${data.filesCommitted}\n\n`;
  output += `**View commit:** [${data.url}](${data.url})\n`;

  return output;
}

function formatFileTree(node, prefix = '', isLast = true) {
  if (!node) return '';
  
  let output = '';
  const connector = isLast ? '└── ' : '├── ';
  
  if (node.name !== 'root') {
    output += prefix + connector + node.name + '\n';
  }
  
  if (node.children && node.children.length > 0) {
    const newPrefix = node.name === 'root' ? '' : prefix + (isLast ? '    ' : '│   ');
    node.children.forEach((child, index) => {
      const childIsLast = index === node.children.length - 1;
      output += formatFileTree(child, newPrefix, childIsLast);
    });
  }
  
  return output;
}

function getFileLanguage(filename) {
  const ext = filename.split('.').pop();
  const langMap = {
    'js': 'javascript',
    'ts': 'typescript',
    'py': 'python',
    'html': 'html',
    'css': 'css',
    'json': 'json',
    'md': 'markdown',
    'yml': 'yaml',
    'yaml': 'yaml'
  };
  return langMap[ext] || '';
}

function getHelpMessage() {
  return `# 📚 Help & Examples

## Available Tools

### 💻 Code Generator
Generate complete projects with AI.

**Examples:**
• "Generate a todo app in React"
• "Create a REST API in Python using FastAPI"
• "Build a calculator in JavaScript"

### 🐛 Bug Detector
Find bugs and issues in your code.

**Examples:**
• "Detect bugs in file: server.js language: javascript"
• "Find issues in file: app.py language: python"

### ✅ Best Practices
Check code quality and standards.

**Examples:**
• "Check best practices language: javascript"
• "Review code quality for React"

### 🚀 GitHub Commit
Push code to GitHub repository.

**Examples:**
• "Commit to github repo: my-repo branch: main message: 'Initial commit'"
• "Push code to repository: test-app"

---

**Special Commands:**
• \`help\` - Show this help
• \`tools\` - List available tools

Just describe what you want in natural language! 🎉`;
}

function formatToolsList(tools) {
  let output = `# 🛠️ Available MCP Tools\n\n`;
  
  tools.forEach((tool, index) => {
    const icons = {
      'generate-code': '💻',
      'detect-bugs': '🐛',
      'check-best-practices': '✅',
      'github-commit': '🚀'
    };
    
    const icon = icons[tool.name] || '🔧';
    
    output += `## ${icon} ${index + 1}. ${tool.name}\n`;
    output += `${tool.description}\n\n`;
  });
  
  output += `---\n\nType the name of any tool or just describe what you want to do!`;
  
  return output;
}

// Start server
server.listen(PORT, () => {
  console.log(`\n🌐 MCP Chatbot Backend Server`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📁 Serving web files from: ${__dirname}`);
  console.log(`🔌 WebSocket ready for connections`);
  console.log(`\n👉 Open http://localhost:${PORT} in your browser\n`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

