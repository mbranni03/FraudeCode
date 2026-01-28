import log from "@/utils/logger";
import { BunApiRouter } from "@/utils/router";
import { Compiler } from "./compiler";
import { getKnowledgeGraph } from "./db/knowledge-graph";
import { join, dirname } from "path";
import { readFileSync, existsSync } from "fs";
import {
  generateLesson,
  loadLesson,
  lessonExists,
  deleteLesson,
  resetAllLessons,
  getLatestLessonForConcept,
  getLessonsForLanguage,
  loadLessonById,
  type GeneratedLesson,
} from "./lesson-generator";
import Agent from "@/agent/agent";
import { Settings } from "@/config/settings";
import {
  analyzeSubmission,
  type SubmissionAnalysis,
  type CompileResult,
} from "./submission-analyzer";

const DB_PATH = join(dirname(import.meta.path), "rust_tutor.db");

const command = {
  name: "learn",
  description: "Code Learning Platform",
  usage: "/learn",
  action: async () => {
    const router = new BunApiRouter();
    const kg = getKnowledgeGraph(DB_PATH);

    router.register("GET", "/", (req) => {
      return new Response("Hello World", {
        headers: { "Content-Type": "text/plain" },
      });
    });

    // Get the next recommended lesson
    router.register("GET", "/next/:userId", (req) => {
      const url = new URL(req.url);
      const pathParts = url.pathname.split("/");
      const userId = pathParts[pathParts.length - 1] || "default_user";
      const category = url.searchParams.get("category") || undefined;

      const nextLesson = kg.getNextLesson(userId, category);

      if (!nextLesson) {
        return new Response(
          JSON.stringify({
            message: "No available lessons! (Or you mastered everything!)",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({
          lesson: nextLesson,
          context: nextLesson.metadata?.project_context || null,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    // Get user progress
    router.register("GET", "/progress/:userId", (req) => {
      const url = new URL(req.url);
      const userId = url.pathname.split("/").pop() || "default_user";
      const progress = kg.getUserProgress(userId);
      return new Response(JSON.stringify(progress), {
        headers: { "Content-Type": "application/json" },
      });
    });

    // Visualize knowledge graph as Mermaid diagram
    router.register("GET", "/visualize", (req) => {
      const url = new URL(req.url);
      const userId = url.searchParams.get("userId") || undefined;
      const mermaid = kg.getMermaidGraph(userId);
      return new Response(mermaid, {
        headers: { "Content-Type": "text/plain" },
      });
    });

    // Update mastery after a lesson
    router.register("POST", "/mastery", async (req) => {
      try {
        const body = (await req.json()) as {
          userId: string;
          conceptId: string;
          success: boolean;
          attempts: number;
          errorCode?: string;
        };

        const { userId, conceptId, success, attempts, errorCode } = body;

        if (!userId || !conceptId) {
          return new Response(
            JSON.stringify({ error: "userId and conceptId are required" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // Process lesson result with analytics loop
        const result = kg.processLessonResult(userId, conceptId, {
          success,
          errorCode: errorCode || null,
          attempts,
        });

        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    // Get a specific lesson by lessonId
    router.register("GET", "/lesson/:lessonId", (req) => {
      const url = new URL(req.url);
      const pathParts = url.pathname.split("/");
      const lessonId = pathParts[pathParts.length - 1] || "";

      if (!lessonId) {
        return new Response(JSON.stringify({ error: "lessonId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const lesson = loadLessonById(lessonId);

      if (!lesson) {
        return new Response(JSON.stringify({ error: "Lesson not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ lesson }), {
        headers: { "Content-Type": "application/json" },
      });
    });

    // Get all concepts
    router.register("GET", "/concepts", (req) => {
      const concepts = kg.getAllConcepts();
      return new Response(JSON.stringify(concepts), {
        headers: { "Content-Type": "application/json" },
      });
    });

    // Get all existing lessons for a specific language
    router.register("GET", "/lessons/:language", (req) => {
      const url = new URL(req.url);
      const pathParts = url.pathname.split("/");
      const language = pathParts[pathParts.length - 1] || "";
      const userId = url.searchParams.get("userId") || undefined;

      if (!language) {
        return new Response(
          JSON.stringify({ error: "Language parameter is required" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const lessons = getLessonsForLanguage(language);

      // If userId provided, enrich lessons with mastery data
      let enrichedLessons = lessons;
      if (userId) {
        const userMastery = kg.getUserMastery(userId);
        const masteryMap = new Map(
          userMastery.map((m) => [m.concept_id, m.mastery_score]),
        );

        enrichedLessons = lessons.map((lesson) => ({
          ...lesson,
          mastery: masteryMap.get(lesson.conceptId) ?? 0,
          completed: (masteryMap.get(lesson.conceptId) ?? 0) >= 0.8,
        }));
      }

      // 1. Clean up lessons: remove markdown and verificationTask for the list view
      const leanLessons = enrichedLessons.map((l: any) => {
        const { markdown, verificationTask, ...rest } = l;
        return rest;
      });

      // 2. Prepend Introduction if available
      let intro: any = null;

      const introPath = join(
        dirname(import.meta.path),
        "introduction",
        `${language.toUpperCase()}_INSTRUCTION.md`,
      );

      if (existsSync(introPath)) {
        try {
          const introMarkdown = readFileSync(introPath, "utf-8");
          intro = {
            lessonId: `${language}_intro`,
            title: `Introduction to ${language.charAt(0).toUpperCase() + language.slice(1)}`,
            markdown: introMarkdown,
          };
        } catch (e) {
          log(`Failed to read intro for ${language}: ${e}`);
        }
      }

      const completedCount = userId
        ? enrichedLessons.filter((l: any) => l.completed).length
        : undefined;

      return new Response(
        JSON.stringify({
          language,
          intro,
          count: leanLessons.length,
          completedCount,
          lessons: leanLessons,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    router.register("POST", "/compile", async (req) => {
      try {
        const body = (await req.json()) as { language?: string; code?: string };
        const { language, code } = body;

        if (!language || !code) {
          return new Response(
            JSON.stringify({ error: "Language and code are required" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // Use wasm32-wasip1 if wasm32-wasi is not supported by the toolchain
        const target = "wasm32-wasip1";
        const compile = new Compiler(
          "cargo",
          ["build", "--target", target],
          language,
          code,
        );
        const output = await compile.execute();

        return new Response(JSON.stringify(output), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    // ==========================================================================
    // CHATBOT ENDPOINT
    // ==========================================================================

    router.register("POST", "/ask", async (req) => {
      try {
        const body = (await req.json()) as {
          userId: string;
          lessonId: string;
          question: string;
          code: string;
          lastOutput?: string;
        };
        const { userId, lessonId, question, code, lastOutput } = body;

        if (!userId || !lessonId || !question) {
          return new Response(
            JSON.stringify({
              error: "userId, lessonId, and question are required",
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // Load exact lesson context
        const lesson = loadLessonById(lessonId);

        if (!lesson) {
          return new Response(JSON.stringify({ error: "Lesson not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        const concept = kg.getConcept(lesson.conceptId);

        if (!concept) {
          return new Response(JSON.stringify({ error: "Concept not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Construct optimized prompt
        const systemPrompt = `You are a helpful Rust tutor assistant. Your goal is to help the user understand the concept and complete the task without giving the direct solution code.
Guide them with hints, explanations, and small examples. Be concise and encouraging.`;

        let userPrompt = `User Question: "${question}"\n\n`;

        userPrompt += `Context:\n`;
        userPrompt += `- Concept: ${concept.label}\n`;

        if (lesson) {
          userPrompt += `- Task: ${lesson.verificationTask.description}\n`;
          userPrompt += `- Expected Output: ${lesson.verificationTask.expectedOutput}\n`;
        }

        userPrompt += `\nUser Code:\n\`\`\`rust\n${code}\n\`\`\`\n`;

        if (lastOutput) {
          userPrompt += `\nLast Compilation/Run Output:\n${lastOutput}\n`;
        }

        // Use Agent
        const model = Settings.getInstance().get("primaryModel");
        const agent = new Agent({
          model,
          systemPrompt,
          temperature: 0.7,
          maxTokens: 1000,
          maxSteps: 1, // Single turn
          useIsolatedContext: true,
        });

        const response = await agent.chat(userPrompt);

        return new Response(JSON.stringify({ answer: response.text }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (e: any) {
        log(`❌ Error in /ask: ${e.message}`);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    // ==========================================================================
    // SUBMISSION ENDPOINT
    // ==========================================================================

    router.register("POST", "/submit", async (req) => {
      try {
        const body = (await req.json()) as {
          userId: string;
          conceptId: string;
          code: string;
          lessonNumber?: number; // Optional: specify which lesson version
        };

        const { userId, conceptId, code, lessonNumber } = body;

        // Validate required fields
        if (!userId || !conceptId || !code) {
          return new Response(
            JSON.stringify({
              error: "userId, conceptId, and code are required",
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // Determine which lesson number to load
        let lesson: GeneratedLesson | null = null;
        let targetLessonNumber = lessonNumber;

        if (targetLessonNumber) {
          if (lessonExists(conceptId, targetLessonNumber)) {
            lesson = loadLesson(conceptId, targetLessonNumber);
          }
        } else {
          // Fallback to latest
          lesson = getLatestLessonForConcept(conceptId);
          targetLessonNumber = lesson?.lessonNumber;
        }

        if (!lesson) {
          return new Response(
            JSON.stringify({
              error: `Lesson not found for concept: ${conceptId}. Generate it first via GET /lesson/${conceptId}`,
            }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // Get current attempt count (computed from stored data)
        const previousAttempts = kg.getAttemptCount(userId, conceptId);
        const attemptNumber = previousAttempts + 1;

        // Compile and run the user's code
        const target = "wasm32-wasip1";
        const compiler = new Compiler(
          "cargo",
          ["build", "--target", target],
          "rust",
          code,
        );
        const compileResult: CompileResult = await compiler.execute();

        // Get concept info for mastery-based evaluation
        const concept = kg.getConcept(conceptId);

        // Analyze the submission with LLM (prioritizes concept mastery over task correctness)
        const analysis = await analyzeSubmission(
          code,
          compileResult,
          lesson,
          concept,
        );

        // Determine success based on analysis
        const success = analysis.passed && compileResult.exitCode === 0;

        // Extract error code from stderr if present
        let errorCode: string | null = null;
        if (compileResult.stderr) {
          const errorMatch = compileResult.stderr.match(/error\[(E\d+)\]/);
          if (errorMatch) {
            errorCode = errorMatch[1] ?? null;
          }
        }

        // Process result and update mastery
        const masteryUpdate = kg.processLessonResult(userId, conceptId, {
          success,
          errorCode,
          attempts: attemptNumber,
        });

        log(
          `📝 Submission: user=${userId} concept=${conceptId} lesson=${targetLessonNumber} attempt=${attemptNumber} passed=${success}${analysis.overrideApplied ? " (LLM override applied)" : ""}`,
        );

        return new Response(
          JSON.stringify({
            passed: success,
            attemptNumber,
            lessonNumber: targetLessonNumber,
            compileResult: {
              exitCode: compileResult.exitCode,
              stdout: compileResult.stdout,
              stderr: compileResult.stderr,
              runOutput: compileResult.runOutput,
            },
            analysis,
            masteryUpdate,
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (e: any) {
        log(`❌ Submission error: ${e.message}`);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    // ==========================================================================
    // LESSON GENERATION ENDPOINTS
    // ==========================================================================

    // Get or generate a lesson for a concept
    router.register("GET", "/lesson/:conceptId", async (req) => {
      try {
        const url = new URL(req.url);
        const conceptId = url.pathname.split("/").pop() || "";
        const model = url.searchParams.get("model") || undefined;
        const userId = url.searchParams.get("userId") || "default_user";

        // Optional: Request a specific lesson number
        const lessonNumberParam = url.searchParams.get("lessonNumber");
        const requestedLessonNumber = lessonNumberParam
          ? parseInt(lessonNumberParam)
          : undefined;

        // Get concept from knowledge graph
        const concept = kg.getConcept(conceptId);
        if (!concept) {
          return new Response(
            JSON.stringify({ error: `Concept not found: ${conceptId}` }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // Attempt to retrieval existing lesson
        let lesson: GeneratedLesson | null = null;

        if (requestedLessonNumber) {
          // Try specific number
          if (lessonExists(conceptId, requestedLessonNumber)) {
            lesson = loadLesson(conceptId, requestedLessonNumber);
          }
        } else {
          // Try latest
          lesson = getLatestLessonForConcept(conceptId);
        }

        if (lesson) {
          return new Response(JSON.stringify({ lesson, cached: true }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        // Generate new lesson using Agent (Global Sequence)
        // Get user context (recent errors)
        const recentErrors = kg.getRecentErrors(userId);

        // If we are here, it means no existing lesson was found or requested.
        // We trigger generation.
        const newLesson = await generateLesson(concept, model, {
          recentErrors,
          masteredConcepts: kg.getConceptPrerequisites(concept.id),
        });

        return new Response(
          JSON.stringify({ lesson: newLesson, cached: false }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (e: any) {
        log(`Error generating lesson: ${e.message}`);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    // Get the next lesson content (Generate if needed)
    router.register("POST", "/lesson/next", async (req) => {
      try {
        const body = (await req.json()) as {
          userId: string;
          currentConceptId?: string;
        };
        const { userId, currentConceptId } = body;

        const nextConcept = kg.getNextLesson(userId);

        if (!nextConcept) {
          return new Response(
            JSON.stringify({
              message: "No available lessons! (Or you mastered everything!)",
              completed: true,
            }),
            {
              status: 200, // 200 OK, but with message
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // Determine if we need to force a new lesson (Retry scenario)
        // If the user is requesting "next" but the knowledge graph says the "next" concept
        // is the SAME as the one they just did (currentConceptId), it means they haven't mastered it yet.
        // In this case, we should generate a FRESH lesson (new exercises) instead of returning the cached one.
        const isRetry =
          !!currentConceptId && nextConcept.id === currentConceptId;

        // Check if we already have a generated lesson for this concept
        // ONLY check cache if it's NOT a retry.
        let lesson: GeneratedLesson | null = null;
        if (!isRetry) {
          lesson = getLatestLessonForConcept(nextConcept.id);
        }

        if (lesson) {
          return new Response(JSON.stringify({ lesson, cached: true }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        // If not, generate one
        const recentErrors = kg.getRecentErrors(userId);
        lesson = await generateLesson(nextConcept, undefined, {
          recentErrors,
          masteredConcepts: kg.getConceptPrerequisites(nextConcept.id),
        });

        return new Response(JSON.stringify({ lesson, cached: false }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (e: any) {
        log(`Error getting next lesson: ${e.message}`);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    // Force regenerate a lesson (useful for updating content)
    router.register("POST", "/lesson/generate", async (req) => {
      try {
        const body = (await req.json()) as {
          conceptId: string;
          model?: string;
          force?: boolean;
          userId?: string;
          lessonNumber?: number;
        };

        const {
          conceptId,
          model,
          force = false,
          userId = "default_user",
          lessonNumber,
        } = body;

        if (!conceptId) {
          return new Response(
            JSON.stringify({ error: "conceptId is required" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        const concept = kg.getConcept(conceptId);
        if (!concept) {
          return new Response(
            JSON.stringify({ error: `Concept not found: ${conceptId}` }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        // If force is true AND lessonNumber is provided, we delete that specific one.
        // If force is true and NO lessonNumber, we create a NEW GLOBAL lesson?
        // Or do we regenerate the LATEST global lesson for this concept?
        // To allow "Regenerate Content" for the current view, we should look up the latest and delete it if force=true.

        let targetLessonNumber = lessonNumber;

        if (!targetLessonNumber && force) {
          // Find the latest lesson to overwrite
          const existing = getLatestLessonForConcept(conceptId);
          if (existing) {
            targetLessonNumber = existing.lessonNumber;
          }
        }

        if (force && targetLessonNumber) {
          if (lessonExists(conceptId, targetLessonNumber)) {
            deleteLesson(conceptId, targetLessonNumber);
          }
        }

        // If targetLessonNumber is still undefined, generateLesson will pick the next global number.
        const recentErrors = kg.getRecentErrors(userId);
        const lesson = await generateLesson(
          concept,
          model,
          {
            recentErrors,
            masteredConcepts: kg.getConceptPrerequisites(concept.id),
          },
          targetLessonNumber,
        );

        return new Response(JSON.stringify({ lesson, regenerated: force }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (e: any) {
        log(`Error generating lesson: ${e.message}`);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    // Delete a cached lesson
    router.register("DELETE", "/lesson/:conceptId", async (req) => {
      const url = new URL(req.url);
      const conceptId = url.pathname.split("/").pop() || "";
      const lessonNumber = parseInt(
        url.searchParams.get("lessonNumber") || "0",
      );

      if (lessonNumber === 0) {
        return new Response(
          JSON.stringify({
            error:
              "Must override lessonNumber query param to delete specific global lesson.",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (deleteLesson(conceptId, lessonNumber)) {
        return new Response(
          JSON.stringify({ deleted: true, conceptId, lessonNumber }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({ error: "Lesson not found or already deleted" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    // Reset everything for learning
    router.register("POST", "/reset", async (req) => {
      try {
        log("🔄 Resetting learning system...");

        // 1. Reset database (mastery, logs, etc.)
        kg.resetDatabase();

        // 2. Clear all cached lessons
        resetAllLessons();

        return new Response(
          JSON.stringify({
            message:
              "Learning system reset successfully. Database reinitialized and all cached lessons cleared.",
            success: true,
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (e: any) {
        log(`❌ Error resetting learning system: ${e.message}`);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    // Reset user mastery only (keep lessons)
    router.register("POST", "/reset/mastery", async (req) => {
      try {
        let userId: string | undefined = undefined;
        try {
          const body = (await req.json()) as { userId?: string };
          userId = body.userId;
        } catch {
          // No body provided, will reset all users if intended or just treat as global reset if acceptable
          // checking query params just in case
          const url = new URL(req.url);
          userId = url.searchParams.get("userId") || undefined;
        }

        kg.resetUserProgress(userId);

        return new Response(
          JSON.stringify({
            message: userId
              ? `Progress reset for user: ${userId}`
              : "All user progress has been reset.",
            success: true,
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (e: any) {
        log(`❌ Error resetting mastery: ${e.message}`);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    });

    await router.serve(3000);
  },
};

export default command;
