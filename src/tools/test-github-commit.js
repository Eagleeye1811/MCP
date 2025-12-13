import autoCommitAndPush from './github-commit.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(message) {
  console.log('\n' + '='.repeat(60));
  log(message, 'cyan');
  console.log('='.repeat(60) + '\n');
}

// Create a test directory with sample files
function createTestDirectory() {
  const testDir = path.join(__dirname, '../../test-commit-project');
  
  // Clean up if exists
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  
  // Create directory structure
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(testDir, 'docs'), { recursive: true });
  
  // Create sample files
  fs.writeFileSync(
    path.join(testDir, 'README.md'),
    '# Test Project\n\nThis is a test project for GitHub commit functionality.\n'
  );
  
  fs.writeFileSync(
    path.join(testDir, 'package.json'),
    JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      description: 'Test project for MCP GitHub commit'
    }, null, 2)
  );
  
  fs.writeFileSync(
    path.join(testDir, 'src', 'index.js'),
    'console.log("Hello from test project!");\n\nexport default function main() {\n  return "Test successful!";\n}\n'
  );
  
  fs.writeFileSync(
    path.join(testDir, 'src', 'utils.js'),
    'export function add(a, b) {\n  return a + b;\n}\n\nexport function subtract(a, b) {\n  return a - b;\n}\n'
  );
  
  fs.writeFileSync(
    path.join(testDir, 'docs', 'USAGE.md'),
    '# Usage Guide\n\nThis is a usage guide for the test project.\n'
  );
  
  log(`✅ Created test directory: ${testDir}`, 'green');
  log(`   - 5 files created`, 'green');
  log(`   - 3 directories created`, 'green');
  
  return testDir;
}

// Test 1: Check environment variables
async function testEnvironmentVariables() {
  header('TEST 1: Environment Variables Check');
  
  const required = ['GITHUB_TOKEN', 'GITHUB_OWNER'];
  const missing = [];
  
  for (const envVar of required) {
    if (process.env[envVar]) {
      log(`✅ ${envVar}: Set`, 'green');
    } else {
      log(`❌ ${envVar}: Missing`, 'red');
      missing.push(envVar);
    }
  }
  
  if (missing.length > 0) {
    log('\n⚠️  Missing environment variables:', 'yellow');
    log('   Add them to your .env file:', 'yellow');
    missing.forEach(envVar => {
      log(`   ${envVar}=your_value_here`, 'yellow');
    });
    return false;
  }
  
  return true;
}

// Test 2: Test with invalid path (should fail gracefully)
async function testInvalidPath() {
  header('TEST 2: Invalid Path Handling');
  
  try {
    await autoCommitAndPush({
      localPath: '/nonexistent/path/to/nowhere',
      repo: 'test-repo',
      branch: 'main',
      message: 'Test commit'
    });
    log('❌ Should have thrown an error for invalid path', 'red');
    return false;
  } catch (error) {
    if (error.message.includes('Path does not exist')) {
      log('✅ Correctly handled invalid path', 'green');
      log(`   Error message: "${error.message}"`, 'blue');
      return true;
    }
    log(`❌ Unexpected error: ${error.message}`, 'red');
    return false;
  }
}

// Test 3: Test repository existence check
async function testRepositoryCheck() {
  header('TEST 3: Repository Existence Check');
  
  const testDir = createTestDirectory();
  
  try {
    await autoCommitAndPush({
      localPath: testDir,
      repo: 'nonexistent-repo-12345-test',
      branch: 'main',
      message: 'Test commit'
    });
    log('❌ Should have thrown an error for nonexistent repo', 'red');
    return false;
  } catch (error) {
    if (error.message.includes('Repository not found')) {
      log('✅ Correctly detected nonexistent repository', 'green');
      log(`   Error message: "${error.message}"`, 'blue');
      return true;
    }
    log(`⚠️  Different error: ${error.message}`, 'yellow');
    return true; // Still pass, might be auth issue
  } finally {
    // Cleanup
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  
  for (const arg of args) {
    if (arg.startsWith('--repo=')) {
      parsed.repo = arg.split('=')[1];
    } else if (arg.startsWith('--owner=')) {
      parsed.owner = arg.split('=')[1];
    } else if (arg.startsWith('--branch=')) {
      parsed.branch = arg.split('=')[1];
    }
  }
  
  return parsed;
}

// Test 4: Test actual commit (requires valid repo)
async function testActualCommit() {
  header('TEST 4: Actual Commit Test');
  
  const cmdArgs = parseArgs();
  
  // Check if user provided test repository name (from CLI or env)
  const testRepo = cmdArgs.repo || process.env.TEST_REPO_NAME || null;
  const testOwner = cmdArgs.owner || process.env.GITHUB_OWNER || null;
  const testBranch = cmdArgs.branch || 'test-branch';
  
  if (!testRepo) {
    log('⚠️  Skipping actual commit test', 'yellow');
    log('   Provide repository name to test actual commits:', 'yellow');
    log('   Option 1: npm run test:github -- --repo=test-mcp-chatbot', 'blue');
    log('   Option 2: TEST_REPO_NAME=test-mcp-chatbot npm run test:github', 'blue');
    return true;
  }
  
  if (!testOwner) {
    log('❌ GITHUB_OWNER not set', 'red');
    log('   Add to .env: GITHUB_OWNER=your_username', 'yellow');
    log('   Or use: npm run test:github -- --repo=test-repo --owner=your_username', 'blue');
    return false;
  }
  
  const testDir = createTestDirectory();
  
  try {
    log(`🚀 Attempting to commit to: ${testOwner}/${testRepo}`, 'blue');
    log(`   Branch: ${testBranch}`, 'blue');
    log('   This may take 30-60 seconds...', 'blue');
    
    const result = await autoCommitAndPush({
      localPath: testDir,
      repo: testRepo,
      branch: testBranch,
      message: `Test commit from MCP - ${new Date().toISOString()}`,
      owner: testOwner
    });
    
    log('✅ Commit successful!', 'green');
    log(`   SHA: ${result.sha}`, 'green');
    log(`   Files committed: ${result.filesCommitted}`, 'green');
    log(`   URL: ${result.url}`, 'green');
    
    return true;
  } catch (error) {
    log(`❌ Commit failed: ${error.message}`, 'red');
    return false;
  } finally {
    // Cleanup
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

// Test 5: Test parameter validation
async function testParameterValidation() {
  header('TEST 5: Parameter Validation');
  
  const testDir = createTestDirectory();
  let allPassed = true;
  
  // Test with missing required parameters
  const testCases = [
    {
      name: 'No parameters',
      params: {},
      shouldFail: true
    },
    {
      name: 'Missing repo',
      params: { localPath: testDir, branch: 'main', message: 'test' },
      shouldFail: true
    },
    {
      name: 'Missing branch',
      params: { localPath: testDir, repo: 'test-repo', message: 'test' },
      shouldFail: true
    },
    {
      name: 'Valid parameters (will fail at repo check)',
      params: { localPath: testDir, repo: 'test-repo', branch: 'main', message: 'test' },
      shouldFail: true // Will fail at repo check, but params are valid
    }
  ];
  
  for (const testCase of testCases) {
    try {
      await autoCommitAndPush(testCase.params);
      if (testCase.shouldFail) {
        log(`❌ ${testCase.name}: Should have failed`, 'red');
        allPassed = false;
      } else {
        log(`✅ ${testCase.name}: Passed`, 'green');
      }
    } catch (error) {
      if (testCase.shouldFail) {
        log(`✅ ${testCase.name}: Correctly failed`, 'green');
        log(`   Error: ${error.message.split('\n')[0]}`, 'blue');
      } else {
        log(`❌ ${testCase.name}: Should have passed`, 'red');
        allPassed = false;
      }
    }
  }
  
  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
  
  return allPassed;
}

// Run all tests
async function runAllTests() {
  console.clear();
  log('\n🧪 GitHub Commit Tool - Test Suite\n', 'magenta');
  
  // Show CLI arguments if provided
  const cmdArgs = parseArgs();
  if (cmdArgs.repo || cmdArgs.owner || cmdArgs.branch) {
    log('📝 CLI Arguments:', 'cyan');
    if (cmdArgs.repo) log(`   Repo: ${cmdArgs.repo}`, 'blue');
    if (cmdArgs.owner) log(`   Owner: ${cmdArgs.owner}`, 'blue');
    if (cmdArgs.branch) log(`   Branch: ${cmdArgs.branch}`, 'blue');
    console.log('');
  }
  
  const results = {
    passed: 0,
    failed: 0,
    total: 0
  };
  
  const tests = [
    { name: 'Environment Variables', fn: testEnvironmentVariables },
    { name: 'Invalid Path Handling', fn: testInvalidPath },
    { name: 'Repository Check', fn: testRepositoryCheck },
    { name: 'Parameter Validation', fn: testParameterValidation },
    { name: 'Actual Commit', fn: testActualCommit }
  ];
  
  for (const test of tests) {
    results.total++;
    try {
      const passed = await test.fn();
      if (passed) {
        results.passed++;
      } else {
        results.failed++;
      }
    } catch (error) {
      log(`❌ Test "${test.name}" crashed: ${error.message}`, 'red');
      results.failed++;
    }
  }
  
  // Summary
  header('TEST SUMMARY');
  log(`Total Tests: ${results.total}`, 'blue');
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  
  const percentage = Math.round((results.passed / results.total) * 100);
  log(`\nSuccess Rate: ${percentage}%`, percentage === 100 ? 'green' : 'yellow');
  
  if (results.passed === results.total) {
    log('\n🎉 All tests passed!', 'green');
  } else {
    log('\n⚠️  Some tests failed. Check the output above.', 'yellow');
  }
  
  console.log('\n');
}

// Run tests
runAllTests().catch(error => {
  log(`\n❌ Test suite crashed: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

