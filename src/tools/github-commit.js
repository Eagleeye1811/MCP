import { Octokit } from "@octokit/rest";
import fs from "fs";
import path from "path";


const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});
// Suppress console output to avoid interfering with stdio transport
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;


// Redirect stdout logs to stderr to keep stdio clean for MCP protocol
console.log = (...args) => originalError("[LOG]", ...args);
console.warn = (...args) => originalError("[WARN]", ...args);
console.error = (...args) => originalError("[ERROR]", ...args);
// Auto-commit and push entire codebase
export default async function autoCommitAndPush(params) {
  const { localPath, repo: repoName, branch: branchName, message: mess = null } = params;
 
  console.log('Repository:', repoName);
  console.log('Local path:', localPath);


  //yourusername
  const owner = 'Afnankazi';
  const repo = repoName;
  const branch = branchName;
 
  try {
    // Validate that the path exists
    if (!fs.existsSync(localPath)) {
      throw new Error(`Path does not exist: ${localPath}`);
    }


    // Generate automatic commit message if not provided
    const message = mess || `Auto-commit: ${new Date().toISOString()}`;
   
    console.log(' Reading files from:', localPath);
    const files = getAllFiles(localPath);
    console.log(`Found ${files.length} files`);


    if (files.length === 0) {
      throw new Error('No files found to commit');
    }


    // 1. Get current branch reference
    console.log(' Getting current branch state...');
    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`
    });
    const currentCommitSha = refData.object.sha;


    // 2. Get current commit
    const { data: commitData } = await octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: currentCommitSha
    });
    const baseTreeSha = commitData.tree.sha;


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
    const { data: newTree } = await octokit.rest.git.createTree({
      owner,
      repo,
      tree: blobs,
      base_tree: baseTreeSha
    });


    // 5. Create commit
    console.log(' Creating commit...');
    const { data: newCommit } = await octokit.rest.git.createCommit({
      owner,
      repo,
      message: message,
      tree: newTree.sha,
      parents: [currentCommitSha]
    });


    // 6. Update branch reference
    console.log('Pushing to GitHub...');
    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha
    });


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



