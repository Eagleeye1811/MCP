/**
 * Web Project Handler - Handle generated projects in browser
 */

class ProjectHandler {
  constructor() {
    this.currentProject = null;
  }

  /**
   * Show action buttons for generated project
   */
  showProjectActions(projectData, messageElement) {
    if (!projectData || !projectData.success) return;

    this.currentProject = projectData;
    
    const projectType = this.detectProjectType(projectData);
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'project-actions';
    
    actionsDiv.innerHTML = `
      <div class="actions-header">
        <h3>🎉 What would you like to do?</h3>
      </div>
      <div class="action-buttons">
        ${projectType === 'web' ? `
          <button class="action-btn primary" onclick="window.chatbot.projectHandler.openInBrowser()">
            <span class="btn-icon">🌐</span>
            <span class="btn-text">
              <strong>Open in Browser</strong>
              <small>View your project live</small>
            </span>
          </button>
        ` : ''}
        
        <button class="action-btn" onclick="window.chatbot.projectHandler.downloadProject()">
          <span class="btn-icon">📥</span>
          <span class="btn-text">
            <strong>Download Files</strong>
            <small>Get as ZIP file</small>
          </span>
        </button>
        
        <button class="action-btn" onclick="window.chatbot.projectHandler.viewCode()">
          <span class="btn-icon">📄</span>
          <span class="btn-text">
            <strong>View Code</strong>
            <small>See all files</small>
          </span>
        </button>
        
        <button class="action-btn secondary" onclick="window.chatbot.projectHandler.showInstructions()">
          <span class="btn-icon">📝</span>
          <span class="btn-text">
            <strong>Setup Instructions</strong>
            <small>How to run locally</small>
          </span>
        </button>
      </div>
    `;
    
    messageElement.querySelector('.message-text').appendChild(actionsDiv);
  }

  /**
   * Detect project type
   */
  detectProjectType(projectData) {
    const files = projectData.files.map(f => f.path.toLowerCase());
    
    if (files.includes('index.html')) {
      return 'web';
    }
    
    if (projectData.framework?.toLowerCase() === 'react') {
      return 'react';
    }
    
    if (files.includes('package.json')) {
      return 'nodejs';
    }
    
    if (files.some(f => f.endsWith('.py'))) {
      return 'python';
    }
    
    return 'other';
  }

  /**
   * Open web project in new tab
   */
  openInBrowser() {
    if (!this.currentProject) return;
    
    const projectType = this.detectProjectType(this.currentProject);
    
    if (projectType !== 'web') {
      alert('This project is not a static web project. Use "Download Files" instead.');
      return;
    }
    
    // Create a new window with the project
    const win = window.open('about:blank', '_blank');
    
    if (!win) {
      alert('Pop-up blocked! Please allow pop-ups and try again.');
      return;
    }
    
    // Build the HTML with all files inline
    const indexFile = this.currentProject.files.find(f => f.path === 'index.html');
    const cssFiles = this.currentProject.files.filter(f => f.path.endsWith('.css'));
    const jsFiles = this.currentProject.files.filter(f => f.path.endsWith('.js') && !f.path.includes('node_modules'));
    
    let html = indexFile.content;
    
    // Inline CSS
    cssFiles.forEach(file => {
      const styleTag = `<style>/* ${file.path} */\n${file.content}\n</style>`;
      html = html.replace('</head>', `${styleTag}\n</head>`);
    });
    
    // Inline JavaScript
    jsFiles.forEach(file => {
      const scriptTag = `<script>/* ${file.path} */\n${file.content}\n</script>`;
      html = html.replace('</body>', `${scriptTag}\n</body>`);
    });
    
    win.document.write(html);
    win.document.close();
    
    window.chatbot.addMessage('bot', '🌐 Project opened in new tab! Check your browser tabs.');
  }

  /**
   * Download project as ZIP
   */
  async downloadProject() {
    if (!this.currentProject) return;
    
    try {
      // Check if JSZip is available
      if (typeof JSZip === 'undefined') {
        // Load JSZip dynamically
        await this.loadJSZip();
      }
      
      const zip = new JSZip();
      const projectFolder = zip.folder(this.currentProject.projectName);
      
      // Add all files to ZIP
      this.currentProject.files.forEach(file => {
        projectFolder.file(file.path, file.content);
      });
      
      // Generate ZIP
      const content = await zip.generateAsync({ type: 'blob' });
      
      // Download
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.currentProject.projectName}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      
      window.chatbot.addMessage('bot', `📥 Downloaded: ${this.currentProject.projectName}.zip\n\nExtract the ZIP file and open it in your code editor!`);
    } catch (error) {
      console.error('Error creating ZIP:', error);
      alert('Error creating ZIP file. See console for details.');
    }
  }

  /**
   * Load JSZip library dynamically
   */
  loadJSZip() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  /**
   * View code files
   */
  viewCode() {
    if (!this.currentProject) return;
    
    let codeView = '# 📁 Generated Files\n\n';
    
    this.currentProject.files.forEach((file, index) => {
      codeView += `## ${index + 1}. ${file.path}\n\n`;
      if (file.description) {
        codeView += `*${file.description}*\n\n`;
      }
      
      const lang = this.getLanguage(file.path);
      codeView += `\`\`\`${lang}\n${file.content}\n\`\`\`\n\n`;
      codeView += `---\n\n`;
    });
    
    window.chatbot.addMessage('bot', codeView);
  }

  /**
   * Show setup instructions
   */
  showInstructions() {
    if (!this.currentProject) return;
    
    const instructions = this.currentProject.setupInstructions;
    let message = '# 📝 Setup Instructions\n\n';
    
    if (instructions.prerequisites?.length > 0) {
      message += '## Prerequisites\n\n';
      instructions.prerequisites.forEach(p => {
        message += `• ${p}\n`;
      });
      message += '\n';
    }
    
    if (instructions.installCommands?.length > 0) {
      message += '## Installation\n\n```bash\n';
      instructions.installCommands.forEach(cmd => {
        message += `${cmd}\n`;
      });
      message += '```\n\n';
    }
    
    if (instructions.runCommands?.length > 0) {
      message += '## Run Project\n\n```bash\n';
      instructions.runCommands.forEach(cmd => {
        message += `${cmd}\n`;
      });
      message += '```\n\n';
    }
    
    if (this.currentProject.additionalNotes) {
      message += `## Additional Notes\n\n${this.currentProject.additionalNotes}\n`;
    }
    
    window.chatbot.addMessage('bot', message);
  }

  /**
   * Get file language for syntax highlighting
   */
  getLanguage(filename) {
    const ext = filename.split('.').pop();
    const langMap = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'html': 'html',
      'css': 'css',
      'json': 'json',
      'md': 'markdown'
    };
    return langMap[ext] || '';
  }
}

// Export for use in main app
if (typeof window !== 'undefined') {
  window.ProjectHandler = ProjectHandler;
}

