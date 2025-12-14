import { GoogleGenAI } from "@google/genai";

export async function generateCode(params) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Generate a complete, production-ready project based on the following requirements:

Description: ${params.description}
Language: ${params.language}
${params.framework ? `Framework: ${params.framework}` : ""}
${params.includeTests ? "Include unit tests" : "No tests needed"}

IMPORTANT: You must respond with ONLY valid JSON. No markdown, no code blocks, no explanations.

Format your response as a single JSON object with this EXACT structure:
{
  "projectName": "project-name",
  "files": [
    {
      "path": "filename.ext",
      "content": "file content with \\n for newlines"
    }
  ],
  "setup": {
    "install": ["npm install"],
    "run": ["npm start"],
    "test": ["npm test"]
  },
  "notes": "Brief setup notes"
}

RULES:
- Escape all quotes and newlines in file content
- Keep file content simple and functional
- Include README.md as first file
- Include package.json or requirements.txt
- Maximum 5-10 files total`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction:
          "You are an expert software developer. You MUST respond with ONLY valid JSON, no markdown, no code blocks, no extra text. Generate simple, working code with clear setup.",
        temperature: 0.3,
        topK: 20,
        topP: 0.9,
        responseMimeType: "application/json",
      },
    });

    let generatedText = response.text.trim();

    if (generatedText.startsWith("```json")) {
      generatedText = generatedText.slice(7);
    } else if (generatedText.startsWith("```")) {
      generatedText = generatedText.slice(3);
    }
    if (generatedText.endsWith("```")) {
      generatedText = generatedText.slice(0, -3);
    }
    generatedText = generatedText.trim();

    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in AI response. Please try again.");
    }

    let projectData;
    try {
      projectData = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      throw new Error(
        `Failed to parse AI response. The AI returned malformed JSON. Error: ${parseError.message}`
      );
    }

    if (!projectData.projectName || !projectData.files || !Array.isArray(projectData.files)) {
      throw new Error("AI response missing required fields. Please try again.");
    }

    const fileStructure = {
      type: "directory",
      name: "root",
      children: projectData.files.map((f) => ({
        type: "file",
        name: f.path,
      })),
    };

    const setupInstructions = {
      prerequisites: ["Node.js", params.language],
      installCommands: projectData.setup?.install || [],
      runCommands: projectData.setup?.run || [],
      testCommands: projectData.setup?.test || [],
      environmentVariables: [],
    };

    return {
      success: true,
      projectName: projectData.projectName,
      fileStructure,
      files: projectData.files.map((f) => ({
        path: f.path,
        content: f.content,
        description: "",
      })),
      setupInstructions,
      additionalNotes: projectData.notes || "",
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

export async function writeFilesToDisk(projectData) {
  try {
    if (!("showDirectoryPicker" in window)) {
      throw new Error(
        "File System Access API is not supported in this browser. Please use Chrome, Edge, or Opera."
      );
    }

    const directoryHandle = await window.showDirectoryPicker({
      mode: "readwrite",
    });

    const projectDirHandle = await directoryHandle.getDirectoryHandle(
      projectData.projectName,
      { create: true }
    );

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

async function writeFile(dirHandle, filePath, content) {
  const parts = filePath.split("/");
  const fileName = parts.pop();

  let currentDir = dirHandle;
  for (const part of parts) {
    if (part) {
      currentDir = await currentDir.getDirectoryHandle(part, { create: true });
    }
  }

  if (fileName) {
    const fileHandle = await currentDir.getFileHandle(fileName, {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }
}

