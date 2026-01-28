import Agent from "@/agent/agent";
import type { Concept } from "./db/knowledge-graph";
import { join, dirname } from "path";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { Settings } from "@/config/settings";

const LESSONS_DIR = join(dirname(import.meta.path), "lessons");

// Ensure lessons directory exists
if (!existsSync(LESSONS_DIR)) {
  mkdirSync(LESSONS_DIR, { recursive: true });
}

/**
 * Structured lesson format returned by the agent
 */
export interface GeneratedLesson {
  conceptId: string;
  title: string;
  markdown: string;
  verificationTask: {
    description: string;
    expectedOutput: string;
    validationCriteria: string[];
    starterFiles: Array<{
      path: string;
      content: string;
    }>;
  };
  generatedAt: string;
}

export interface UserContext {
  recentErrors?: string[];
  masteryLevel?: number; // 0-1
}

/**
 * System prompt for the lesson generation agent.
 * Follows prompt engineering best practices:
 * - Authority: Clear, imperative instructions
 * - Commitment: Required structural elements
 * - Scarcity: Specific format requirements
 */
const LESSON_SYSTEM_PROMPT = `You are a Rust instructor. Your role is to TEACH, not to give answers.

## Critical Rules (NO EXCEPTIONS)

- **NEVER include solution code** in starter files. Starter code = scaffolding + TODO comments only.
- **Guide through hints**, not implementations. The learner must write the core logic themselves.
- **Starter files must compile** but be functionally incomplete (e.g., return placeholder values, panic with todo!()).

## Output Format

Respond with markdown in this exact structure:

---
# [Concept Title]

## Learning Objectives
- [3-5 measurable objectives using action verbs]

## Prerequisites
- [Concepts the learner should already know]

## Concept Explanation
[Explain the concept. Include:
- Key terminology
- Why it matters in Rust
- Common pitfalls]

## Code Examples

### Example 1: Basic Usage
\`\`\`rust
// Annotated example demonstrating the concept
\`\`\`

### Example 2: Applied Context
\`\`\`rust
// Real-world usage scenario
\`\`\`

## Verification Task

**YOUR MISSION:**
[Specific, actionable task description. Be clear about WHAT to build, not HOW.]

**Starter Files:**
For each file, use this format:

**file: [relative/path/to/file]**
\`\`\`rust
// Scaffolding only. Include:
// - Function signatures with todo!() bodies
// - Struct definitions if needed
// - TODO comments explaining what each part should do
// - NO solution logic
\`\`\`

**Hints:**
- [Nudge toward the right approach without revealing it]
- [Point to relevant concepts from the explanation]
- [Suggest what to think about, not what to type]

**Expected Behavior:**
[Describe what happens when the code is correct]

**Success Criteria:**
- [ ] [Verifiable criterion 1]
- [ ] [Verifiable criterion 2]
- [ ] [Verifiable criterion 3]

**Expected Output:**
\`\`\`
[Exact expected console output, or use [placeholder] for variable values]
\`\`\`

## Common Mistakes
1. **[Mistake]**: [Why it happens and how to fix it]
2. **[Mistake]**: [Why it happens and how to fix it]

## Summary
[2-3 sentences capturing key takeaways]

---

## Starter Code Guidelines

Your starter files MUST follow this pattern:

✅ GOOD (teaches):
\`\`\`rust
fn calculate_area(width: u32, height: u32) -> u32 {
    // TODO: Multiply width and height to get the area
    todo!("Implement area calculation")
}
\`\`\`

❌ BAD (gives answer away):
\`\`\`rust
fn calculate_area(width: u32, height: u32) -> u32 {
    width * height
}
\`\`\`

The learner must THINK and WRITE the solution. Your job is to create the conditions for that learning, not to do it for them.`;

/**
 * Generate a lesson for a specific concept using the Agent
 */
export async function generateLesson(
  concept: Concept,
  model?: string,
  context?: UserContext,
): Promise<GeneratedLesson> {
  // Use provided model, or fall back to user's primary model from settings
  const selectedModel = model ?? Settings.getInstance().get("primaryModel");

  // Check if lesson already exists
  const lessonPath = getLessonPath(concept.id);
  if (existsSync(lessonPath)) {
    return loadLesson(concept.id);
  }

  const agent = new Agent({
    model: selectedModel,
    systemPrompt: LESSON_SYSTEM_PROMPT,
    temperature: 0.7,
    maxTokens: 4096,
    maxSteps: 1,
    useIsolatedContext: true,
  });

  const userPrompt = buildLessonPrompt(concept, context);
  const response = await agent.chat(userPrompt);

  const lesson: GeneratedLesson = {
    conceptId: concept.id,
    title: concept.label,
    markdown: response.text,
    verificationTask: extractVerificationTask(response.text),
    generatedAt: new Date().toISOString(),
  };

  // Save to disk
  saveLesson(lesson);

  return lesson;
}

/**
 * Build the user prompt for a specific concept
 */
function buildLessonPrompt(concept: Concept, context?: UserContext): string {
  const parts: string[] = [
    `Create a lesson for the Rust concept: **${concept.label}** (ID: ${concept.id})`,
    "",
    `**Complexity Level:** ${concept.complexity} (0.0 = beginner, 1.0 = expert)`,
    `**Category:** ${concept.category || "general"}`,
  ];

  if (concept.metadata?.project_context) {
    parts.push("");
    parts.push(`**Project Context:** ${concept.metadata.project_context}`);
    parts.push(
      "Use this context to make the examples and verification task relevant.",
    );
  }

  // Add contextual information about user struggles
  if (context?.recentErrors && context.recentErrors.length > 0) {
    parts.push("");
    parts.push("## Adaptive Learning Context");
    parts.push(
      `The user has recently struggled with these Rust errors: ${context.recentErrors.join(", ")}.`,
    );
    parts.push(
      "If relevant to this concept, briefly reinforce how to avoid these specific errors in the 'Common Mistakes' or 'Concept Explanation' sections.",
    );
  }

  parts.push("");
  parts.push(
    "Generate a complete lesson following the exact format specified.",
  );
  parts.push(
    "The Verification Task should directly test understanding of this concept.",
  );

  return parts.join("\n");
}

/**
 * Extract verification task data from generated markdown
 */
function extractVerificationTask(
  markdown: string,
): GeneratedLesson["verificationTask"] {
  // Extract task description
  const missionMatch = markdown.match(
    /\*\*YOUR MISSION:\*\*\s*\n([\s\S]*?)(?=\n\*\*)/i,
  );
  const description =
    missionMatch?.[1]?.trim() || "Complete the implementation";

  // Extract starter files
  const starterFiles: Array<{ path: string; content: string }> = [];
  const fileRegex = /\*\*file: ([\w\.\/-]+)\*\*\s*\n```\w*\n([\s\S]*?)\n```/gi;
  let fileMatch;
  while ((fileMatch = fileRegex.exec(markdown)) !== null) {
    if (fileMatch[1] && fileMatch[2]) {
      starterFiles.push({
        path: fileMatch[1],
        content: fileMatch[2].trim(),
      });
    }
  }

  // Extract expected output
  const outputMatch = markdown.match(
    /\*\*Expected Output:\*\*\s*\n```\s*\n([\s\S]*?)\n```/i,
  );
  const expectedOutput = outputMatch?.[1]?.trim() || "";

  // Extract success criteria
  const criteriaMatch = markdown.match(
    /\*\*Success Criteria:\*\*\s*\n([\s\S]*?)(?=\n\*\*Verification Command)/i,
  );
  const criteriaText = criteriaMatch?.[1] || "";
  const validationCriteria = criteriaText
    .split("\n")
    .filter((line) => line.includes("[ ]"))
    .map((line) => line.replace(/^-\s*\[\s*\]\s*/, "").trim());

  return {
    description,
    expectedOutput,
    validationCriteria:
      validationCriteria.length > 0
        ? validationCriteria
        : ["Code compiles successfully", "Expected output matches"],
    starterFiles,
  };
}

/**
 * Get the file path for a lesson
 */
function getLessonPath(conceptId: string): string {
  const filename = conceptId.replace(/\./g, "_") + ".json";
  return join(LESSONS_DIR, filename);
}

/**
 * Save a lesson to disk
 */
function saveLesson(lesson: GeneratedLesson): void {
  const path = getLessonPath(lesson.conceptId);
  writeFileSync(path, JSON.stringify(lesson, null, 2));
}

/**
 * Load a lesson from disk
 */
export function loadLesson(conceptId: string): GeneratedLesson {
  const path = getLessonPath(conceptId);
  const content = readFileSync(path, "utf-8");
  return JSON.parse(content);
}

/**
 * Check if a lesson exists
 */
export function lessonExists(conceptId: string): boolean {
  return existsSync(getLessonPath(conceptId));
}

/**
 * Delete a lesson (for regeneration)
 */
export function deleteLesson(conceptId: string): boolean {
  const path = getLessonPath(conceptId);
  if (existsSync(path)) {
    const fs = require("fs");
    fs.unlinkSync(path);
    return true;
  }
  return false;
}

/**
 * Reset all cached lessons
 */
export function resetAllLessons(): void {
  const fs = require("fs");
  if (existsSync(LESSONS_DIR)) {
    const files = fs.readdirSync(LESSONS_DIR);
    for (const file of files) {
      if (file.endsWith(".json")) {
        fs.unlinkSync(join(LESSONS_DIR, file));
      }
    }
  }
}
