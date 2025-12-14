import { GoogleGenAI } from "@google/genai";

export async function generateCode(params) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Build the prompt for Gemini
  const prompt = `Generate a complete, production-ready project based on the following requirements:

Description: ${params.description}
Language: ${params.language}
${params.framework ? `Framework: ${params.framework}` : ""}
${params.includeTests ? "Include unit tests" : "No tests needed"}

Please provide:
1. Complete file structure (directory tree)
2. All necessary files with complete code
3. Package configuration files (package.json, requirements.txt, etc.)
4. README.md with:
   - Project description
   - Installation instructions
   - Setup commands
   - How to run the project
   - How to run tests (if applicable)
   - Environment variables needed
5. Any additional configuration files needed

Format your response as JSON with the following structure:
{
  "projectName": "project-name",
  "fileStructure": {
    "type": "directory",
    "name": "root",
    "children": [...]
  },
  "files": [
    {
      "path": "relative/path/to/file",
      "content": "file content here",
      "description": "brief description of this file"
    }
  ],
  "setupInstructions": {
    "prerequisites": ["prerequisite 1", "prerequisite 2"],
    "installCommands": ["command 1", "command 2"],
    "runCommands": ["command to run the project"],
    "testCommands": ["command to run tests"],
    "environmentVariables": [
      {
        "name": "VAR_NAME",
        "description": "what this variable is for",
        "example": "example value"
      }
    ]
  },
  "additionalNotes": "any additional information or tips"
}`;

  try {
    // Call Gemini API using SDK
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction:
          "You are an expert software developer who creates complete, production-ready projects with clear documentation and setup instructions.",
        temperature: 0.5,
        topK: 40,
        topP: 0.95,
      },
    });

    const generatedText = response.text;

    // Try to parse the JSON from the response
    // Gemini might wrap it in markdown code blocks, so clean it first
    let cleanedText = generatedText.trim();

    // Remove markdown code blocks if present
    if (cleanedText.startsWith("```json")) {
      cleanedText = cleanedText.slice(7); // Remove ```json
    } else if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.slice(3); // Remove ```
    }

    // Remove trailing code block markers
    if (cleanedText.endsWith("```")) {
      cleanedText = cleanedText.slice(0, -3);
    }

    cleanedText = cleanedText.trim();

    // Try to find JSON object if text contains other content
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON found in response");
    }

    let jsonString = jsonMatch[0];

    // Try to parse, if it fails, try alternative approaches
    let projectData;
    try {
      projectData = JSON.parse(jsonString);
    } catch (parseError) {
      console.error(
        "Initial JSON parse failed, attempting alternative parsing..."
      );

      try {
        // Try to extract JSON more carefully
        // Sometimes AI adds explanation text before/after JSON
        const betterMatch = generatedText.match(
          /\{[\s\S]*"projectName"[\s\S]*\}/
        );
        if (betterMatch) {
          jsonString = betterMatch[0];
          projectData = JSON.parse(jsonString);
          console.error("Successfully parsed with alternative extraction");
        } else {
          throw new Error("Could not find valid JSON structure");
        }
      } catch (retryError) {
        // Return a basic structure as fallback
        console.error(
          "All parsing attempts failed. Original error:",
          parseError.message
        );
        throw new Error(
          `Failed to parse AI response. The AI response was malformed. Please try again or simplify your request.`
        );
      }
    }

    // Return data that can be used by writeFilesToDisk function
    return {
      success: true,
      projectName: projectData.projectName,
      fileStructure: projectData.fileStructure,
      files: projectData.files,
      setupInstructions: projectData.setupInstructions,
      additionalNotes: projectData.additionalNotes,
      summary: {
        totalFiles: projectData.files.length,
        language: params.language,
        framework: params.framework,
        hasTests: params.includeTests,
      },
    };
  } catch (error) {
    console.error("Code generation error:", error);
    throw error;
  }
}

// Helper function to write generated files to user's local file system
// This uses the File System Access API (works in Chrome, Edge, Opera)
export async function writeFilesToDisk(projectData) {
  try {
    // Check if File System Access API is supported
    if (!("showDirectoryPicker" in window)) {
      throw new Error(
        "File System Access API is not supported in this browser. Please use Chrome, Edge, or Opera."
      );
    }

    // Ask user to select a directory where project will be created
    const directoryHandle = await window.showDirectoryPicker({
      mode: "readwrite",
    });

    // Create project root directory
    const projectDirHandle = await directoryHandle.getDirectoryHandle(
      projectData.projectName,
      { create: true }
    );

    // Write all files
    for (const file of projectData.files) {
      await writeFile(projectDirHandle, file.path, file.content);
    }

    return {
      success: true,
      message: `Successfully created ${projectData.files.length} files in ${projectData.projectName}`,
      location: directoryHandle.name,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      return {
        success: false,
        message: "User cancelled directory selection",
      };
    }
    throw error;
  }
}

// Helper function to write a single file, creating directories as needed
async function writeFile(dirHandle, filePath, content) {
  const parts = filePath.split("/");
  const fileName = parts.pop();

  // Create nested directories if needed
  let currentDir = dirHandle;
  for (const part of parts) {
    if (part) {
      currentDir = await currentDir.getDirectoryHandle(part, { create: true });
    }
  }

  // Write the file
  if (fileName) {
    const fileHandle = await currentDir.getFileHandle(fileName, {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }
}
