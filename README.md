# AI Chatbot 🤖

A simple, powerful AI chatbot powered by Google Gemini for code assistance.

## Features

✨ **Natural Language Interface** - Just type what you want
🧠 **Gemini AI** - Smart intent understanding
🎨 **Clean Web UI** - Beautiful, modern interface
⚡ **4 Powerful Tools:**
- **Generate Code** - Create complete projects
- **Detect Bugs** - Find issues in your code
- **Best Practices** - Review code quality
- **GitHub Commit** - Push to GitHub

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Environment

Create `.env` file:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GITHUB_TOKEN=your_github_token_here
```

Get your API keys:
- **Gemini API:** https://aistudio.google.com/apikey
- **GitHub Token:** https://github.com/settings/tokens

### 3. Run the Server

```bash
npm start
```

Open http://localhost:3001 in your browser

## Usage Examples

### Natural Language Commands

```
Generate a calculator app in React
```

```
Check my code for bugs:

function test() {
  return x.tostring();
}

language: javascript
```

```
Review this Python code for best practices:

print("hello")
```

```
Commit my project at /path/to/project to GitHub repo my-project
```

## Project Structure

```
.
├── server.js                    # Main server (WebSocket + Express)
├── src/
│   ├── tools/                   # AI tools
│   │   ├── generate-code.js     # Code generation
│   │   ├── detect-bugs.js       # Bug detection
│   │   ├── check-best-practices.js  # Code review
│   │   └── github-commit.js     # GitHub integration
│   └── chatbot/
│       └── web/                 # Web interface
│           ├── index.html
│           ├── styles.css
│           └── app.js
├── package.json
└── .env                         # Your API keys
```

## Architecture

**Simple & Clean:**
```
Web UI → WebSocket → Single Server → Gemini AI + Tools
```

**No complexity:**
- ❌ No CLI
- ❌ No MCP protocol
- ❌ No command parser
- ❌ No multiple processes

**Just:**
- ✅ One server
- ✅ One command to run
- ✅ Natural language with Gemini

## Tech Stack

- **Backend:** Node.js + Express + WebSocket
- **AI:** Google Gemini 2.5 Flash
- **Frontend:** Vanilla JavaScript
- **APIs:** GitHub REST API

## Tips

1. **Type naturally** - The AI understands context
2. **Paste code directly** - No need for file paths
3. **Be specific** - Include language and framework
4. **Use "help"** - See examples anytime

## License

ISC

