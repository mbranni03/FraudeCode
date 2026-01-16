import { mkdir } from "node:fs/promises";
import { initRalphState } from "./ralphState";
import path from "node:path";

const initFraude = async () => {
  const cwd = process.cwd();
  await mkdir(`${cwd}/.fraude`, { recursive: true });
  await initRalphState();

  // Add .fraude/ to .gitignore if it exists and doesn't already have it
  const gitignorePath = path.join(cwd, ".gitignore");
  const gitignoreFile = Bun.file(gitignorePath);

  if (await gitignoreFile.exists()) {
    const content = await gitignoreFile.text();
    if (!content.includes(".fraude")) {
      await Bun.write(
        gitignorePath,
        content.trimEnd() + "\n\n# Fraude agent state\n.fraude/\n"
      );
    }
  }
};

export default initFraude;
