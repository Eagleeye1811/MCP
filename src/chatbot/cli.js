#!/usr/bin/env node

import readline from 'readline';
import { MCPChatbotClient } from './client.js';
import { CommandParser } from './command-parser.js';
import { projectRunner } from './project-runner.js';
import chalk from 'chalk';
import { homedir } from 'os';
import { join } from 'path';

class MCPChatbot {
  constructor() {
    this.client = new MCPChatbotClient();
    this.parser = new CommandParser();
    this.rl = null;
    this.isConnected = false;
  }

  async initialize() {
    console.clear();
    this.printWelcome();
    
    try {
      await this.client.connect();
      this.isConnected = true;
      this.printAvailableTools();
      this.startChatLoop();
    } catch (error) {
      console.error(chalk.red('\n❌ Failed to initialize chatbot:', error.message));
      process.exit(1);
    }
  }

  printWelcome() {
    console.log(chalk.cyan.bold('\n╔═══════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan.bold('║         🤖 MCP Chatbot - AI Code Assistant          ║'));
    console.log(chalk.cyan.bold('╚═══════════════════════════════════════════════════════╝'));
    console.log(chalk.gray('\nWelcome! I can help you with:'));
    console.log(chalk.yellow('  • Generate code projects'));
    console.log(chalk.yellow('  • Detect bugs in your code'));
    console.log(chalk.yellow('  • Check best practices'));
    console.log(chalk.yellow('  • Commit to GitHub\n'));
    console.log(chalk.gray('Type "help" for examples or "exit" to quit.\n'));
  }

  printAvailableTools() {
    const tools = this.client.getAvailableTools();
    console.log(chalk.green('\n✅ Connected! Available tools:'));
    tools.forEach((tool, index) => {
      console.log(chalk.white(`  ${index + 1}. ${tool.name} - ${tool.description}`));
    });
    console.log();
  }

  startChatLoop() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.blue.bold('You: ')
    });

    this.rl.prompt();

    this.rl.on('line', async (input) => {
      const trimmed = input.trim();
      
      if (!trimmed) {
        this.rl.prompt();
        return;
      }

      await this.handleCommand(trimmed);
      this.rl.prompt();
    });

    this.rl.on('close', async () => {
      await this.shutdown();
    });
  }

  async handleCommand(input) {
    const lowerInput = input.toLowerCase();

    // Handle special commands
    if (lowerInput === 'exit' || lowerInput === 'quit') {
      await this.shutdown();
      return;
    }

    if (lowerInput === 'help') {
      this.printHelp();
      return;
    }

    if (lowerInput === 'tools') {
      this.printAvailableTools();
      return;
    }

    if (lowerInput.startsWith('help ')) {
      const toolName = lowerInput.replace('help ', '').trim();
      this.printToolHelp(toolName);
      return;
    }

    // Parse and execute command
    await this.executeCommand(input);
  }

  async executeCommand(input) {
    console.log(chalk.cyan('\n🤖 Bot: Processing your request...\n'));

    const parsed = this.parser.parseCommand(input);
    
    if (!parsed) {
      console.log(chalk.yellow('⚠️  I couldn\'t understand that command.'));
      console.log(chalk.gray('Type "help" to see examples or "tools" to list available tools.\n'));
      return;
    }

    console.log(chalk.gray(`🔍 Detected tool: ${parsed.tool}`));

    // Extract parameters
    const params = this.parser.extractParams(input, parsed.tool);
    console.log(chalk.gray(`📝 Extracted parameters: ${JSON.stringify(params, null, 2)}\n`));

    // Validate parameters
    const validation = this.parser.validateParams(params, parsed.tool);
    
    if (!validation.valid) {
      console.log(chalk.red(`❌ Missing required parameters: ${validation.missing.join(', ')}`));
      this.printToolHelp(parsed.tool);
      return;
    }

    // Interactive parameter collection for missing values
    const finalParams = await this.collectMissingParams(params, parsed.tool);

    // Call the tool
    try {
      console.log(chalk.cyan('⏳ Executing tool...\n'));
      const result = await this.client.callTool(parsed.tool, finalParams);
      this.displayResult(result, parsed.tool);
      
      // After code generation, offer to run/open the project
      if (parsed.tool === 'generate-code' && result.content) {
        await this.handlePostGeneration(result);
      }
    } catch (error) {
      console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    }
  }

  async collectMissingParams(params, toolName) {
    const config = this.parser.commands[toolName];
    const finalParams = { ...params };

    for (const param of config.requiredParams) {
      if (!finalParams[param]) {
        const answer = await this.askQuestion(
          chalk.yellow(`\n❓ Please provide ${param}: `)
        );
        if (answer.trim()) {
          finalParams[param] = answer.trim();
        }
      }
    }

    return finalParams;
  }

  askQuestion(question) {
    return new Promise((resolve) => {
      const tempRl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      tempRl.question(question, (answer) => {
        tempRl.close();
        resolve(answer);
      });
    });
  }

  displayResult(result, toolName) {
    console.log(chalk.green('\n✅ Success! Here are the results:\n'));
    console.log(chalk.gray('═'.repeat(60)));
    
    if (result.content && Array.isArray(result.content)) {
      result.content.forEach(item => {
        if (item.type === 'text') {
          // Try to parse JSON for pretty printing
          try {
            const jsonData = JSON.parse(item.text);
            console.log(chalk.white(JSON.stringify(jsonData, null, 2)));
          } catch {
            // Not JSON, print as is
            console.log(chalk.white(item.text));
          }
        }
      });
    } else {
      console.log(chalk.white(JSON.stringify(result, null, 2)));
    }
    
    console.log(chalk.gray('═'.repeat(60)));
    console.log();
  }

  printHelp() {
    console.log(chalk.cyan.bold('\n📚 Help & Examples:\n'));
    
    console.log(chalk.yellow('1. Generate Code:'));
    console.log(chalk.white('   • "Generate a todo app in React"'));
    console.log(chalk.white('   • "Create a REST API in Python using FastAPI"'));
    console.log(chalk.white('   • "Build a calculator in JavaScript"\n'));
    
    console.log(chalk.yellow('2. Detect Bugs:'));
    console.log(chalk.white('   • "Detect bugs in file: server.js language: javascript"'));
    console.log(chalk.white('   • "Find issues in path: /src file: app.py language: python"\n'));
    
    console.log(chalk.yellow('3. Check Best Practices:'));
    console.log(chalk.white('   • "Check best practices language: javascript code: const x = 5"'));
    console.log(chalk.white('   • "Review code quality for my React code"\n'));
    
    console.log(chalk.yellow('4. GitHub Commit:'));
    console.log(chalk.white('   • "Commit to github repo: my-repo branch: main message: \'Initial commit\'"'));
    console.log(chalk.white('   • "Push code to repository: test-app"\n'));
    
    console.log(chalk.gray('Special commands:'));
    console.log(chalk.white('   • help - Show this help'));
    console.log(chalk.white('   • tools - List available tools'));
    console.log(chalk.white('   • help <tool-name> - Get help for specific tool'));
    console.log(chalk.white('   • exit/quit - Exit the chatbot\n'));
  }

  printToolHelp(toolName) {
    const help = this.parser.getToolHelp(toolName);
    
    if (!help) {
      console.log(chalk.red(`\n❌ Unknown tool: ${toolName}\n`));
      return;
    }

    console.log(chalk.cyan.bold(`\n📖 Help for: ${toolName}\n`));
    console.log(chalk.yellow('Keywords:'), chalk.white(help.keywords.join(', ')));
    console.log(chalk.yellow('Required Parameters:'), chalk.white(help.requiredParams.join(', ')));
    if (help.optionalParams.length > 0) {
      console.log(chalk.yellow('Optional Parameters:'), chalk.white(help.optionalParams.join(', ')));
    }
    
    console.log(chalk.yellow('\nExamples:'));
    help.examples.forEach(ex => {
      console.log(chalk.white(`  • ${ex}`));
    });
    console.log();
  }

  async handlePostGeneration(result) {
    try {
      // Extract project data from result
      const content = result.content[0].text;
      let projectData;
      
      try {
        projectData = JSON.parse(content);
      } catch {
        // If not JSON, skip post-generation handling
        return;
      }
      
      if (!projectData.success || !projectData.files) {
        return;
      }
      
      console.log(chalk.yellow('\n\n🎉 Code generation complete!\n'));
      
      const answer = await this.askQuestion(
        chalk.cyan('Would you like to run/open this project? (y/n): ')
      );
      
      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        return;
      }
      
      // Ask for output directory
      const defaultDir = join(homedir(), 'Desktop', 'generated-projects');
      const outputDir = await this.askQuestion(
        chalk.cyan(`Save to directory (default: ${defaultDir}): `)
      ) || defaultDir;
      
      console.log(chalk.cyan('\n💾 Saving project files...\n'));
      
      // Save project
      const projectPath = await projectRunner.saveProject(projectData, outputDir);
      
      console.log(chalk.green(`✅ Project saved to: ${projectPath}\n`));
      
      // Run project
      console.log(chalk.cyan('🚀 Opening project...\n'));
      const runResult = await projectRunner.runProject(projectData, projectPath);
      
      console.log(chalk.green('\n' + runResult.message + '\n'));
      
    } catch (error) {
      console.log(chalk.red(`\n❌ Error handling project: ${error.message}\n`));
    }
  }

  async shutdown() {
    console.log(chalk.cyan('\n👋 Goodbye! Thanks for using MCP Chatbot.\n'));
    
    // Stop any running servers
    projectRunner.stopAllServers();
    
    if (this.isConnected) {
      await this.client.disconnect();
    }
    if (this.rl) {
      this.rl.close();
    }
    process.exit(0);
  }
}

// Start the chatbot
const chatbot = new MCPChatbot();
chatbot.initialize().catch(error => {
  console.error(chalk.red('Fatal error:', error));
  process.exit(1);
});

