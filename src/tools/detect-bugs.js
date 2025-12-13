import { GoogleGenAI } from "@google/genai";
import { readFile } from "fs/promises";
import { join } from "path";

export async function detectBugs(params) {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  
  const ai = new GoogleGenAI({ apiKey });
  
  let codeToAnalyze = params.code;
  let filePath = null;
  
  // If rootDirectory and fileName are provided, read from file
  if (params.rootDirectory && params.fileName) {
    try {
      filePath = join(params.rootDirectory, params.fileName);
      codeToAnalyze = await readFile(filePath, 'utf-8');
      console.error(`Successfully read file: ${filePath}`);
    } catch (error) {
      // If file not found, try in src/ subdirectory
      if (error.code === 'ENOENT' && !params.fileName.includes('src/')) {
        try {
          filePath = join(params.rootDirectory, 'src', params.fileName);
          codeToAnalyze = await readFile(filePath, 'utf-8');
          console.error(`Successfully read file: ${filePath}`);
        } catch (error2) {
          throw new Error(`File not found. Tried:\n1. ${join(params.rootDirectory, params.fileName)}\n2. ${filePath}\n\nError: ${error2.message}`);
        }
      } else {
        // Better error messages for common issues
        if (error.code === 'EPERM') {
          throw new Error(`Permission denied to read file: ${filePath}\n\n💡 Solution: Paste your code directly instead!\n\nExample:\n"Detect bugs in this code language: javascript\n\nconst x = 5;\nfunction test() {\n  return x.tostring(); // bug here\n}"\n\nOr fix permissions:\n• System Settings → Privacy & Security → Full Disk Access → Add Terminal`);
        } else if (error.code === 'EACCES') {
          throw new Error(`Access denied to file: ${filePath}\n\nTry pasting code directly or check permissions: chmod +r ${filePath}`);
        } else {
          throw new Error(`Failed to read file ${filePath}: ${error.message}`);
        }
      }
    }
  }
  
  // Validate we have code to analyze
  if (!codeToAnalyze) {
    throw new Error("No code provided. Either provide 'code' parameter or 'rootDirectory' + 'fileName'");
  }
  
  // Build the prompt for Gemini
  const prompt = `Analyze the following code for potential bugs, errors, and issues:

Language: ${params.language}
${filePath ? `File: ${params.fileName}` : ''}
Code:
\`\`\`${params.language}
${codeToAnalyze}
\`\`\`

Please provide a detailed bug analysis with the following structure:
{
  "summary": {
    "totalIssues": 0,
    "critical": 0,
    "warning": 0,
    "info": 0
  },
  "issues": [
    {
      "severity": "critical|warning|info",
      "type": "bug type (e.g., null pointer, memory leak, logic error)",
      "line": "line number or range",
      "description": "detailed description of the issue",
      "suggestion": "how to fix the issue",
      "codeSnippet": "relevant code snippet"
    }
  ],
  "overallAssessment": "general assessment of code quality and bug risk"
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are an expert code reviewer who identifies bugs, potential errors, and security vulnerabilities in code.",
        temperature: 0.3,
        topK: 40,
        topP: 0.95,
      }
    });

    const generatedText = response.text;
    
    // Clean up response text
    let cleanedText = generatedText.trim();
    
    if (cleanedText.startsWith("```json")) {
      cleanedText = cleanedText.slice(7);
    } else if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.slice(3);
    }
    
    if (cleanedText.endsWith("```")) {
      cleanedText = cleanedText.slice(0, -3);
    }
    
    cleanedText = cleanedText.trim();
    
    // Extract JSON object
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON found in response");
    }
    
    const bugAnalysis = JSON.parse(jsonMatch[0]);
    
    return {
      success: true,
      language: params.language,
      ...(filePath && { filePath, fileName: params.fileName }),
      linesOfCode: codeToAnalyze.split('\n').length,
      summary: bugAnalysis.summary,
      issues: bugAnalysis.issues,
      overallAssessment: bugAnalysis.overallAssessment,
      analyzedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error("Bug detection error:", error);
    throw error;
  }
}