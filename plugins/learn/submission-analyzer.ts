import Agent from "@/agent/agent";
import { Settings } from "@/config/settings";
import type { GeneratedLesson } from "./lesson-generator";

/**
 * Result from the submission analyzer
 */
export interface SubmissionAnalysis {
  passed: boolean;
  feedback: string;
  hintsForNextAttempt?: string[];
}

/**
 * Compile result structure from the Compiler
 */
export interface CompileResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  runOutput?: {
    stdout: string;
    stderr: string;
  };
}

/**
 * System prompt for submission analysis.
 * Uses authority + commitment patterns for consistent, fair grading.
 */
const SUBMISSION_ANALYSIS_PROMPT = `You are a fair, encouraging Rust code grader. Your job is to evaluate student submissions.

## Your Task

Compare the student's code output against the expected output and validation criteria.

## Rules (NO EXCEPTIONS)

1. **Be fair**: Minor formatting differences (extra whitespace, trailing newlines) do NOT constitute failure.
2. **Be specific**: If the submission fails, explain EXACTLY what's wrong and what the correct behavior should be.
3. **Be encouraging**: Frame feedback constructively. The student is learning.
4. **No solutions**: NEVER include complete solution code in your feedback. Give hints, not answers.

## Output Format

Respond with JSON only, no markdown fencing:

{
  "passed": boolean,
  "feedback": "Clear explanation of the result",
  "hintsForNextAttempt": ["hint1", "hint2"] // Only if passed is false
}

## Evaluation Criteria

- **Compilation**: Code must compile without errors
- **Runtime**: Code must execute without panicking
- **Output**: Actual output must match expected output (be lenient on whitespace)
- **Criteria**: All validation criteria from the lesson must be satisfied`;

/**
 * Analyze a user's code submission using LLM
 */
export async function analyzeSubmission(
  code: string,
  compileResult: CompileResult,
  lesson: GeneratedLesson,
  model?: string,
): Promise<SubmissionAnalysis> {
  const selectedModel = model ?? Settings.getInstance().get("primaryModel");

  // Fast-path: compilation failed
  if (compileResult.exitCode !== 0) {
    return {
      passed: false,
      feedback: `Compilation failed. Please fix the errors and try again.\n\nCompiler output:\n${compileResult.stderr}`,
      hintsForNextAttempt: extractHintsFromStderr(compileResult.stderr),
    };
  }

  const agent = new Agent({
    model: selectedModel,
    systemPrompt: SUBMISSION_ANALYSIS_PROMPT,
    temperature: 0.3, // Low temperature for consistent grading
    maxTokens: 1024,
    maxSteps: 1,
    useIsolatedContext: true,
  });

  const actualOutput = compileResult.runOutput?.stdout ?? "";
  const { verificationTask } = lesson;

  const userPrompt = `## Student Code

\`\`\`rust
${code}
\`\`\`

## Actual Output

\`\`\`
${actualOutput}
\`\`\`

## Expected Output

\`\`\`
${verificationTask.expectedOutput}
\`\`\`

## Validation Criteria

${verificationTask.validationCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

## Task Description

${verificationTask.description}

Evaluate this submission.`;

  const response = await agent.chat(userPrompt);

  try {
    // Robust backend JSON extraction: find the outer braces
    let jsonString = response.text;
    const firstBrace = jsonString.indexOf("{");
    const lastBrace = jsonString.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonString = jsonString.substring(firstBrace, lastBrace + 1);
    }

    const analysis = JSON.parse(jsonString) as SubmissionAnalysis;
    return {
      passed: Boolean(analysis.passed),
      feedback: analysis.feedback || "Analysis complete.",
      hintsForNextAttempt: analysis.hintsForNextAttempt,
    };
  } catch {
    // Fallback if LLM doesn't return valid JSON
    const passed = response.text.toLowerCase().includes('"passed": true');
    return {
      passed,
      feedback: response.text,
    };
  }
}

/**
 * Extract helpful hints from Rust compiler error messages
 */
function extractHintsFromStderr(stderr: string): string[] {
  const hints: string[] = [];

  // Common Rust error patterns with educational hints
  if (stderr.includes("E0382")) {
    hints.push("Value was moved. Consider using .clone() or borrowing with &");
  }
  if (stderr.includes("E0502") || stderr.includes("E0499")) {
    hints.push(
      "Borrowing conflict. Check if you're mixing mutable and immutable references",
    );
  }
  if (stderr.includes("E0308")) {
    hints.push(
      "Type mismatch. Check your function return types and variable types",
    );
  }
  if (stderr.includes("E0425")) {
    hints.push(
      "Cannot find value. Check for typos in variable or function names",
    );
  }
  if (stderr.includes("expected")) {
    hints.push("Review the expected types in the error message");
  }

  return hints;
}
