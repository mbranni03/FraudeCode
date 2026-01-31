import fs from "node:fs/promises";
import path from "node:path";
import type { Command } from "@/types/CommandDefinition";
import log from "@/utils/logger";
import { Settings } from "@/config/settings";

export class PluginLoader {
  private pluginsDirs: string[];

  constructor() {
    // Get the system-wide config directory
    const configDir = (Settings as any).instance
      ? Settings.getInstance().getAll()
        ? (Settings as any).instance.settingsDir
        : ""
      : "";

    this.pluginsDirs = [
      path.resolve(import.meta.dir, "../../plugins"), // Plugin folder in the source/package root
      path.resolve(process.cwd(), "./plugins"), // Local plugins in the current working directory
    ];

    if (configDir) {
      this.pluginsDirs.push(path.join(configDir, "plugins")); // Global system config plugins
    }

    // Add any plugins folder relative to the executable if not already covered
    const execPath = process.argv[1];
    if (execPath) {
      const execDir = path.dirname(execPath);
      if (execDir !== process.cwd()) {
        this.pluginsDirs.push(path.resolve(execDir, "./plugins"));
      }
    }

    // De-duplicate paths
    this.pluginsDirs = Array.from(new Set(this.pluginsDirs));
  }

  async loadPlugins(): Promise<Command[]> {
    const allCommands: Command[] = [];
    const loadedPluginNames = new Set<string>();

    for (const dir of this.pluginsDirs) {
      try {
        await fs.access(dir);
      } catch {
        continue;
      }

      log(`Searching for plugins in: ${dir}`);
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Avoid loading the same plugin twice if it exists in multiple search paths
          if (loadedPluginNames.has(entry.name)) continue;

          const pluginPath = path.join(dir, entry.name);
          const entryPoint = path.join(pluginPath, "index.ts");

          try {
            await fs.access(entryPoint);
            const pluginModule = await import(entryPoint);

            if (pluginModule.default) {
              if (Array.isArray(pluginModule.default)) {
                allCommands.push(...pluginModule.default);
              } else {
                allCommands.push(pluginModule.default);
              }
              loadedPluginNames.add(entry.name);
              log(`Loaded plugin: ${entry.name} from ${dir}`);
            }
          } catch (e) {
            // Only log error if index.ts exists but failed to load
            try {
              await fs.access(entryPoint);
              log(`Failed to load plugin ${entry.name}:`, e);
            } catch {
              // index.ts doesn't exist, ignore
            }
          }
        }
      }
    }
    return allCommands;
  }
}
