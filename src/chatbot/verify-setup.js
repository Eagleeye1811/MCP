#!/usr/bin/env node

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log(chalk.cyan.bold('\n🔍 MCP Chatbot Setup Verification\n'));
console.log(chalk.gray('═'.repeat(50)));

let hasErrors = false;

// Check 1: Node.js version
console.log('\n' + chalk.yellow('1. Checking Node.js version...'));
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

if (majorVersion >= 18) {
  console.log(chalk.green(`   ✓ Node.js ${nodeVersion} (OK)`));
} else {
  console.log(chalk.red(`   ✗ Node.js ${nodeVersion} (Required: v18+)`));
  hasErrors = true;
}

// Check 2: .env file exists
console.log('\n' + chalk.yellow('2. Checking .env file...'));
const envPath = join(__dirname, '../../.env');

if (existsSync(envPath)) {
  console.log(chalk.green('   ✓ .env file exists'));
  
  // Load environment variables
  dotenv.config({ path: envPath });
  
  // Check 3: Gemini API Key
  console.log('\n' + chalk.yellow('3. Checking GEMINI_API_KEY...'));
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
    console.log(chalk.green('   ✓ GEMINI_API_KEY is set'));
  } else {
    console.log(chalk.red('   ✗ GEMINI_API_KEY is missing or not configured'));
    console.log(chalk.gray('     Get your key from: https://makersuite.google.com/app/apikey'));
    hasErrors = true;
  }
  
  // Check 4: GitHub Token (optional)
  console.log('\n' + chalk.yellow('4. Checking GITHUB_TOKEN (optional)...'));
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN !== 'your_github_token_here') {
    console.log(chalk.green('   ✓ GITHUB_TOKEN is set'));
  } else {
    console.log(chalk.yellow('   ⚠ GITHUB_TOKEN is not set (optional - only needed for github-commit tool)'));
    console.log(chalk.gray('     Get your token from: https://github.com/settings/tokens'));
  }
} else {
  console.log(chalk.red('   ✗ .env file not found'));
  console.log(chalk.gray('     Create a .env file in the project root'));
  hasErrors = true;
}

// Check 5: Required dependencies
console.log('\n' + chalk.yellow('5. Checking dependencies...'));
try {
  await import('@modelcontextprotocol/sdk/client/index.js');
  console.log(chalk.green('   ✓ @modelcontextprotocol/sdk'));
} catch {
  console.log(chalk.red('   ✗ @modelcontextprotocol/sdk not installed'));
  hasErrors = true;
}

try {
  await import('@google/genai');
  console.log(chalk.green('   ✓ @google/genai'));
} catch {
  console.log(chalk.red('   ✗ @google/genai not installed'));
  hasErrors = true;
}

try {
  await import('chalk');
  console.log(chalk.green('   ✓ chalk'));
} catch {
  console.log(chalk.red('   ✗ chalk not installed'));
  hasErrors = true;
}

try {
  await import('@octokit/rest');
  console.log(chalk.green('   ✓ @octokit/rest'));
} catch {
  console.log(chalk.red('   ✗ @octokit/rest not installed'));
  hasErrors = true;
}

// Check 6: Server file exists
console.log('\n' + chalk.yellow('6. Checking server files...'));
const serverPath = join(__dirname, '../server.js');

if (existsSync(serverPath)) {
  console.log(chalk.green('   ✓ MCP server file exists'));
} else {
  console.log(chalk.red('   ✗ MCP server file not found'));
  hasErrors = true;
}

// Final result
console.log('\n' + chalk.gray('═'.repeat(50)));

if (hasErrors) {
  console.log(chalk.red('\n❌ Setup incomplete. Please fix the errors above.\n'));
  console.log(chalk.yellow('Quick fixes:'));
  console.log(chalk.white('  1. Run: npm install'));
  console.log(chalk.white('  2. Create .env file with your API keys'));
  console.log(chalk.white('  3. See QUICKSTART.md for detailed instructions\n'));
  process.exit(1);
} else {
  console.log(chalk.green('\n✅ All checks passed! You\'re ready to go.\n'));
  console.log(chalk.cyan('Start the chatbot:'));
  console.log(chalk.white('  npm run chatbot\n'));
  console.log(chalk.cyan('Or try the web interface:'));
  console.log(chalk.white('  npm run web\n'));
  process.exit(0);
}

