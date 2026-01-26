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
   * Register a new endpoint
   * @param method HTTP Method
   * @param path URL path (e.g. "/api/v1/users")
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
      fetch: async (req) => {
        const url = new URL(req.url);

        // Default health check
        if (url.pathname === "/health" && req.method === "GET") {
          return new Response("OK", { status: 200 });
        }

        // Find matching route
        const route = this.routes.find(
          (r) => r.path === url.pathname && r.method === req.method,
        );

        if (route) {
          try {
            return await route.handler(req);
          } catch (error) {
            console.error("Error in handler:", error);
            return new Response("Internal Server Error", { status: 500 });
          }
        }

        return new Response("Not Found", { status: 404 });
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
