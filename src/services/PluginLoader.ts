import fs from "node:fs/promises";
import path from "node:path";
import type { Command } from "@/types/CommandDefinition";
import log from "@/utils/logger";

export class PluginLoader {
  private pluginsDir: string;

  constructor(pluginsDir: string = "./plugins") {
    this.pluginsDir = path.resolve(process.cwd(), pluginsDir);
  }

  async loadPlugins(): Promise<Command[]> {
    const commands: Command[] = [];
    try {
      await fs.access(this.pluginsDir);
    } catch {
      // Plugins directory doesn't exist, which is fine
      return [];
    }

    const entries = await fs.readdir(this.pluginsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginPath = path.join(this.pluginsDir, entry.name);
        const entryPoint = path.join(pluginPath, "index.ts");

        try {
          // Check if index.ts exists
          await fs.access(entryPoint);

          // Dynamic import
          const pluginModule = await import(entryPoint);

          // Support both default export and named exports
          if (pluginModule.default) {
            if (Array.isArray(pluginModule.default)) {
              commands.push(...pluginModule.default);
            } else {
              commands.push(pluginModule.default);
            }
          }
        } catch (e) {
          log(`Failed to load plugin ${entry.name}:`, e);
        }
      }
    }
    return commands;
  }
}
