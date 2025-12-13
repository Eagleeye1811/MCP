// MCP Chatbot Web App - Real Backend Connection

class MCPChatbotWeb {
    constructor() {
        this.messages = [];
        this.isProcessing = false;
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.chatMessages = document.getElementById('chatMessages');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.ws = null;
        this.isConnected = false;
        this.projectHandler = new ProjectHandler();
        
        this.init();
    }

    init() {
        // Setup event listeners
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.messageInput.addEventListener('input', () => {
            this.autoResize();
        });

        // Connect to backend WebSocket
        this.connectWebSocket();
    }

    connectWebSocket() {
        const wsUrl = `ws://${window.location.hostname}:3001`;
        console.log('Connecting to backend:', wsUrl);
        
        this.updateConnectionStatus(false);
        this.addMessage('bot', '🔄 Connecting to MCP server...');

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('✅ WebSocket connected');
            };

            this.ws.onmessage = (event) => {
                this.handleBackendMessage(JSON.parse(event.data));
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateConnectionStatus(false);
                this.addMessage('bot', '❌ Connection error. Make sure the backend server is running:\n\n```bash\nnpm run web:server\n```');
            };

            this.ws.onclose = () => {
                console.log('WebSocket closed');
                this.updateConnectionStatus(false);
                this.isConnected = false;
                
                // Attempt to reconnect after 3 seconds
                setTimeout(() => {
                    if (!this.isConnected) {
                        this.addMessage('bot', '🔄 Attempting to reconnect...');
                        this.connectWebSocket();
                    }
                }, 3000);
            };
        } catch (error) {
            console.error('Failed to create WebSocket:', error);
            this.addMessage('bot', '❌ Failed to connect. Please start the backend server:\n\n```bash\nnpm run web:server\n```');
        }
    }

    handleBackendMessage(message) {
        const { type, data } = message;

        switch (type) {
            case 'connected':
                this.isConnected = true;
                this.updateConnectionStatus(true);
                this.addMessage('bot', `✅ ${data.message}\n\n**Available Tools:**\n${data.tools.map((t, i) => `${i + 1}. **${t.name}** - ${t.description}`).join('\n')}\n\nType a command or "help" to get started!`);
                break;

            case 'processing':
                this.showLoading(true);
                break;

            case 'executing':
                // Show which tool is being executed
                console.log('Executing tool:', data.tool);
                break;

            case 'progress':
                // Show progress message without hiding loading
                this.addMessage('bot', `⏳ ${data.message}`);
                break;

            case 'response':
                this.showLoading(false);
                const messageElement = this.addMessage('bot', this.formatResponse(data));
                
                // If code generation, show action buttons
                if (data.tool === 'generate-code' && data.projectData) {
                    this.projectHandler.showProjectActions(data.projectData, messageElement);
                }
                break;

            case 'error':
                this.showLoading(false);
                this.addMessage('bot', `❌ Error: ${data.message || data.error}`);
                break;

            default:
                console.log('Unknown message type:', type, data);
        }
    }

    formatResponse(data) {
        if (data.type === 'error') {
            return `❌ **Error**\n\n${data.content}`;
        }
        
        if (data.type === 'help' || data.type === 'tools') {
            return data.content;
        }

        if (data.type === 'success') {
            return `✅ **${this.getToolDisplayName(data.tool)} - Success!**\n\n${data.content}`;
        }

        return data.content || JSON.stringify(data, null, 2);
    }

    getToolDisplayName(toolName) {
        const names = {
            'generate-code': 'Code Generator',
            'detect-bugs': 'Bug Detector',
            'check-best-practices': 'Best Practices Checker',
            'github-commit': 'GitHub Commit'
        };
        return names[toolName] || toolName;
    }

    autoResize() {
        this.messageInput.style.height = 'auto';
        this.messageInput.style.height = this.messageInput.scrollHeight + 'px';
    }

    updateConnectionStatus(connected) {
        const status = document.getElementById('connectionStatus');
        const dot = status.querySelector('.status-dot');
        const text = status.querySelector('.status-text');
        
        if (connected) {
            dot.classList.remove('disconnected');
            dot.classList.add('connected');
            text.textContent = 'Connected';
        } else {
            dot.classList.remove('connected');
            dot.classList.add('disconnected');
            text.textContent = 'Disconnected';
        }
    }

    sendMessage() {
        const message = this.messageInput.value.trim();
        
        if (!message || this.isProcessing || !this.isConnected) {
            if (!this.isConnected) {
                this.addMessage('bot', '❌ Not connected to server. Please wait for connection...');
            }
            return;
        }

        // Add user message
        this.addMessage('user', message);
        this.messageInput.value = '';
        this.autoResize();

        // Send command to backend via WebSocket
        this.isProcessing = true;
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'command',
                data: { input: message }
            }));
        } else {
            this.addMessage('bot', '❌ Connection lost. Reconnecting...');
            this.isProcessing = false;
            this.connectWebSocket();
        }
    }


    addMessage(type, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;
        
        const avatar = type === 'bot' ? '🤖' : '👤';
        const name = type === 'bot' ? 'MCP Chatbot' : 'You';
        
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
            return `<pre><code class="language-${lang || ''}">${code.trim()}</code></pre>`;
        });
        
        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Headers
        html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
        html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
        
        // Bold
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        
        // Italic  
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        
        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
        
        // Lists
        html = html.replace(/^• (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
        
        // Line breaks
        html = html.replace(/\n\n/g, '<br><br>');
        html = html.replace(/\n/g, '<br>');
        
        return html;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showLoading(show) {
        if (show) {
            this.loadingOverlay.classList.add('active');
            this.sendButton.disabled = true;
        } else {
            this.loadingOverlay.classList.remove('active');
            this.sendButton.disabled = false;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Global function for example buttons
window.fillExample = function(text) {
    const input = document.getElementById('messageInput');
    input.value = text;
    input.focus();
    input.dispatchEvent(new Event('input'));
};

window.sendMessage = function() {
    if (window.chatbot) {
        window.chatbot.sendMessage();
    }
};

// Initialize chatbot when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.chatbot = new MCPChatbotWeb();
    });
} else {
    window.chatbot = new MCPChatbotWeb();
}

