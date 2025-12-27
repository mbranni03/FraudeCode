import * as fs from "fs";
import * as path from "path";
import ignore from "ignore";
import type { GitRepo } from "../types/analysis";

export async function walkRepo(
  repo: GitRepo,
  onFile: (filePath: string, absPath: string) => Promise<void>
) {
  const ig = ignore();
  ig.add(".gitignore");

  const gitignorePath = path.join(repo.path, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const content = await fs.promises.readFile(gitignorePath, "utf8");
    ig.add(content);
  }

  const walk = async (dir: string, subPath: string = "") => {
    const entries = await fs.promises
      .readdir(path.join(dir, subPath), { withFileTypes: true })
      .catch(() => []);

    for (const entry of entries) {
      const absPath = path.join(dir, subPath, entry.name);
      const filePath = path.relative(repo.path, absPath);

      if (ig.ignores(filePath)) continue;

      if (entry.isDirectory()) {
        await walk(absPath);
      } else if (entry.isFile()) {
        await onFile(filePath, absPath);
      }
    }
  };

  await walk(repo.path, repo.subPath || "");
}
