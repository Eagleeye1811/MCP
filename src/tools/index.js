export { generateCode } from "./generate-code.js";

// Stub exports for empty tool files
export async function detectBugs(params) {
  throw new Error("detectBugs not yet implemented");
}

export async function checkBestPractices(params) {
  throw new Error("checkBestPractices not yet implemented");
}

export async function createGitHubCommit(params) {
  throw new Error("createGitHubCommit not yet implemented");
}
