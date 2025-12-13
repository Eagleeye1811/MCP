import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { lookup } from 'mime-types';

const execAsync = promisify(exec);

/**
 * Project Runner - Handles saving and running generated projects
 */
export class ProjectRunner {
  constructor() {
    this.activeServers = new Map();
  }

  /**
   * Save generated project files to disk
   */
  async saveProject(projectData, outputDir) {
    try {
      const projectPath = join(outputDir, projectData.projectName);
      
      // Create project directory
      await mkdir(projectPath, { recursive: true });
      
      // Write all files
      for (const file of projectData.files) {
        const filePath = join(projectPath, file.path);
        const fileDir = dirname(filePath);
        
        // Create subdirectories if needed
        await mkdir(fileDir, { recursive: true });
        
        // Write file
        await writeFile(filePath, file.content, 'utf-8');
      }
      
      console.log(`✅ Project saved to: ${projectPath}`);
      return projectPath;
    } catch (error) {
      console.error('Error saving project:', error);
      throw new Error(`Failed to save project: ${error.message}`);
    }
  }

  /**
   * Detect project type
   */
  detectProjectType(projectData) {
    const files = projectData.files.map(f => f.path.toLowerCase());
    
    // Check if it's a web project (has index.html)
    if (files.includes('index.html')) {
      return 'web-static';
    }
    
    // Check if it's a React app
    if (files.some(f => f.includes('package.json')) && 
        projectData.framework?.toLowerCase() === 'react') {
      return 'react';
    }
    
    // Check if it's a Node.js project
    if (files.includes('package.json') && 
        files.some(f => f.endsWith('.js') || f.endsWith('.ts'))) {
      return 'nodejs';
    }
    
    // Check if it's Python
    if (files.some(f => f.endsWith('.py'))) {
      return 'python';
    }
    
    return 'unknown';
  }

  /**
   * Run project based on type
   */
  async runProject(projectData, projectPath) {
    const projectType = this.detectProjectType(projectData);
    
    console.log(`📦 Project type detected: ${projectType}`);
    
    switch (projectType) {
      case 'web-static':
        return await this.runWebProject(projectPath, projectData.projectName);
      
      case 'react':
      case 'nodejs':
        return await this.openInVSCode(projectPath);
      
      case 'python':
        return await this.openInVSCode(projectPath);
      
      default:
        return await this.openInVSCode(projectPath);
    }
  }

  /**
   * Run a static web project in browser
   */
  async runWebProject(projectPath, projectName) {
    try {
      // Find available port
      const port = await this.findAvailablePort(8080);
      
      // Create simple HTTP server
      const server = createServer((req, res) => {
        let filePath = join(projectPath, req.url === '/' ? 'index.html' : req.url);
        
        // Security: prevent directory traversal
        if (!filePath.startsWith(projectPath)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        
        // Check if file exists
        if (!existsSync(filePath)) {
          res.writeHead(404);
          res.end('File not found');
          return;
        }
        
        try {
          const content = readFileSync(filePath);
          const mimeType = lookup(filePath) || 'text/plain';
          
          res.writeHead(200, { 'Content-Type': mimeType });
          res.end(content);
        } catch (error) {
          res.writeHead(500);
          res.end('Internal server error');
        }
      });
      
      // Start server
      await new Promise((resolve, reject) => {
        server.listen(port, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Store server reference
      this.activeServers.set(projectName, { server, port });
      
      const url = `http://localhost:${port}`;
      console.log(`🌐 Server started at: ${url}`);
      
      // Open in browser
      await this.openInBrowser(url);
      
      return {
        type: 'web',
        url: url,
        port: port,
        message: `🌐 Project running at ${url}\n\nServer will stay running. To stop it, use the "stop" command.`
      };
    } catch (error) {
      throw new Error(`Failed to run web project: ${error.message}`);
    }
  }

  /**
   * Open project in VS Code
   */
  async openInVSCode(projectPath) {
    try {
      console.log(`📝 Opening in VS Code: ${projectPath}`);
      
      // Try to open with VS Code
      try {
        await execAsync(`code "${projectPath}"`);
        return {
          type: 'vscode',
          path: projectPath,
          message: `📝 Project opened in VS Code\n\nPath: ${projectPath}\n\n💡 Next steps:\n1. Open terminal in VS Code\n2. Run: npm install (if needed)\n3. Run: npm start`
        };
      } catch (error) {
        // VS Code command not found, provide instructions
        return {
          type: 'manual',
          path: projectPath,
          message: `📁 Project saved to: ${projectPath}\n\n⚠️ VS Code command not found in PATH.\n\n📝 To open manually:\n1. Open VS Code\n2. File → Open Folder\n3. Navigate to: ${projectPath}\n\nOr add VS Code to PATH:\n1. Open VS Code\n2. Cmd+Shift+P → "Shell Command: Install 'code' command in PATH"`
        };
      }
    } catch (error) {
      throw new Error(`Failed to open in VS Code: ${error.message}`);
    }
  }

  /**
   * Open URL in default browser
   */
  async openInBrowser(url) {
    try {
      const platform = process.platform;
      const command = platform === 'darwin' ? 'open' : 
                     platform === 'win32' ? 'start' : 
                     'xdg-open';
      
      await execAsync(`${command} ${url}`);
      console.log(`🌐 Opened in browser: ${url}`);
    } catch (error) {
      console.log(`⚠️ Could not open browser automatically. Please visit: ${url}`);
    }
  }

  /**
   * Find available port
   */
  async findAvailablePort(startPort = 8080) {
    const { createServer } = await import('net');
    
    return new Promise((resolve) => {
      const server = createServer();
      server.listen(startPort, () => {
        const port = server.address().port;
        server.close(() => resolve(port));
      });
      
      server.on('error', () => {
        resolve(this.findAvailablePort(startPort + 1));
      });
    });
  }

  /**
   * Stop running server
   */
  stopServer(projectName) {
    const serverInfo = this.activeServers.get(projectName);
    if (serverInfo) {
      serverInfo.server.close();
      this.activeServers.delete(projectName);
      console.log(`🛑 Stopped server for: ${projectName}`);
      return true;
    }
    return false;
  }

  /**
   * Stop all servers
   */
  stopAllServers() {
    for (const [projectName, serverInfo] of this.activeServers) {
      serverInfo.server.close();
      console.log(`🛑 Stopped server for: ${projectName}`);
    }
    this.activeServers.clear();
  }
}

// Singleton instance
export const projectRunner = new ProjectRunner();

