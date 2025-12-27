import * as fs from "fs";
import * as path from "path";
import type { PendingChange } from "../../types/state";

export const applyTargetedChanges = (
  modifications: string,
  repoPath: string,
  updateOutput: (type: "log", content: string) => void
): PendingChange[] => {
  const pendingChanges: PendingChange[] = [];

  const fileBlocks = modifications
    .split(/\bFILE:\s*/i)
    .filter((b) => b.trim().length > 0);

  for (const block of fileBlocks) {
    const blockLines = block.split(/\r?\n/);
    let filePath = blockLines[0]
      ?.trim()
      .replace(/\*+$/, "")
      .replace(/^\*+/, "")
      .trim();

    if (!filePath || (!filePath.includes("/") && !filePath.match(/\.\w+$/))) {
      continue;
    }

    let relativePath = filePath;
    if (filePath.startsWith("sample/")) {
      relativePath = filePath.substring(7);
    }
    const absPath = path.join(repoPath, relativePath);

    let oldContent = "";
    if (fs.existsSync(absPath)) {
      oldContent = fs.readFileSync(absPath, "utf8");
    } else {
      updateOutput(
        "log",
        `[applyTargetedChanges] WARNING: File does not exist: ${absPath}`
      );
    }

    let newContent = oldContent;
    const atLineSections = block.split(/\bAT LINE\s+/i);
    const changes: { line: number; remove?: string; add?: string }[] = [];

    for (let i = 1; i < atLineSections.length; i++) {
      const section = atLineSections[i];
      if (!section) continue;

      const lineMatch = section.match(/^(\d+)/);
      if (!lineMatch) continue;

      const lineNum = parseInt(lineMatch[1]!, 10);

      const removeMatch = section.match(
        /REMOVE:\s*```(?:\w+)?\r?\n([\s\S]*?)```/i
      );
      const addMatch = section.match(/ADD:\s*```(?:\w+)?\r?\n([\s\S]*?)```/i);

      if (removeMatch || addMatch) {
        changes.push({
          line: lineNum,
          remove:
            removeMatch && removeMatch[1]
              ? removeMatch[1].trimEnd()
              : undefined,
          add: addMatch && addMatch[1] ? addMatch[1].trimEnd() : undefined,
        });
      }
    }

    changes.sort((a, b) => b.line - a.line);
    let contentLines = newContent.split(/\r?\n/);

    for (const change of changes) {
      const startIdx = change.line - 1;

      if (change.remove) {
        const removeLines = change.remove.split(/\r?\n/);
        let matchFound = true;
        for (let i = 0; i < removeLines.length; i++) {
          const contentLine = contentLines[startIdx + i];
          const removeLine = removeLines[i];
          if (contentLine?.trim() !== removeLine?.trim()) {
            matchFound = false;
            break;
          }
        }

        if (matchFound) {
          contentLines.splice(startIdx, removeLines.length);
        } else {
          updateOutput(
            "log",
            `[applyTargetedChanges] FAILED to remove lines at ${change.line} due to mismatch`
          );
        }
      }

      if (change.add) {
        const addLines = change.add.split(/\r?\n/);
        contentLines.splice(startIdx, 0, ...addLines);
      }
    }

    newContent = contentLines.join("\n");

    pendingChanges.push({
      filePath,
      absPath,
      oldContent,
      newContent,
    });
  }

  return pendingChanges;
};
