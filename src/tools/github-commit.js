import { Octokit } from "@octokit/rest";
import fs from "fs";
import path from "path";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

// Redirect stdout logs to stderr to keep stdio clean for MCP protocol
const originalError = console.error;
console.log = (...args) => originalError("[LOG]", ...args);
console.warn = (...args) => originalError("[WARN]", ...args);
console.error = (...args) => originalError("[ERROR]", ...args);

// Auto-commit and push entire codebase
export default async function autoCommitAndPush(params) {
  const { localPath, repo: repoName, branch: branchName, message: mess = null, owner: ownerParam } = params;
 
  console.log('Repository:', repoName);
  console.log('Local path:', localPath);

  // Get owner from params, environment variable, or use default
  const owner = ownerParam || process.env.GITHUB_OWNER || 'Eagleeye1811';
  const repo = repoName;
  const branch = branchName;
  
  console.log('Owner:', owner);

  try {
    // Validate that the path exists
    if (!fs.existsSync(localPath)) {
      throw new Error(`Path does not exist: ${localPath}`);
    }

    // First, verify the repository exists and we have access
    console.log(' Checking if repository exists...');
    try {
      const { data: repoData } = await octokit.rest.repos.get({
        owner,
        repo
      });
      console.log(' Repository exists!');
      
      // Check if we have push permission
      if (!repoData.permissions?.push) {
        throw new Error(`No write access to repository: ${owner}/${repo}\n\n💡 Solutions:\n1. Check your GitHub token has 'repo' scope\n2. Verify you own this repository or have write access\n3. Create a new token: https://github.com/settings/tokens`);
      }
      console.log(' Write access verified!');
    } catch (error) {
      if (error.status === 404) {
        throw new Error(`Repository not found: ${owner}/${repo}\n\n💡 Create it first at: https://github.com/new\nOr check the repository name and owner are correct.`);
      } else if (error.status === 401) {
        throw new Error(`GitHub authentication failed. Check your GITHUB_TOKEN in .env file.`);
      }
      throw error;
    }

    // Generate automatic commit message if not provided
    const message = mess || `Auto-commit: ${new Date().toISOString()}`;
   
    console.log(' Reading files from:', localPath);
    const files = getAllFiles(localPath);
    console.log(`Found ${files.length} files`);

    if (files.length === 0) {
      throw new Error('No files found to commit');
    }

    // 1. Get current branch reference (or handle empty repo)
    console.log(' Getting current branch state...');
    let currentCommitSha = null;
    let baseTreeSha = null;
    let isEmptyRepo = false;
    
    try {
      const { data: refData } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`
      });
      currentCommitSha = refData.object.sha;

      // 2. Get current commit
      const { data: commitData } = await octokit.rest.git.getCommit({
        owner,
        repo,
        commit_sha: currentCommitSha
      });
      baseTreeSha = commitData.tree.sha;
    } catch (error) {
      // Repository is empty (no commits yet)
      if (error.status === 404 || error.message.includes('empty')) {
        console.log(' Repository is empty. Creating initial commit...');
        isEmptyRepo = true;
      } else {
        throw error;
      }
    }

    // 3. Create blobs for all files (with progress)
    console.log(' Uploading files...');
    const blobs = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const content = fs.readFileSync(file.path);
     
      const { data: blob } = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: content.toString('base64'),
        encoding: 'base64'
      });
     
      blobs.push({
        path: file.relativePath,
        mode: '100644',
        type: 'blob',
        sha: blob.sha
      });
     
      // Show progress
      if ((i + 1) % 10 === 0 || i === files.length - 1) {
        console.log(`  Uploaded ${i + 1}/${files.length} files`);
      }
    }

    // 4. Create new tree
    console.log(' Creating tree...');
    const treeParams = {
      owner,
      repo,
      tree: blobs,
    };
    
    // Only include base_tree if repo is not empty
    if (baseTreeSha) {
      treeParams.base_tree = baseTreeSha;
    }
    
    const { data: newTree } = await octokit.rest.git.createTree(treeParams);

    // 5. Create commit
    console.log(' Creating commit...');
    const commitParams = {
      owner,
      repo,
      message: message,
      tree: newTree.sha,
    };
    
    // Only include parent if repo is not empty
    if (currentCommitSha) {
      commitParams.parents = [currentCommitSha];
    }
    
    const { data: newCommit } = await octokit.rest.git.createCommit(commitParams);

    // 6. Update or create branch reference
    console.log('Pushing to GitHub...');
    
    if (isEmptyRepo) {
      // Create new branch reference for empty repo
      await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branch}`,
        sha: newCommit.sha
      });
      console.log(` Created new branch: ${branch}`);
    } else {
      // Update existing branch reference
      await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: newCommit.sha
      });
    }

    console.log('✅ Successfully committed and pushed!');
    console.log(`Commit: ${message}`);
    console.log(`SHA: ${newCommit.sha}`);
    console.log(`View: https://github.com/${owner}/${repo}/commit/${newCommit.sha}`);
   
    return {
      success: true,
      sha: newCommit.sha,
      message: message,
      url: `https://github.com/${owner}/${repo}/commit/${newCommit.sha}`,
      filesCommitted: files.length
    };
   
  } catch (error) {
    console.error('Error:', error.message);
    if (error.status === 401) {
      console.error(' Check your GitHub token permissions');
    } else if (error.status === 404) {
      console.error(' Repository or branch not found');
    }
    throw error;
  }
}

// Helper: Get all files recursively
function getAllFiles(dirPath, arrayOfFiles = [], basePath = dirPath) {
  try {
    const files = fs.readdirSync(dirPath);

    // Files/folders to ignore
    const ignoreList = [
      '.git',
      'node_modules',
      '.DS_Store',
      'dist',
      'build',
      '.env',
      '.env.local',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml'
    ];

    files.forEach((file) => {
      if (ignoreList.includes(file)) return;

      const filePath = path.join(dirPath, file);
     
      if (fs.statSync(filePath).isDirectory()) {
        arrayOfFiles = getAllFiles(filePath, arrayOfFiles, basePath);
      } else {
        arrayOfFiles.push({
          path: filePath,
          relativePath: path.relative(basePath, filePath).replace(/\\/g, '/')
        });
      }
    });

    return arrayOfFiles;
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error.message);
    throw error;
  }
}

