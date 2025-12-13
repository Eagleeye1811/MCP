/**
 * Command Parser for MCP Chatbot
 * Parses natural language commands and maps them to MCP tool calls
 */

export class CommandParser {
  constructor() {
    this.commands = {
      'generate-code': {
        keywords: ['generate', 'create', 'build', 'make', 'code', 'project', 'app'],
        requiredParams: ['description', 'language'],
        optionalParams: ['framework', 'includeTests'],
      },
      'detect-bugs': {
        keywords: ['detect', 'find', 'bugs', 'errors', 'issues', 'analyze', 'check bugs'],
        requiredParams: ['language', 'rootDirectory', 'fileName'],
        optionalParams: ['code'],
      },
      'check-best-practices': {
        keywords: ['best practices', 'review', 'code quality', 'standards', 'check code'],
        requiredParams: ['code', 'language'],
        optionalParams: ['framework', 'strictMode'],
      },
      'github-commit': {
        keywords: ['commit', 'push', 'github', 'git', 'upload'],
        requiredParams: ['localPath', 'repo', 'branch', 'message'],
        optionalParams: [],
      },
    };
  }

  /**
   * Parse user command and extract intent and parameters
   */
  parseCommand(input) {
    const lowerInput = input.toLowerCase();
    
    // STRICT RULE: If input contains bug-related keywords, NEVER match generate-code
    const bugKeywords = ['detect', 'bugs', 'bug', 'find issues', 'find errors', 'analyze', 'check bugs', 'scan'];
    const hasBugIntent = bugKeywords.some(kw => lowerInput.includes(kw));
    
    // STRICT RULE: If input has "file:" or code pasting intent, it's analysis not generation
    const hasFileIntent = lowerInput.includes('file:') || 
                         lowerInput.includes('filename:') ||
                         lowerInput.includes('in this code') ||
                         lowerInput.includes('in my code') ||
                         lowerInput.includes('in the code');
    
    // If it's clearly about bug detection or code analysis, force detect-bugs
    if (hasBugIntent || hasFileIntent) {
      // Exception: if user explicitly says "generate" or "create", it might be generating a bug detector
      if (!lowerInput.includes('generate') && !lowerInput.includes('create') && !lowerInput.includes('build')) {
        return {
          tool: 'detect-bugs',
          rawInput: input,
          config: this.commands['detect-bugs']
        };
      }
    }
    
    // Priority matching for specific phrases
    const priorityMatches = [
      { phrase: 'best practices', tool: 'check-best-practices' },
      { phrase: 'code quality', tool: 'check-best-practices' },
      { phrase: 'review code', tool: 'check-best-practices' },
      { phrase: 'check code', tool: 'check-best-practices' },
      { phrase: 'github commit', tool: 'github-commit' },
      { phrase: 'git commit', tool: 'github-commit' },
      { phrase: 'push to github', tool: 'github-commit' },
      { phrase: 'commit to', tool: 'github-commit' },
    ];
    
    // Check priority matches
    for (const match of priorityMatches) {
      if (lowerInput.includes(match.phrase)) {
        return {
          tool: match.tool,
          rawInput: input,
          config: this.commands[match.tool]
        };
      }
    }
    
    // For generate-code, only match if it has clear generation intent
    const generateKeywords = ['generate', 'create', 'build', 'make'];
    const hasGenerateIntent = generateKeywords.some(kw => lowerInput.includes(kw));
    
    if (hasGenerateIntent && !hasBugIntent) {
      return {
        tool: 'generate-code',
        rawInput: input,
        config: this.commands['generate-code']
      };
    }
    
    // If still unclear, default based on content
    if (hasBugIntent) {
      return {
        tool: 'detect-bugs',
        rawInput: input,
        config: this.commands['detect-bugs']
      };
    }
    
    return null;
  }

  /**
   * Extract parameters from user input
   */
  extractParams(input, toolName) {
    const config = this.commands[toolName];
    if (!config) return null;

    const params = {};
    
    // Tool-specific parameter extraction
    switch (toolName) {
      case 'generate-code':
        params.description = this.extractDescription(input);
        params.language = this.extractLanguage(input) || 'javascript';
        // Only add framework if found
        const framework = this.extractFramework(input);
        if (framework) params.framework = framework;
        break;
        
      case 'detect-bugs':
        params.language = this.extractLanguage(input) || 'javascript';
        
        // First check if code is provided directly (in code blocks or after "code:")
        const directCode = this.extractCode(input);
        if (directCode) {
          // Use direct code instead of file path
          params.code = directCode;
        } else {
          // Extract file path (could be full path or just filename)
          const filePath = this.extractFilePath(input);
          if (filePath) {
            // If it's a full path, split into directory and filename
            if (filePath.includes('/') || filePath.includes('\\')) {
              const pathParts = filePath.replace(/\\/g, '/').split('/');
              params.fileName = pathParts.pop(); // Last part is filename
              params.rootDirectory = pathParts.join('/'); // Rest is directory
            } else {
              // Just a filename, use current directory
              params.fileName = filePath;
              params.rootDirectory = process.cwd();
            }
          } else {
            params.rootDirectory = process.cwd();
          }
        }
        break;
        
      case 'check-best-practices':
        params.code = this.extractCode(input);
        params.language = this.extractLanguage(input) || 'javascript';
        // Only add framework if found
        const checkFramework = this.extractFramework(input);
        if (checkFramework) params.framework = checkFramework;
        break;
        
      case 'github-commit':
        params.localPath = this.extractPath(input) || process.cwd();
        const repo = this.extractRepo(input);
        if (repo) params.repo = repo;
        const owner = this.extractOwner(input);
        if (owner) params.owner = owner;
        params.branch = this.extractBranch(input) || 'main';
        params.message = this.extractCommitMessage(input);
        break;
    }
    
    return params;
  }

  // Helper methods for parameter extraction
  
  extractDescription(input) {
    // Remove command keywords and return the rest as description
    const cleaned = input
      .replace(/generate|create|build|make|code|project|app/gi, '')
      .trim();
    return cleaned || input;
  }

  extractLanguage(input) {
    const languages = {
      'javascript': ['javascript', 'js', 'node'],
      'python': ['python', 'py'],
      'typescript': ['typescript', 'ts'],
      'java': ['java'],
      'go': ['go', 'golang'],
      'rust': ['rust'],
      'cpp': ['c++', 'cpp'],
      'c': ['c language'],
      'ruby': ['ruby', 'rb'],
      'php': ['php'],
    };
    
    const lowerInput = input.toLowerCase();
    for (const [lang, keywords] of Object.entries(languages)) {
      if (keywords.some(kw => lowerInput.includes(kw))) {
        return lang;
      }
    }
    return null;
  }

  extractFramework(input) {
    const frameworks = ['react', 'vue', 'angular', 'svelte', 'express', 'fastapi', 
                       'django', 'flask', 'nextjs', 'nuxt', 'nest'];
    const lowerInput = input.toLowerCase();
    
    for (const fw of frameworks) {
      if (lowerInput.includes(fw)) {
        return fw;
      }
    }
    return null;
  }

  extractPath(input) {
    // Look for path patterns
    const pathMatch = input.match(/(?:path|dir|directory|folder)[:=]?\s*([^\s]+)/i);
    if (pathMatch) return pathMatch[1];
    
    // Look for absolute or relative paths
    const absPathMatch = input.match(/[\/\\][\w\-\/\\. ]+/);
    if (absPathMatch) return absPathMatch[0].trim();
    
    return null;
  }

  extractFilePath(input) {
    // Remove "language: xxx" part first to avoid confusion
    let cleanInput = input.replace(/\s+language[:=]?\s+\w+/gi, '');
    
    // Look for file: or filename: pattern
    const fileMatch = cleanInput.match(/(?:file|filename)[:=]?\s*([^\s]+)/i);
    if (fileMatch) {
      let path = fileMatch[1].trim();
      // Remove trailing punctuation
      path = path.replace(/[,;.]$/, '');
      return path;
    }
    
    // Look for absolute or relative paths
    const pathMatch = cleanInput.match(/([\/~][\w\-\/\\. ]+\.\w+)/);
    if (pathMatch) return pathMatch[1].trim();
    
    // Look for just filename with extension
    const extMatch = cleanInput.match(/[\w\-]+\.(js|ts|py|java|go|rs|cpp|c|rb|php|jsx|tsx)/i);
    if (extMatch) return extMatch[0];
    
    return null;
  }

  extractFileName(input) {
    const path = this.extractFilePath(input);
    if (!path) return null;
    
    // If it's a path, return just the filename
    if (path.includes('/') || path.includes('\\')) {
      return path.replace(/\\/g, '/').split('/').pop();
    }
    
    return path;
  }

  extractCode(input) {
    // Look for code blocks in backticks
    const codeBlockMatch = input.match(/```[\w]*\n([\s\S]*?)```/);
    if (codeBlockMatch) return codeBlockMatch[1].trim();
    
    // Look for code after "code:" or similar
    const codeMatch = input.match(/code[:=]\s*([\s\S]+)/i);
    if (codeMatch) {
      let code = codeMatch[1].trim();
      // Remove "language: xxx" if present
      code = code.replace(/\s*language[:=]\s*\w+\s*/gi, '');
      return code;
    }
    
    // Check if the entire input (after removing commands) looks like code
    // This handles: "detect bugs in this code: const x = 5; ..."
    const afterCommand = input.replace(/detect\s+bugs?\s+in\s+(this\s+)?code[:=]?\s*/gi, '').trim();
    if (afterCommand.length > 20 && !afterCommand.includes('file:')) {
      // Remove language specification
      return afterCommand.replace(/language[:=]?\s*\w+/gi, '').trim();
    }
    
    return null;
  }

  extractOwner(input) {
    // Look for owner/username patterns
    const ownerMatch = input.match(/(?:owner|user|username)[:=]?\s*([^\s]+)/i);
    if (ownerMatch) return ownerMatch[1];
    
    // Look for github.com/owner/repo pattern
    const githubMatch = input.match(/github\.com\/([\w-]+)\/[\w-]+/i);
    if (githubMatch) return githubMatch[1];
    
    return null;
  }

  extractRepo(input) {
    // Look for repo name patterns
    const repoMatch = input.match(/(?:repo|repository)[:=]?\s*([^\s]+)/i);
    if (repoMatch) return repoMatch[1];
    
    // Look for github.com/owner/repo pattern
    const githubMatch = input.match(/github\.com\/[\w-]+\/([\w-]+)/i);
    if (githubMatch) return githubMatch[1];
    
    return null;
  }

  extractBranch(input) {
    const branchMatch = input.match(/(?:branch)[:=]?\s*([^\s]+)/i);
    return branchMatch ? branchMatch[1] : null;
  }

  extractCommitMessage(input) {
    const msgMatch = input.match(/(?:message|msg)[:=]?\s*["']([^"']+)["']/i);
    if (msgMatch) return msgMatch[1];
    
    // Use a portion of input as message
    return input.slice(0, 100);
  }

  /**
   * Validate if all required parameters are present
   */
  validateParams(params, toolName) {
    const config = this.commands[toolName];
    const missing = [];
    
    for (const param of config.requiredParams) {
      if (!params[param]) {
        missing.push(param);
      }
    }
    
    return {
      valid: missing.length === 0,
      missing: missing
    };
  }

  /**
   * Get help text for a specific tool
   */
  getToolHelp(toolName) {
    const config = this.commands[toolName];
    if (!config) return null;
    
    return {
      tool: toolName,
      keywords: config.keywords,
      requiredParams: config.requiredParams,
      optionalParams: config.optionalParams,
      examples: this.getExamples(toolName)
    };
  }

  getExamples(toolName) {
    const examples = {
      'generate-code': [
        'Generate a todo app in React',
        'Create a REST API in Python using FastAPI',
        'Build a calculator app in JavaScript'
      ],
      'detect-bugs': [
        'Detect bugs in file: src/server.js language: javascript',
        'Find issues in path: /Users/user/project file: app.py language: python'
      ],
      'check-best-practices': [
        'Check best practices for code: ```const x = 5``` language: javascript',
        'Review code quality language: python'
      ],
      'github-commit': [
        'Commit to github repo: my-repo branch: main message: "Initial commit"',
        'Push code to repository: test-app branch: dev'
      ]
    };
    
    return examples[toolName] || [];
  }
}

