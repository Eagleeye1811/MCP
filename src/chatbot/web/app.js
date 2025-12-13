// MCP Chatbot Web App - Real Backend Connection

class MCPChatbotWeb {
  constructor() {
    this.messages = [];
    this.isProcessing = false;
    this.messageInput = document.getElementById("messageInput");
    this.sendButton = document.getElementById("sendButton");
    this.chatMessages = document.getElementById("chatMessages");
    this.loadingOverlay = document.getElementById("loadingOverlay");
    this.ws = null;
    this.isConnected = false;
    this.projectHandler = new ProjectHandler();

    this.init();
  }

  init() {
    // Setup event listeners
    this.messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    this.messageInput.addEventListener("input", () => {
      this.autoResize();
    });

    // Connect to backend WebSocket
    this.connectWebSocket();
  }

  connectWebSocket() {
    const wsUrl = `ws://${window.location.hostname}:3001`;
    console.log("Connecting to backend:", wsUrl);

    this.updateConnectionStatus(false);
    this.addMessage("bot", "🔄 Connecting to MCP server...");

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("✅ WebSocket connected");
      };

      this.ws.onmessage = (event) => {
        this.handleBackendMessage(JSON.parse(event.data));
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        this.updateConnectionStatus(false);
        this.addMessage(
          "bot",
          "❌ Connection error. Make sure the backend server is running:\n\n```bash\nnpm run web:server\n```"
        );
      };

      this.ws.onclose = () => {
        console.log("WebSocket closed");
        this.updateConnectionStatus(false);
        this.isConnected = false;

        // Attempt to reconnect after 3 seconds
        setTimeout(() => {
          if (!this.isConnected) {
            this.addMessage("bot", "🔄 Attempting to reconnect...");
            this.connectWebSocket();
          }
        }, 3000);
      };
    } catch (error) {
      console.error("Failed to create WebSocket:", error);
      this.addMessage(
        "bot",
        "❌ Failed to connect. Please start the backend server:\n\n```bash\nnpm run web:server\n```"
      );
    }
  }

  handleBackendMessage(message) {
    const { type, data } = message;

    switch (type) {
      case "connected":
        this.isConnected = true;
        this.updateConnectionStatus(true);
        this.addMessage(
          "bot",
          `✅ ${data.message}\n\n**Available Tools:**\n${data.tools
            .map((t, i) => `${i + 1}. **${t.name}** - ${t.description}`)
            .join("\n")}\n\nType a command or "help" to get started!`
        );
        break;

      case "processing":
        this.showLoading(true);
        break;

      case "executing":
        // Show which tool is being executed
        console.log("Executing tool:", data.tool);
        break;

      case "progress":
        // Show progress message without hiding loading
        this.addMessage("bot", `⏳ ${data.message}`);
        break;

      case "response":
        this.showLoading(false);
        const messageElement = this.addMessage(
          "bot",
          this.formatResponse(data)
        );

        // If code generation, show action buttons
        if (data.tool === "generate-code" && data.projectData) {
          this.projectHandler.showProjectActions(
            data.projectData,
            messageElement
          );
        }
        break;

      case "error":
        this.showLoading(false);
        this.addMessage("bot", `❌ Error: ${data.message || data.error}`);
        break;

      default:
        console.log("Unknown message type:", type, data);
    }
  }

  formatResponse(data) {
    if (data.type === "error") {
      return `❌ **Error**\n\n${data.content}`;
    }

    if (data.type === "help" || data.type === "tools") {
      return data.content;
    }

    if (data.type === "success") {
      return `✅ **${this.getToolDisplayName(data.tool)} - Success!**\n\n${
        data.content
      }`;
    }

    return data.content || JSON.stringify(data, null, 2);
  }

  getToolDisplayName(toolName) {
    const names = {
      "generate-code": "Code Generator",
      "detect-bugs": "Bug Detector",
      "check-best-practices": "Best Practices Checker",
      "github-commit": "GitHub Commit",
    };
    return names[toolName] || toolName;
  }

  autoResize() {
    this.messageInput.style.height = "auto";
    this.messageInput.style.height = this.messageInput.scrollHeight + "px";
  }

  updateConnectionStatus(connected) {
    const status = document.getElementById("connectionStatus");
    const dot = status.querySelector(".status-dot");
    const text = status.querySelector(".status-text");

    if (connected) {
      dot.classList.remove("disconnected");
      dot.classList.add("connected");
      text.textContent = "Connected";
    } else {
      dot.classList.remove("connected");
      dot.classList.add("disconnected");
      text.textContent = "Disconnected";
    }
  }

  sendMessage() {
    const message = this.messageInput.value.trim();

    if (!message || this.isProcessing || !this.isConnected) {
      if (!this.isConnected) {
        this.addMessage(
          "bot",
          "❌ Not connected to server. Please wait for connection..."
        );
      }
      return;
    }

    // Add user message
    this.addMessage("user", message);
    this.messageInput.value = "";
    this.autoResize();

    // Send command to backend via WebSocket
    this.isProcessing = true;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "command",
          data: { input: message },
        })
      );
    } else {
      this.addMessage("bot", "❌ Connection lost. Reconnecting...");
      this.isProcessing = false;
      this.connectWebSocket();
    }
  }

  addMessage(type, content) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${type}-message`;

    const avatar = type === "bot" ? "🤖" : "👤";
    const name = type === "bot" ? "MCP Chatbot" : "You";

    // Format content for display
    let formattedContent = this.formatMarkdown(content);

    messageDiv.innerHTML = `
            <div class="message-avatar">${avatar}</div>
            <div class="message-content">
                <div class="message-header">${name}</div>
                <div class="message-text">${formattedContent}</div>
            </div>
        `;

    this.chatMessages.appendChild(messageDiv);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    this.isProcessing = false;

    return messageDiv; // Return the element for further manipulation
  }

  formatMarkdown(text) {
    let html = this.escapeHtml(text);

    // Code blocks
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre><code class="language-${
        lang || ""
      }">${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Headers
    html = html.replace(/^### (.+)$/gm, "<h4>$1</h4>");
    html = html.replace(/^## (.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^# (.+)$/gm, "<h2>$1</h2>");

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    // Italic
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

    // Links
    html = html.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank">$1</a>'
    );

    // Lists
    html = html.replace(/^• (.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");

    // Line breaks
    html = html.replace(/\n\n/g, "<br><br>");
    html = html.replace(/\n/g, "<br>");

    return html;
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  showLoading(show) {
    if (show) {
      this.loadingOverlay.classList.add("active");
      this.sendButton.disabled = true;
    } else {
      this.loadingOverlay.classList.remove("active");
      this.sendButton.disabled = false;
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Tool form management
window.openToolForm = function (toolName) {
  const modal = document.getElementById("toolModal");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");

  const toolTitles = {
    "generate-code": "📝 Generate Code",
    "detect-bugs": "🐛 Detect Bugs",
    "check-best-practices": "✅ Check Best Practices",
    "github-commit": "🚀 GitHub Commit",
  };

  modalTitle.textContent = toolTitles[toolName] || "Tool Configuration";
  modalBody.innerHTML = getToolForm(toolName);
  modal.style.display = "block";
};

window.closeToolForm = function () {
  const modal = document.getElementById("toolModal");
  modal.style.display = "none";
};

window.submitToolForm = function (toolName) {
  const formData = getFormData(toolName);
  if (!formData) return;

  const command = buildCommand(toolName, formData);

  // Close modal
  closeToolForm();

  // Fill the input and send
  const input = document.getElementById("messageInput");
  input.value = command;
  if (window.chatbot) {
    window.chatbot.sendMessage();
  }
};

function getToolForm(toolName) {
  switch (toolName) {
    case "generate-code":
      return `
                <div class="form-group">
                    <label for="genDescription">What do you want to generate? *</label>
                    <textarea id="genDescription" placeholder="e.g., A REST API for managing users with CRUD operations"></textarea>
                    <small>Describe the code or project you want to generate</small>
                </div>
                <div class="form-group">
                    <label for="genLanguage">Programming Language *</label>
                    <select id="genLanguage">
                        <option value="javascript">JavaScript</option>
                        <option value="python">Python</option>
                        <option value="java">Java</option>
                        <option value="typescript">TypeScript</option>
                        <option value="go">Go</option>
                        <option value="rust">Rust</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="genFramework">Framework (Optional)</label>
                    <input type="text" id="genFramework" placeholder="e.g., React, Express, Django">
                    <small>Leave empty if not using a specific framework</small>
                </div>
                <div class="form-actions">
                    <button class="btn btn-secondary" onclick="closeToolForm()">Cancel</button>
                    <button class="btn btn-primary" onclick="submitToolForm('generate-code')">Generate</button>
                </div>
            `;

    case "detect-bugs":
      return `
                <div class="form-group">
                    <label for="bugRootDir">📁 Project Folder Path (NOT the file) *</label>
                    <input type="text" id="bugRootDir" placeholder="e.g., D:\\javascript-calculator">
                    <small style="color: #fbbf24;">⚠️ <strong>IMPORTANT:</strong> Enter ONLY the folder path, NOT the file path!<br>
                    ✅ Correct: <code>D:\\my-project</code><br>
                    ❌ Wrong: <code>D:\\my-project\\index.js</code></small>
                </div>
                <div class="form-group">
                    <label for="bugFileName">📄 File Name (just the filename) *</label>
                    <input type="text" id="bugFileName" placeholder="e.g., index.js">
                    <small>Enter just the filename like <code>index.js</code> or <code>app.py</code></small>
                </div>
                <div class="form-group">
                    <label for="bugLanguage">Programming Language *</label>
                    <select id="bugLanguage">
                        <option value="javascript">JavaScript</option>
                        <option value="python">Python</option>
                        <option value="java">Java</option>
                        <option value="typescript">TypeScript</option>
                        <option value="go">Go</option>
                    </select>
                </div>
                <div class="form-actions">
                    <button class="btn btn-secondary" onclick="closeToolForm()">Cancel</button>
                    <button class="btn btn-primary" onclick="submitToolForm('detect-bugs')">Analyze</button>
                </div>
            `;

    case "check-best-practices":
      return `
                <div class="form-group">
                    <label for="bpCode">Your Code *</label>
                    <textarea id="bpCode" placeholder="Paste your code here..."></textarea>
                    <small>Paste the code you want to review</small>
                </div>
                <div class="form-group">
                    <label for="bpLanguage">Programming Language *</label>
                    <select id="bpLanguage">
                        <option value="javascript">JavaScript</option>
                        <option value="python">Python</option>
                        <option value="java">Java</option>
                        <option value="typescript">TypeScript</option>
                        <option value="go">Go</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="bpFramework">Framework (Optional)</label>
                    <input type="text" id="bpFramework" placeholder="e.g., React, Node.js">
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="bpStrict"> Strict Mode (More Critical Review)
                    </label>
                </div>
                <div class="form-actions">
                    <button class="btn btn-secondary" onclick="closeToolForm()">Cancel</button>
                    <button class="btn btn-primary" onclick="submitToolForm('check-best-practices')">Check</button>
                </div>
            `;

    case "github-commit":
      return `
                <div class="form-group">
                    <label for="gitLocalPath">📁 Your Project Folder Path *</label>
                    <input type="text" id="gitLocalPath" placeholder="e.g., D:\\my-projects\\todo-app">
                    <small style="color: #fbbf24;">⚠️ Path to YOUR project folder (not this MCP project)<br>
                    Example: <code>D:\\javascript-calculator</code></small>
                </div>
                <div class="form-group">
                    <label for="gitRepo">Repository Name *</label>
                    <input type="text" id="gitRepo" placeholder="e.g., my-awesome-project">
                </div>
                <div class="form-group">
                    <label for="gitBranch">Branch Name *</label>
                    <input type="text" id="gitBranch" value="main" placeholder="e.g., main">
                </div>
                <div class="form-group">
                    <label for="gitMessage">Commit Message *</label>
                    <textarea id="gitMessage" rows="3" placeholder="e.g., Added new feature"></textarea>
                </div>
                <div class="form-group">
                    <label for="gitOwner">GitHub Owner (Optional)</label>
                    <input type="text" id="gitOwner" placeholder="Your GitHub username">
                    <small>Leave empty to use default from .env</small>
                </div>
                <div class="form-actions">
                    <button class="btn btn-secondary" onclick="closeToolForm()">Cancel</button>
                    <button class="btn btn-primary" onclick="submitToolForm('github-commit')">Commit & Push</button>
                </div>
            `;
  }
}

function getFormData(toolName) {
  switch (toolName) {
    case "generate-code":
      const genDesc = document.getElementById("genDescription").value.trim();
      const genLang = document.getElementById("genLanguage").value;
      const genFrame = document.getElementById("genFramework").value.trim();

      if (!genDesc) {
        alert("Please provide a description");
        return null;
      }

      return { description: genDesc, language: genLang, framework: genFrame };

    case "detect-bugs":
      const bugRoot = document.getElementById("bugRootDir").value.trim();
      const bugFile = document.getElementById("bugFileName").value.trim();
      const bugLang = document.getElementById("bugLanguage").value;

      if (!bugRoot || !bugFile) {
        alert("Please provide project path and file name");
        return null;
      }

      // Validation: Check if user accidentally put the filename in the directory field
      if (
        bugRoot.endsWith(".js") ||
        bugRoot.endsWith(".py") ||
        bugRoot.endsWith(".java") ||
        bugRoot.endsWith(".ts") ||
        bugRoot.endsWith(".html") ||
        bugRoot.endsWith(".css")
      ) {
        alert(
          "⚠️ ERROR: You entered a file path in the 'Project Folder' field!\n\n" +
            "Please enter ONLY the folder path (without the filename).\n\n" +
            "Example:\n" +
            "✅ Folder: D:\\javascript-calculator\n" +
            "✅ File: index.js"
        );
        return null;
      }

      // Validation: Check if the filename contains a path
      if (bugFile.includes("\\") || bugFile.includes("/")) {
        alert(
          "⚠️ ERROR: The 'File Name' field should contain ONLY the filename!\n\n" +
            "Don't include the path here.\n\n" +
            "Example:\n" +
            "✅ Correct: index.js\n" +
            "❌ Wrong: D:\\project\\index.js"
        );
        return null;
      }

      return { rootDirectory: bugRoot, fileName: bugFile, language: bugLang };

    case "check-best-practices":
      const bpCode = document.getElementById("bpCode").value.trim();
      const bpLang = document.getElementById("bpLanguage").value;
      const bpFrame = document.getElementById("bpFramework").value.trim();
      const bpStrict = document.getElementById("bpStrict").checked;

      if (!bpCode) {
        alert("Please provide code to analyze");
        return null;
      }

      return {
        code: bpCode,
        language: bpLang,
        framework: bpFrame,
        strictMode: bpStrict,
      };

    case "github-commit":
      const gitPath = document.getElementById("gitLocalPath").value.trim();
      const gitRepo = document.getElementById("gitRepo").value.trim();
      const gitBranch = document.getElementById("gitBranch").value.trim();
      const gitMsg = document.getElementById("gitMessage").value.trim();
      const gitOwner = document.getElementById("gitOwner").value.trim();

      if (!gitPath || !gitRepo || !gitBranch || !gitMsg) {
        alert("Please fill all required fields");
        return null;
      }

      // Validation: Warn if it looks like they're using the MCP project path
      if (gitPath.includes("MCP Proj\\MCP") || gitPath.includes("MCP/src")) {
        const confirmed = confirm(
          "⚠️ WARNING: You're trying to commit the MCP server project!\n\n" +
            "This tool is meant to commit YOUR projects, not this MCP project.\n\n" +
            "Are you sure you want to continue?"
        );
        if (!confirmed) {
          return null;
        }
      }

      return {
        localPath: gitPath,
        repo: gitRepo,
        branch: gitBranch,
        message: gitMsg,
        owner: gitOwner,
      };
  }
}

function buildCommand(toolName, formData) {
  switch (toolName) {
    case "generate-code":
      let cmd = `Generate ${formData.description} in ${formData.language}`;
      if (formData.framework) cmd += ` using ${formData.framework}`;
      return cmd;

    case "detect-bugs":
      return `Detect bugs in file: ${formData.fileName} directory: ${formData.rootDirectory} language: ${formData.language}`;

    case "check-best-practices":
      return `Check best practices for this ${formData.language} code${
        formData.framework ? " using " + formData.framework : ""
      }${formData.strictMode ? " (strict mode)" : ""}:\n\n${formData.code}`;

    case "github-commit":
      return `Commit to github localPath: ${formData.localPath} repo: ${
        formData.repo
      } branch: ${formData.branch} message: ${formData.message}${
        formData.owner ? " owner: " + formData.owner : ""
      }`;
  }
}

// Close modal when clicking outside
window.onclick = function (event) {
  const modal = document.getElementById("toolModal");
  if (event.target === modal) {
    closeToolForm();
  }
};

// Global function for example buttons
window.fillExample = function (text) {
  const input = document.getElementById("messageInput");
  input.value = text;
  input.focus();
  input.dispatchEvent(new Event("input"));
};

window.sendMessage = function () {
  if (window.chatbot) {
    window.chatbot.sendMessage();
  }
};

// Initialize chatbot when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    window.chatbot = new MCPChatbotWeb();
  });
} else {
  window.chatbot = new MCPChatbotWeb();
}
