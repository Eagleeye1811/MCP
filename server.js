import express from 'express';
import { WebSocketServer } from 'ws';
import { GoogleGenAI } from '@google/genai';
import { generateCode } from './src/tools/generate-code.js';
import { detectBugs } from './src/tools/detect-bugs.js';
import { checkBestPractices } from './src/tools/check-best-practices.js';
import autoCommitAndPush from './src/tools/github-commit.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Serve static files from web interface
app.use(express.static(join(__dirname, 'src', 'chatbot', 'web')));

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Serving from: ${join(__dirname, 'src', 'chatbot', 'web')}`);
});

// WebSocket server
const wss = new WebSocketServer({ server });

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Available tools
const TOOLS = [
  {
    name: 'generate-code',
    description: 'Generate complete projects with code',
    keywords: ['generate', 'create', 'build', 'make', 'code', 'project', 'app']
  },
  {
    name: 'detect-bugs',
    description: 'Analyze code for bugs and errors',
    keywords: ['bug', 'error', 'debug', 'analyze', 'check', 'find', 'issue']
  },
  {
    name: 'check-best-practices',
    description: 'Review code for best practices',
    keywords: ['best practice', 'review', 'improve', 'quality', 'standards']
  },
  {
    name: 'github-commit',
    description: 'Commit and push code to GitHub',
    keywords: ['github', 'commit', 'push', 'upload', 'repository']
  }
];

wss.on('connection', (ws) => {
  console.log('✅ Client connected');

  // Send initial connection message
  ws.send(JSON.stringify({ 
    type: 'connected', 
    message: 'Connected to AI Chatbot' 
  }));

  // Keep-alive ping
  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    }
  }, 30000);

  ws.on('pong', () => {
    // Connection is alive
  });

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      if (data.type === 'help') {
        const helpMessage = `## 🤖 Available Tools

${TOOLS.map(tool => `### ${tool.name}
${tool.description}
**Keywords:** ${tool.keywords.join(', ')}
`).join('\n')}

---

**Just type naturally!** For example:
- "Generate a calculator app in React"
- "Check my code for bugs: [paste code here]"
- "Review this code for best practices: [paste code]"
- "Commit my project to GitHub"`;

        ws.send(JSON.stringify({
          type: 'response',
          content: helpMessage
        }));
        return;
      }

      if (data.type === 'message') {
        const userMessage = data.content;
        
        // Send "thinking" status
        ws.send(JSON.stringify({ 
          type: 'thinking', 
          message: 'Understanding your request...' 
        }));

        // Use Gemini to understand the intent
        const intent = await analyzeIntent(userMessage);
        
        // Send "processing" status
        ws.send(JSON.stringify({ 
          type: 'processing', 
          message: `Processing with ${intent.tool}...` 
        }));

        // Execute the tool
        const result = await executeTool(intent.tool, intent.parameters);
        
        // Send formatted response
        ws.send(JSON.stringify({
          type: 'response',
          tool: intent.tool,
          content: formatResponse(intent.tool, result)
        }));
      }
    } catch (error) {
      console.error('Error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message || 'An error occurred'
      }));
    }
  });

  ws.on('close', () => {
    clearInterval(pingInterval);
    console.log('❌ Client disconnected');
  });
});

// Analyze user intent using Gemini AI
async function analyzeIntent(userMessage) {
  const prompt = `You are an AI assistant that interprets user requests and maps them to tools.

Available tools:
1. generate-code - Generate complete projects (requires: description, language, framework optional)
2. detect-bugs - Find bugs in code (requires: code, language)
3. check-best-practices - Review code quality (requires: code, language, framework optional)
4. github-commit - Commit code to GitHub (requires: localPath, repo, branch, message optional)

User message: "${userMessage}"

Analyze this message and respond ONLY with JSON:
{
  "tool": "tool-name",
  "parameters": {
    // extracted parameters
  },
  "confidence": 0.0-1.0
}

Examples:
- "Create a calculator in React" → {"tool": "generate-code", "parameters": {"description": "calculator", "language": "javascript", "framework": "React"}}
- "Check this code for bugs: function test() { return x; }" → {"tool": "detect-bugs", "parameters": {"code": "function test() { return x; }", "language": "javascript"}}
- "Review my Python code: print('hello')" → {"tool": "check-best-practices", "parameters": {"code": "print('hello')", "language": "python"}}

Extract parameters intelligently. For code generation, identify the language and framework from context.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.3,
      }
    });

    let text = response.text.trim();
    
    // Clean markdown
    if (text.startsWith('```json')) text = text.slice(7);
    else if (text.startsWith('```')) text = text.slice(3);
    if (text.endsWith('```')) text = text.slice(0, -3);
    
    const intent = JSON.parse(text.trim());
    
    // Validate tool exists
    if (!TOOLS.find(t => t.name === intent.tool)) {
      throw new Error(`Unknown tool: ${intent.tool}`);
    }
    
    return intent;
  } catch (error) {
    console.error('Intent analysis error:', error);
    throw new Error('Could not understand your request. Try being more specific or use "help" to see examples.');
  }
}

// Execute the appropriate tool
async function executeTool(toolName, parameters) {
  switch (toolName) {
    case 'generate-code':
      return await generateCode(parameters);
    
    case 'detect-bugs':
      return await detectBugs(parameters);
    
    case 'check-best-practices':
      const result = await checkBestPractices(parameters);
      return result.content[0].text; // Extract text from MCP format
    
    case 'github-commit':
      return await autoCommitAndPush(parameters);
    
    default:
      throw new Error(`Tool not implemented: ${toolName}`);
  }
}

// Format response for display
function formatResponse(toolName, result) {
  switch (toolName) {
    case 'generate-code':
      return `## ✅ Project Generated!

**Project:** ${result.projectName}
**Files:** ${result.files.length} files created
**Language:** ${result.summary.language}
${result.summary.framework ? `**Framework:** ${result.summary.framework}` : ''}

### 📁 File Structure
\`\`\`
${formatFileStructure(result.fileStructure)}
\`\`\`

### 📦 Setup Instructions

**Prerequisites:**
${result.setupInstructions.prerequisites.map(p => `- ${p}`).join('\n')}

**Installation:**
\`\`\`bash
${result.setupInstructions.installCommands.join('\n')}
\`\`\`

**Run:**
\`\`\`bash
${result.setupInstructions.runCommands.join('\n')}
\`\`\`

${result.setupInstructions.testCommands?.length ? `**Test:**
\`\`\`bash
${result.setupInstructions.testCommands.join('\n')}
\`\`\`` : ''}

${result.additionalNotes ? `### 📝 Notes\n${result.additionalNotes}` : ''}

---

*Use the buttons above to download or view code*`;

    case 'detect-bugs':
      return `## 🐛 Bug Analysis Complete

**Language:** ${result.language}
${result.fileName ? `**File:** ${result.fileName}` : ''}
**Lines Analyzed:** ${result.linesOfCode}

### 📊 Summary
- **Total Issues:** ${result.summary.totalIssues}
- **Critical:** ${result.summary.critical} 🔴
- **Warnings:** ${result.summary.warning} 🟡
- **Info:** ${result.summary.info} 🔵

### 🔍 Issues Found

${result.issues.length === 0 ? '✅ No issues found! Your code looks good.' : result.issues.map((issue, idx) => `
#### ${idx + 1}. ${issue.type} ${issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵'}

**Line:** ${issue.line}
**Description:** ${issue.description}

**Code:**
\`\`\`${result.language}
${issue.codeSnippet}
\`\`\`

**Fix:** ${issue.suggestion}
`).join('\n---\n')}

### 📝 Overall Assessment
${result.overallAssessment}

---
*Analyzed at: ${new Date(result.analyzedAt).toLocaleString()}*`;

    case 'check-best-practices':
      return result; // Already formatted

    case 'github-commit':
      return `## ✅ Committed to GitHub!

**Files Committed:** ${result.filesCommitted}
**Commit Message:** ${result.message}
**SHA:** \`${result.sha}\`

🔗 **View on GitHub:** ${result.url}`;

    default:
      return JSON.stringify(result, null, 2);
  }
}

// Helper to format file structure tree
function formatFileStructure(node, prefix = '', isLast = true) {
  if (node.type !== 'directory') return '';
  
  let result = node.name === 'root' ? '' : `${prefix}${isLast ? '└── ' : '├── '}${node.name}/\n`;
  
  if (node.children) {
    node.children.forEach((child, idx) => {
      const isLastChild = idx === node.children.length - 1;
      const newPrefix = node.name === 'root' ? '' : prefix + (isLast ? '    ' : '│   ');
      
      if (child.type === 'directory') {
        result += formatFileStructure(child, newPrefix, isLastChild);
      } else {
        result += `${newPrefix}${isLastChild ? '└── ' : '├── '}${child.name}\n`;
      }
    });
  }
  
  return result;
}

console.log('\n🤖 AI Chatbot Server Ready!');
console.log('📝 Try: "Generate a todo app in React"');
console.log('🐛 Try: "Check my code for bugs"');
console.log('✨ Try: "Review my code for best practices"\n');

