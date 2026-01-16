import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

// ============================================================================
// Ralph State Types
// ============================================================================

export interface RalphTask {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: "pending" | "in-progress" | "completed" | "blocked";
  priority: number;
}

export interface RalphProgress {
  iteration: number;
  completedTasks: string[];
  currentTask: string | null;
  blockers: string[];
  lastUpdated: string;
}

export interface RalphRequirements {
  projectName: string;
  goal: string;
  userStories: RalphTask[];
}

// ============================================================================
// File Paths
// ============================================================================

const getFraudeDir = () => path.join(process.cwd(), ".fraude");
const getProgressPath = () => path.join(getFraudeDir(), "progress.json");
const getRequirementsPath = () =>
  path.join(getFraudeDir(), "requirements.json");
const getPlanPath = () => path.join(getFraudeDir(), "IMPLEMENTATION_PLAN.md");

// ============================================================================
// Initialization
// ============================================================================

export async function initRalphState(): Promise<void> {
  const fraudeDir = getFraudeDir();

  // Create .fraude directory
  await mkdir(fraudeDir, { recursive: true });

  // Initialize progress.json if it doesn't exist
  if (!existsSync(getProgressPath())) {
    const initialProgress: RalphProgress = {
      iteration: 0,
      completedTasks: [],
      currentTask: null,
      blockers: [],
      lastUpdated: new Date().toISOString(),
    };
    await writeFile(
      getProgressPath(),
      JSON.stringify(initialProgress, null, 2)
    );
  }

  // Initialize requirements.json if it doesn't exist
  if (!existsSync(getRequirementsPath())) {
    const initialRequirements: RalphRequirements = {
      projectName: "",
      goal: "",
      userStories: [],
    };
    await writeFile(
      getRequirementsPath(),
      JSON.stringify(initialRequirements, null, 2)
    );
  }
}

// ============================================================================
// Cleanup - Remove all Ralph state files
// ============================================================================

export async function cleanupRalphState(): Promise<void> {
  const fraudeDir = getFraudeDir();

  if (existsSync(fraudeDir)) {
    const { rm } = await import("node:fs/promises");
    await rm(fraudeDir, { recursive: true, force: true });
  }
}

// ============================================================================
// Progress State Management
// ============================================================================

export async function getProgress(): Promise<RalphProgress> {
  try {
    const content = await readFile(getProgressPath(), "utf-8");
    return JSON.parse(content);
  } catch {
    // Return default if file doesn't exist
    return {
      iteration: 0,
      completedTasks: [],
      currentTask: null,
      blockers: [],
      lastUpdated: new Date().toISOString(),
    };
  }
}

export async function updateProgress(
  updates: Partial<RalphProgress>
): Promise<RalphProgress> {
  const current = await getProgress();
  const updated: RalphProgress = {
    ...current,
    ...updates,
    lastUpdated: new Date().toISOString(),
  };
  await writeFile(getProgressPath(), JSON.stringify(updated, null, 2));
  return updated;
}

export async function incrementIteration(): Promise<number> {
  const progress = await getProgress();
  const newIteration = progress.iteration + 1;
  await updateProgress({ iteration: newIteration });
  return newIteration;
}

export async function markTaskComplete(taskId: string): Promise<void> {
  const progress = await getProgress();
  await updateProgress({
    completedTasks: [...progress.completedTasks, taskId],
    currentTask: null,
  });
}

export async function setCurrentTask(taskId: string | null): Promise<void> {
  await updateProgress({ currentTask: taskId });
}

export async function addBlocker(blocker: string): Promise<void> {
  const progress = await getProgress();
  await updateProgress({
    blockers: [...progress.blockers, blocker],
  });
}

export async function clearBlockers(): Promise<void> {
  await updateProgress({ blockers: [] });
}

// ============================================================================
// Requirements Management
// ============================================================================

export async function getRequirements(): Promise<RalphRequirements> {
  try {
    const content = await readFile(getRequirementsPath(), "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      projectName: "",
      goal: "",
      userStories: [],
    };
  }
}

export async function setRequirements(
  requirements: RalphRequirements
): Promise<void> {
  await writeFile(getRequirementsPath(), JSON.stringify(requirements, null, 2));
}

export async function addUserStory(task: RalphTask): Promise<void> {
  const requirements = await getRequirements();
  requirements.userStories.push(task);
  await setRequirements(requirements);
}

export async function updateUserStory(
  taskId: string,
  updates: Partial<RalphTask>
): Promise<void> {
  const requirements = await getRequirements();
  const index = requirements.userStories.findIndex((t) => t.id === taskId);
  if (index !== -1) {
    const existing = requirements.userStories[index]!;
    requirements.userStories[index] = {
      id: updates.id ?? existing.id,
      title: updates.title ?? existing.title,
      description: updates.description ?? existing.description,
      acceptanceCriteria:
        updates.acceptanceCriteria ?? existing.acceptanceCriteria,
      status: updates.status ?? existing.status,
      priority: updates.priority ?? existing.priority,
    };
    await setRequirements(requirements);
  }
}

// ============================================================================
// Implementation Plan Management
// ============================================================================

export async function getPlan(): Promise<string> {
  try {
    return await readFile(getPlanPath(), "utf-8");
  } catch {
    return "";
  }
}

export async function setPlan(content: string): Promise<void> {
  await writeFile(getPlanPath(), content);
}

// ============================================================================
// Utility: Get next pending task
// ============================================================================

export async function getNextTask(): Promise<RalphTask | null> {
  const requirements = await getRequirements();
  const progress = await getProgress();

  // Find first task that is not completed
  const nextTask = requirements.userStories.find(
    (task) =>
      !progress.completedTasks.includes(task.id) && task.status !== "completed"
  );

  return nextTask || null;
}

// ============================================================================
// Utility: Check if all tasks are complete
// ============================================================================

export async function isProjectComplete(): Promise<boolean> {
  const requirements = await getRequirements();
  const progress = await getProgress();

  return requirements.userStories.every(
    (task) =>
      progress.completedTasks.includes(task.id) || task.status === "completed"
  );
}
