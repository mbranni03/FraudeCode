import useFraudeStore from "@/store/useFraudeStore";
import type { Server } from "bun";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
type Handler = (req: Request) => Response | Promise<Response>;
const { updateOutput } = useFraudeStore.getState();

interface Route {
  method: HttpMethod;
  path: string;
  handler: Handler;
}

export class BunApiRouter {
  private static routers = new Map<string, BunApiRouter>();

  public static getRouter(id: string): BunApiRouter | undefined {
    return this.routers.get(id);
  }
  private id: string = crypto.randomUUID();
  public port: number = 3000;
  private routes: Route[] = [];
  private server: Server<any> | null = null;
  private resolveServicePromise: (() => void) | null = null;

  public static stopRouter(id: string) {
    const router = this.routers.get(id);
    if (router) {
      router.stop();
      this.routers.delete(id);
    }
  }

  /**
   * Check if a route pattern matches a given pathname
   * Supports dynamic segments like :userId
   */
  private matchRoute(pattern: string, pathname: string): boolean {
    const patternParts = pattern.split("/").filter(Boolean);
    const pathParts = pathname.split("/").filter(Boolean);

    if (patternParts.length !== pathParts.length) {
      return false;
    }

    return patternParts.every((part, i) => {
      // Dynamic segment (starts with :)
      if (part.startsWith(":")) {
        return true;
      }
      // Static segment - must match exactly
      return part === pathParts[i];
    });
  }

  /**
   * Register a new endpoint
   * @param method HTTP Method
   * @param path URL path (e.g. "/api/v1/users" or "/users/:id")
   * @param handler Function to handle the request
   */
  public register(method: HttpMethod, path: string, handler: Handler) {
    this.routes.push({ method, path, handler });
  }

  /**
   * Start the server and block until interrupted.
   * @param port Port to listen on (default: 3000)
   */
  public async serve(port: number = 3000): Promise<void> {
    this.port = port;

    // Create a promise that we can manually resolve to "unblock" the caller
    const servicePromise = new Promise<void>((resolve) => {
      this.resolveServicePromise = resolve;
    });

    this.server = Bun.serve({
      port,
      idleTimeout: 180,
      fetch: async (req) => {
        const url = new URL(req.url);

        // CORS support
        const corsHeaders = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods":
            "GET, POST, PUT, DELETE, PATCH, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        };

        if (req.method === "OPTIONS") {
          return new Response(null, { headers: corsHeaders });
        }

        // Default health check
        if (url.pathname === "/health" && req.method === "GET") {
          return new Response("OK", { status: 200, headers: corsHeaders });
        }

        // Find matching route
        const route = this.routes.find(
          (r) =>
            this.matchRoute(r.path, url.pathname) && r.method === req.method,
        );

        if (route) {
          try {
            const response = await route.handler(req);
            // Append CORS headers to the handler's response
            const newHeaders = new Headers(response.headers);
            Object.entries(corsHeaders).forEach(([key, value]) => {
              newHeaders.set(key, value);
            });
            return new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: newHeaders,
            });
          } catch (error) {
            console.error("Error in handler:", error);
            return new Response("Internal Server Error", {
              status: 500,
              headers: corsHeaders,
            });
          }
        }

        return new Response("Not Found", {
          status: 404,
          headers: corsHeaders,
        });
      },
    });

    // Register this router instance
    BunApiRouter.routers.set(this.id, this);

    // Output the interactive component
    updateOutput("interactive-server", this.id);

    // Block until stopped
    await servicePromise;

    // Cleanup
    if (this.server) {
      this.server.stop();
    }

    BunApiRouter.routers.delete(this.id);
  }

  public stop() {
    if (this.resolveServicePromise) {
      this.resolveServicePromise();
      this.resolveServicePromise = null;
    }
  }
}
