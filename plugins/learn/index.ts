import log from "@/utils/logger";
import { BunApiRouter } from "@/utils/router";
import { Compiler } from "./compiler";
import { getKnowledgeGraph } from "./db/knowledge-graph";
import { join, dirname } from "path";
import {
  generateLesson,
  loadLesson,
  lessonExists,
  deleteLesson,
  resetAllLessons,
  type GeneratedLesson,
} from "./lesson-generator";

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

    // Get the learning frontier for a user
    router.register("GET", "/frontier/:userId", (req) => {
      const url = new URL(req.url);
      const userId = url.pathname.split("/").pop() || "default_user";
      const frontier = kg.getFrontier(userId);
      return new Response(JSON.stringify(frontier), {
        headers: { "Content-Type": "application/json" },
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

    // Get a specific concept
    router.register("GET", "/concept/:conceptId", (req) => {
      const url = new URL(req.url);
      const conceptId = url.pathname.split("/").pop() || "";
      const concept = kg.getConcept(conceptId);

      if (!concept) {
        return new Response(JSON.stringify({ error: "Concept not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(concept), {
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
    // LESSON GENERATION ENDPOINTS
    // ==========================================================================

    // Get or generate a lesson for a concept
    router.register("GET", "/lesson/:conceptId", async (req) => {
      try {
        const url = new URL(req.url);
        const conceptId = url.pathname.split("/").pop() || "";
        const model = url.searchParams.get("model") || undefined;

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

        // Check if lesson already exists
        if (lessonExists(conceptId)) {
          const lesson = loadLesson(conceptId);
          return new Response(JSON.stringify({ lesson, cached: true }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        // Generate new lesson using Agent
        const lesson = await generateLesson(concept, model);
        return new Response(JSON.stringify({ lesson, cached: false }), {
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

    // Force regenerate a lesson (useful for updating content)
    router.register("POST", "/lesson/generate", async (req) => {
      try {
        const body = (await req.json()) as {
          conceptId: string;
          model?: string;
          force?: boolean;
        };

        const { conceptId, model, force = false } = body;

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

        // Delete existing lesson if force regeneration
        if (force && lessonExists(conceptId)) {
          deleteLesson(conceptId);
        }

        const lesson = await generateLesson(concept, model);
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

      if (deleteLesson(conceptId)) {
        return new Response(JSON.stringify({ deleted: true, conceptId }), {
          headers: { "Content-Type": "application/json" },
        });
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

    await router.serve(3000);
  },
};

export default command;
