import { structuredPatch } from "diff";
import { projectPath } from "@/utils";
import log from "@/utils/logger";

export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
  linedelimiters?: string[];
}

export interface DiffPatch {
  oldFileName?: string;
  newFileName?: string;
  oldHeader?: string;
  newHeader?: string;
  hunks: Hunk[];
}

export interface PendingChange {
  id: string;
  path: string;
  type: "edit" | "write";
  originalContent: string | null;
  newContent: string;
  diff: DiffPatch;
  feedback?: string;
}

class PendingChangesManager {
  private changes: Map<string, PendingChange> = new Map();

  public async addChange(
    path: string,
    newContent: string,
    type: "edit" | "write",
  ): Promise<PendingChange> {
    const originalContent = await this.getLatestContent(path);

    // Create unified diff
    // For new files, originalContent is empty string.
    // We use path as both old and new filename for the patch header
    const diff = structuredPatch(
      projectPath(path),
      projectPath(path),
      originalContent || "",
      newContent,
      "",
      "",
      { context: 2 },
    );

    const change: PendingChange = {
      id: crypto.randomUUID(),
      path,
      type,
      originalContent: type === "edit" ? originalContent : null,
      newContent,
      diff,
    };

    this.changes.set(change.id, change);
    return change;
  }

  public getChange(id: string): PendingChange | undefined {
    return this.changes.get(id);
  }

  public getChanges(): PendingChange[] {
    return Array.from(this.changes.values());
  }

  public getAllChangesGrouped(): Record<string, PendingChange[]> {
    const grouped: Record<string, PendingChange[]> = {};
    for (const change of this.changes.values()) {
      if (!grouped[change.path]) {
        grouped[change.path] = [];
      }
      grouped[change.path]?.push(change);
    }
    return grouped;
  }

  public hasChanges(): boolean {
    return this.changes.size > 0;
  }

  public async applyChange(id: string): Promise<boolean> {
    const change = this.changes.get(id);
    if (!change) return false;

    try {
      await Bun.write(change.path, change.newContent);
      this.changes.delete(id);
      log(`Applied change to ${change.path}`);
      return true;
    } catch (error) {
      if (change) {
        log(`Failed to apply change to ${change.path}: ${error}`);
      }
      return false;
    }
  }

  public async applyAll(): Promise<void> {
    for (const id of this.changes.keys()) {
      await this.applyChange(id);
    }
  }

  public rejectChange(id: string): boolean {
    return this.changes.delete(id);
  }

  public rejectAll(): void {
    this.changes.clear();
  }

  public addFeedback(id: string, feedback: string): boolean {
    const change = this.changes.get(id);
    if (!change) return false;

    change.feedback = feedback;
    return true;
  }

  public clear() {
    this.changes.clear();
  }
  /**
   * Gets the content of a file, accounting for any pending changes.
   * If there are pending changes, returns the new content of the most recent change.
   * Otherwise, reads the file from disk.
   */
  public async getLatestContent(path: string): Promise<string> {
    // Check pending changes first (reverse order to find latest)
    const changes = Array.from(this.changes.values()).reverse();
    const latestChange = changes.find((c) => c.path === path);

    if (latestChange) {
      return latestChange.newContent;
    }

    // If no pending changes, read from disk
    const file = Bun.file(path);
    if (await file.exists()) {
      return await file.text();
    }
    return "";
  }

  public getDiffStats(diff: DiffPatch): { added: number; removed: number } {
    let added = 0;
    let removed = 0;
    for (const hunk of diff.hunks) {
      for (const line of hunk.lines) {
        if (line.startsWith("+")) added++;
        if (line.startsWith("-")) removed++;
      }
    }
    return { added, removed };
  }
}

const pendingChanges = new PendingChangesManager();
export default pendingChanges;
