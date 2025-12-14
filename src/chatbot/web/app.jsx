const { useState, useEffect, useRef } = React;

function ChatApp() {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState([
    {
      sender: "Bot",
      type: "bot",
      content: `Hello! I'm your AI Code Assistant. I can help you with:

- Generating code projects
- Detecting bugs in your code
- Checking best practices
- Committing to GitHub

Try asking me something like "Generate a todo app in React" or click the examples in the sidebar!`,
    },
  ]);
  const [userInput, setUserInput] = useState("");
  const [showToolModal, setShowToolModal] = useState(false);
  const [toolForm, setToolForm] = useState(null);
  const [ws, setWs] = useState(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [projectData, setProjectData] = useState(null);
  const chatRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // WebSocket connection
  useEffect(() => {
    connectWebSocket();
    return () => {
      if (ws) ws.close();
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectWebSocket = () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}`;
    const socket = new WebSocket(wsUrl);
    setWs(socket);

    socket.onopen = () => {
      setConnected(true);
      setReconnectAttempts(0);
      addMessage("System", "Connected to AI Chatbot. Type your request or say 'help' for examples.", "bot");

      // Ping keep-alive
      pingIntervalRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "ping" }));
        }
      }, 30000);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
      } catch (err) {
        console.error("Parse error:", err);
      }
    };

    socket.onerror = (err) => {
      console.error("WebSocket error:", err);
      setConnected(false);
      addMessage("System", "Connection error. Retrying...", "bot");
    };

    socket.onclose = () => {
      setConnected(false);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

      if (reconnectAttempts < 5) {
        const next = reconnectAttempts + 1;
        setReconnectAttempts(next);
        const delay = Math.min(1000 * Math.pow(2, next), 10000);
        addMessage("System", `Connection lost. Reconnecting in ${delay / 1000}s...`, "bot");
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
      } else {
        addMessage("System", "Connection lost. Please refresh the page.", "bot");
      }
    };
  };

  const handleServerMessage = (data) => {
    switch (data.type) {
      case "connected":
        // Ignore; already handled
        break;
      case "pong":
        break;
      case "thinking":
        addMessage("Bot", data.message + " 🤔", "bot");
        break;
      case "processing":
        addMessage("Bot", data.message + " ⚙️", "bot");
        break;
      case "response":
        addMessageMarkdown("Bot", data.content, "bot");
        if (data.tool === "generate-code" && data.projectData) {
          setProjectData(data.projectData);
          addActionButtons();
        }
        break;
      case "error":
        addMessage("Bot", `❌ Error: ${data.message}`, "bot");
        break;
      default:
        console.log("Unknown message type:", data.type);
    }
  };

  const addMessage = (sender, content, type = "") => {
    setMessages((prev) => [...prev, { sender, content, type }]);
    scrollToBottom();
  };

  const addMessageMarkdown = (sender, content, type = "") => {
    setMessages((prev) => [...prev, { sender, content, type, markdown: true }]);
    scrollToBottom();
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      if (chatRef.current) {
        chatRef.current.scrollTop = chatRef.current.scrollHeight;
      }
    }, 50);
  };

  const renderMarkdown = (text) => {
    const html = text
      .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
        return `<pre class="bg-slate-800 p-3 rounded border border-slate-700 overflow-auto"><code>${escapeHtml(
          code.trim()
        )}</code></pre>`;
      })
      .replace(/`([^`]+)`/g, "<code class='bg-slate-800 px-1 rounded border border-slate-700'>$1</code>")
      .replace(/^### (.*$)/gm, "<h3 class='text-lg font-semibold'>$1</h3>")
      .replace(/^## (.*$)/gm, "<h2 class='text-xl font-bold'>$1</h2>")
      .replace(/^# (.*$)/gm, "<h1 class='text-2xl font-bold'>$1</h1>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/^- (.*)$/gm, "<li>$1</li>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="text-indigo-400 underline" href="$2" target="_blank">$1</a>')
      .replace(/\n/g, "<br>")
      .replace(/(<li>.*<\/li><br>)+/g, (match) => `<ul class="list-disc ml-5 space-y-1">${match}</ul>`)
      .replace(/<\/li><br>/g, "</li>");
    return html;
  };

  const escapeHtml = (text) => {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  };

  const sendMessage = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      addMessage("System", "Not connected. Please wait...", "bot");
      return;
    }
    if (!userInput.trim()) return;
    ws.send(JSON.stringify({ type: "message", content: userInput.trim() }));
    addMessage("You", userInput.trim(), "user");
    setUserInput("");
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Tool Forms
  const openToolForm = (tool) => {
    setToolForm(tool);
    setShowToolModal(true);
  };
  const closeToolForm = () => {
    setShowToolModal(false);
    setToolForm(null);
  };

  const submitToolForm = (tool, formData) => {
    let message = "";
    switch (tool) {
      case "generate-code":
        message = `Generate a ${formData.description} in ${formData.language}${
          formData.framework ? ` using ${formData.framework}` : ""
        }`;
        break;
      case "detect-bugs":
        message = `Detect bugs in this ${formData.language} code:\n\n${formData.code}`;
        break;
      case "check-best-practices":
        message = `Check best practices for this ${formData.language} code${
          formData.framework ? ` (${formData.framework})` : ""
        }:\n\n${formData.code}`;
        break;
      case "github-commit":
        message = `Commit project at ${formData.path} to GitHub repository ${formData.repo} on branch ${
          formData.branch
        }${formData.message ? ` with message "${formData.message}"` : ""}`;
        break;
    }
    closeToolForm();
    setUserInput(message);
    // auto-send
    setTimeout(sendMessage, 50);
  };

  // Action buttons
  const addActionButtons = () => {
    addMessageMarkdown(
      "System",
      `### What next?\n- Use the buttons below to view or download your project.\n- Or ask for changes!`,
      "bot"
    );
  };

  const downloadProject = async () => {
    if (!projectData || !projectData.files) {
      addMessage("System", "No project available to download.", "bot");
      return;
    }
    const zip = new JSZip();
    projectData.files.forEach((file) => {
      zip.file(file.path, file.content);
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectData.projectName || "project"}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    addMessage("System", "Download started.", "bot");
  };

  const viewGeneratedCode = () => {
    if (!projectData || !projectData.files) {
      addMessage("System", "No project available to view.", "bot");
      return;
    }
    const filesList = projectData.files
      .map(
        (f, idx) =>
          `\n### ${idx + 1}. ${f.path}\n\`\`\`\n${f.content.slice(0, 800)}${
            f.content.length > 800 ? "\n... (truncated)" : ""
          }\n\`\`\``
      )
      .join("\n");
    addMessageMarkdown("Project Files", filesList, "bot");
  };

  // Components
  const ToolCard = ({ title, desc }) => (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
      <div className="text-slate-50 font-semibold">{title}</div>
      <div className="text-slate-400 text-sm">{desc}</div>
    </div>
  );

  const QuickButton = ({ label, onClick }) => (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg hover:border-indigo-400 hover:translate-x-0.5 transition"
    >
      {label}
    </button>
  );

  const ToolModal = () => {
    if (!showToolModal || !toolForm) return null;

    const close = () => closeToolForm();
    const submit = () => {
      const getVal = (id) => document.getElementById(id)?.value || "";
      switch (toolForm) {
        case "generate-code":
          submitToolForm("generate-code", {
            description: getVal("genDescription"),
            language: getVal("genLanguage"),
            framework: getVal("genFramework"),
          });
          break;
        case "detect-bugs":
          submitToolForm("detect-bugs", {
            code: getVal("bugCode"),
            language: getVal("bugLanguage"),
          });
          break;
        case "check-best-practices":
          submitToolForm("check-best-practices", {
            code: getVal("bpCode"),
            language: getVal("bpLanguage"),
            framework: getVal("bpFramework"),
          });
          break;
        case "github-commit":
          submitToolForm("github-commit", {
            path: getVal("ghPath"),
            repo: getVal("ghRepo"),
            branch: getVal("ghBranch"),
            message: getVal("ghMessage"),
          });
          break;
      }
    };

    const forms = {
      "generate-code": (
        <>
          <FormGroup label="Project Description *" htmlFor="genDescription">
            <textarea
              id="genDescription"
              rows="3"
              className="input"
              placeholder="e.g., A calculator app with basic operations"
            ></textarea>
          </FormGroup>
          <FormGroup label="Programming Language *" htmlFor="genLanguage">
            <select id="genLanguage" className="input">
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="java">Java</option>
              <option value="typescript">TypeScript</option>
              <option value="go">Go</option>
              <option value="rust">Rust</option>
            </select>
          </FormGroup>
          <FormGroup label="Framework (Optional)" htmlFor="genFramework">
            <input id="genFramework" className="input" placeholder="e.g., React, Express, Django" />
            <small className="text-slate-400">Leave empty if not using a specific framework</small>
          </FormGroup>
        </>
      ),
      "detect-bugs": (
        <>
          <div className="info-box mb-4">
            <div className="info-box-title">Tip: Paste your code</div>
            <div className="text-sm text-slate-200">Simply paste your code below and select the language.</div>
          </div>
          <FormGroup label="Code to Analyze *" htmlFor="bugCode">
            <textarea id="bugCode" rows="10" className="input font-mono" placeholder="Paste your code here..."></textarea>
          </FormGroup>
          <FormGroup label="Programming Language *" htmlFor="bugLanguage">
            <select id="bugLanguage" className="input">
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="java">Java</option>
              <option value="typescript">TypeScript</option>
              <option value="go">Go</option>
            </select>
          </FormGroup>
        </>
      ),
      "check-best-practices": (
        <>
          <div className="info-box mb-4">
            <div className="info-box-title">Tip: Paste your code</div>
            <div className="text-sm text-slate-200">Paste code to review for best practices.</div>
          </div>
          <FormGroup label="Code to Review *" htmlFor="bpCode">
            <textarea id="bpCode" rows="10" className="input font-mono" placeholder="Paste your code here..."></textarea>
          </FormGroup>
          <FormGroup label="Programming Language *" htmlFor="bpLanguage">
            <select id="bpLanguage" className="input">
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="java">Java</option>
              <option value="typescript">TypeScript</option>
              <option value="go">Go</option>
            </select>
          </FormGroup>
          <FormGroup label="Framework (Optional)" htmlFor="bpFramework">
            <input id="bpFramework" className="input" placeholder="e.g., React, Django" />
          </FormGroup>
        </>
      ),
      "github-commit": (
        <>
          <FormGroup label="Local Project Path *" htmlFor="ghPath">
            <input id="ghPath" className="input" placeholder="e.g., /Users/name/project" />
          </FormGroup>
          <FormGroup label="Repository Name *" htmlFor="ghRepo">
            <input id="ghRepo" className="input" placeholder="e.g., my-project" />
          </FormGroup>
          <FormGroup label="Branch *" htmlFor="ghBranch">
            <input id="ghBranch" className="input" defaultValue="main" />
          </FormGroup>
          <FormGroup label="Commit Message (Optional)" htmlFor="ghMessage">
            <input id="ghMessage" className="input" placeholder="Auto-generated if empty" />
          </FormGroup>
        </>
      ),
    };

    const titles = {
      "generate-code": "Generate Code",
      "detect-bugs": "Detect Bugs",
      "check-best-practices": "Best Practices",
      "github-commit": "GitHub Commit",
    };

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start md:items-center justify-center z-50 px-4 py-8">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <h2 className="text-xl font-semibold">{titles[toolForm]}</h2>
            <button onClick={close} className="text-slate-400 hover:text-slate-200 text-2xl leading-none">
              &times;
            </button>
          </div>
          <div className="p-5 space-y-4">{forms[toolForm]}</div>
          <div className="px-5 pb-5 flex gap-3">
            <button onClick={close} className="btn-secondary flex-1">
              Cancel
            </button>
            <button onClick={submit} className="btn-primary flex-1">
              Submit
            </button>
          </div>
        </div>
      </div>
    );
  };

  const ActionButtons = () => (
    <div className="flex gap-3 mt-3">
      <button onClick={downloadProject} className="btn-secondary">
        📥 Download Project
      </button>
      <button onClick={viewGeneratedCode} className="btn-secondary">
        👁️ View Code
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-slate-50">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Chatbot</h1>
          <p className="text-slate-400 text-sm">AI-Powered Code Assistant</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`w-3 h-3 rounded-full ${
              connected ? "bg-emerald-400" : "bg-red-500"
            } inline-block`}
          ></span>
          <span className="text-slate-200">{connected ? "Connected" : "Disconnected"}</span>
        </div>
      </header>

      <div className="grid md:grid-cols-[320px_1fr] min-h-[calc(100vh-80px)]">
        {/* Sidebar */}
        <aside className="bg-slate-900 border-r border-slate-800 p-4 space-y-6">
          <div>
            <h3 className="text-slate-200 font-semibold mb-3">Available Tools</h3>
            <div className="space-y-3">
              <ToolCard title="Code Generator" desc="Generate complete projects" />
              <ToolCard title="Bug Detector" desc="Find bugs and issues" />
              <ToolCard title="Best Practices" desc="Check code quality" />
              <ToolCard title="GitHub Commit" desc="Push to repository" />
            </div>
          </div>

          <div>
            <h3 className="text-slate-200 font-semibold mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <QuickButton label="Generate Code" onClick={() => openToolForm("generate-code")} />
              <QuickButton label="Detect Bugs" onClick={() => openToolForm("detect-bugs")} />
              <QuickButton label="Best Practices" onClick={() => openToolForm("check-best-practices")} />
              <QuickButton label="GitHub Commit" onClick={() => openToolForm("github-commit")} />
              <QuickButton label="Help" onClick={() => ws && ws.send(JSON.stringify({ type: "help" }))} />
            </div>
          </div>
        </aside>

        {/* Chat Area */}
        <main className="flex flex-col bg-slate-950">
          <div ref={chatRef} className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((m, idx) => (
              <div key={idx} className={`p-4 rounded-xl border ${m.type === "user" ? "border-indigo-500/30 bg-indigo-500/5" : "border-slate-700 bg-slate-900"}`}>
                <div className="text-sm text-slate-400 mb-1">{m.sender}</div>
                {m.markdown ? (
                  <div
                    className="prose prose-invert max-w-none prose-pre:bg-slate-800 prose-pre:border prose-pre:border-slate-700 prose-pre:rounded-lg prose-code:bg-slate-800 prose-code:px-1 prose-code:rounded"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                  />
                ) : (
                  <div className="whitespace-pre-wrap text-slate-100">{m.content}</div>
                )}
                {projectData && m.content.includes("What next?") && <ActionButtons />}
              </div>
            ))}
          </div>

          <div className="border-t border-slate-800 p-4 bg-slate-900">
            <div className="flex items-center gap-3">
              <textarea
                id="userInput"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyPress={handleKeyPress}
                rows={2}
                className="flex-1 input font-medium"
                placeholder="Type your command here... (e.g., 'Generate a REST API in Python')"
              ></textarea>
              <button onClick={sendMessage} className="btn-primary px-4">
                ➤
              </button>
            </div>
            <div className="text-xs text-slate-500 mt-2">
              Press Enter to send • Shift+Enter for new line • Type "help" for examples
            </div>
          </div>
        </main>
      </div>

      {showToolModal && <ToolModal />}
    </div>
  );
}

// Helper components/styles
const FormGroup = ({ label, htmlFor, children }) => (
  <div className="space-y-2">
    <label htmlFor={htmlFor} className="text-sm text-slate-200 font-medium">
      {label}
    </label>
    {children}
  </div>
);

const styles = document.createElement("style");
styles.innerHTML = `
.input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid #334155;
  background: #0f172a;
  color: #e2e8f0;
  outline: none;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}
.input:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.35);
}
.btn-primary {
  background: linear-gradient(90deg, #6366f1, #a855f7);
  color: #fff;
  font-weight: 600;
  border: none;
  border-radius: 0.75rem;
  padding: 0.5rem 1rem;
  box-shadow: 0 10px 30px rgba(99, 102, 241, 0.25);
  transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
}
.btn-secondary {
  border: 1px solid #475569;
  background: #0f172a;
  color: #e2e8f0;
  font-weight: 600;
  border-radius: 0.75rem;
  padding: 0.5rem 1rem;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.btn-secondary:hover {
  border-color: #818cf8;
  transform: translateY(-1px);
}
.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 34px rgba(99, 102, 241, 0.3);
}
.info-box {
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: 0.75rem;
  padding: 0.5rem 0.75rem;
}
.info-box-title {
  color: #fcd34d;
  font-weight: 700;
  margin-bottom: 0.25rem;
}
.message ul { margin-left: 1.25rem; list-style: disc; }
`;
document.head.appendChild(styles);

ReactDOM.createRoot(document.getElementById("root")).render(<ChatApp />);

