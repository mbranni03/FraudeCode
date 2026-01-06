import { HumanMessage } from "@langchain/core/messages";
import type { ModifierStateType } from "../../types/state";
import ModificationCodeChangesPrompt from "../../types/prompts/modify/CodeChanges";
import { useFraudeStore } from "../../store/useFraudeStore";
import { generalModel } from "../../services/llm";
// import FastCodeChangesPrompt from "../../types/prompts/modify/FastChanges";
import FastCodeChangesPrompt from "../../types/prompts/modify/FastChanges";
import log from "../../utils/logger";
import { applyChangesToContent } from "../../utils/CodeModifier";

const { updateOutput, setStatus } = useFraudeStore.getState();

interface PlanStep {
  file?: string;
  task?: string;
}

const parseFileAndTask = (text: string): PlanStep[] => {
  const results: PlanStep[] = [];

  const fileBlocks = text.split(/FILE:/).filter((block) => block.trim() !== "");

  for (const block of fileBlocks) {
    const lines = block.trim().split("\n");
    const filePath = lines[0]?.trim();
    const content = lines.slice(1).join("\n");
    const taskParts = content
      .split(/\-\s*\[\s*\]\s*TASK:/)
      .filter((t) => t.trim() !== "");

    for (const part of taskParts) {
      const cleanTask = part?.split(/[-]{3,}/)[0]?.trim();

      results.push({
        file: filePath,
        task: cleanTask,
      });
    }
  }

  return results;
};

const generateModifications = async (prompt: any[], signal?: AbortSignal) => {
  let modifications = "";
  const stream = await generalModel.stream(prompt, {
    signal,
  });
  let lastChunk = null;
  for await (const chunk of stream) {
    if (signal?.aborted) break;
    const content = chunk.content as string;
    modifications += content;
    lastChunk = chunk;
    updateOutput("markdown", modifications, "Implementation Details");
  }
  log("Coder modifications: ", modifications);
  let usage = null;
  if (lastChunk?.usage_metadata) {
    usage = lastChunk.usage_metadata;

    useFraudeStore.getState().updateTokenUsage({
      total: usage.total_tokens,
      prompt: usage.input_tokens,
      completion: usage.output_tokens,
    });
  }
  updateOutput(
    "checkpoint",
    `Generated code changes [${usage?.output_tokens} tokens]`
  );
  return modifications;
};

export const createCodeNode = () => {
  return async (state: ModifierStateType, config?: any) => {
    log("Coder state: ", JSON.stringify(state, null, 2));
    setStatus("Generating code changes (llama3.1:latest)");
    let prompt = null;
    let modifications = "";

    if (useFraudeStore.getState().executionMode === "Planning") {
      const tasks = parseFileAndTask(state.thinkingProcess);
      for (const task of tasks) {
        const filePath = task.file || "";
        let currentContext = state.mappedContext[filePath] || "";

        const prompt = ModificationCodeChangesPrompt(
          currentContext,
          `IN ${filePath}: ${task.task || ""}`
        );
        log("Coder prompt: ", currentContext);

        const promptSize = prompt.length;
        updateOutput("log", `Coder prompt size: ${promptSize} characters`);

        const newModifications = await generateModifications(
          prompt,
          config?.signal
        );
        modifications += newModifications + "\n\n";

        const blocks = newModifications
          .split(/\bFILE:\s*/i)
          .filter((b) => b.trim().length > 0)
          .filter((block) => {
            const lines = block.split(/\r?\n/);
            return true;
          });

        for (const block of blocks) {
          const lines = block.split(/\r?\n/);
          const blockFilePath = lines[0]
            ?.trim()
            .replace(/\*+$/, "")
            .replace(/^\*+/, "")
            .trim();

          const targetFile = blockFilePath || filePath;

          if (state.mappedContext[targetFile]) {
            const contextLines = state.mappedContext[targetFile]!.split("\n");

            const mapLogicalToPhysical = (
              lines: string[],
              logical: number
            ): number => {
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const singleMatch = line?.match(/^(\d+):/);
                const rangeMatch = line?.match(/^(\d+)\s*-\s*(\d+):/);

                if (singleMatch) {
                  if (parseInt(singleMatch[1]!, 10) === logical) return i + 1; // 1-based index
                }
                if (rangeMatch) {
                  const start = parseInt(rangeMatch[1]!, 10);
                  const end = parseInt(rangeMatch[2]!, 10);
                  if (logical >= start && logical <= end) return i + 1;
                }
              }
              return -1;
            };

            let blockToApply = block;

            // We need to parse the logical range from the block again to map it
            const rangeMatch = block.match(/RANGE:\s*(\d+)\s*TO\s*(\d+)/i);
            if (rangeMatch) {
              const logicalStart = parseInt(rangeMatch[1]!, 10);
              const logicalEnd = parseInt(rangeMatch[2]!, 10);

              const isInsert = block.match(/TYPE:\s*INSERT/i);

              if (isInsert) {
                // For INSERT, we want to insert AFTER the logical range end.
                let physicalEnd = mapLogicalToPhysical(
                  contextLines,
                  logicalEnd
                );
                if (physicalEnd === -1)
                  physicalEnd = mapLogicalToPhysical(
                    contextLines,
                    logicalStart
                  );

                let targetLine = 0;
                if (physicalEnd !== -1) {
                  targetLine = physicalEnd + 1;
                  blockToApply = block.replace(
                    /RANGE:\s*(\d+)\s*TO\s*(\d+)/i,
                    `RANGE: ${targetLine} TO ${targetLine}`
                  );
                  log(
                    `[ContextMap] Mapped INSERT After Logical ${logicalEnd} to Physical ${targetLine}`
                  );
                } else {
                  const codeStartIndex =
                    contextLines.findIndex((l) =>
                      l.trim().startsWith("CODE:")
                    ) + 1;
                  const naiveStart = logicalStart + codeStartIndex;
                  targetLine = naiveStart;
                  blockToApply = block.replace(
                    /RANGE:\s*(\d+)\s*TO\s*(\d+)/i,
                    `RANGE: ${naiveStart} TO ${naiveStart}`
                  );
                  log(
                    `[ContextMap] Logical INSERT target ${logicalStart} not found. Using naive offset ${naiveStart}`
                  );
                }

                // CRITICAL: Strip ORIGINAL block for INSERTs to force "After" placement.
                blockToApply = blockToApply.replace(
                  /ORIGINAL:([\s\S]*?)CODE:/,
                  "ORIGINAL:\nCODE:"
                );
              } else {
                // DELETE / REPLACE Case
                const physicalStart = mapLogicalToPhysical(
                  contextLines,
                  logicalStart
                );

                if (physicalStart !== -1) {
                  let physicalEnd = mapLogicalToPhysical(
                    contextLines,
                    logicalEnd
                  );
                  if (physicalEnd === -1) physicalEnd = physicalStart;

                  blockToApply = block.replace(
                    /RANGE:\s*(\d+)\s*TO\s*(\d+)/i,
                    `RANGE: ${physicalStart} TO ${physicalEnd}`
                  );
                  log(
                    `[ContextMap] Mapped Logical ${logicalStart}-${logicalEnd} to Physical ${physicalStart}-${physicalEnd}`
                  );
                } else {
                  const codeStartIndex =
                    contextLines.findIndex((l) =>
                      l.trim().startsWith("CODE:")
                    ) + 1;
                  const naiveStart = logicalStart + codeStartIndex;
                  const naiveEnd = logicalEnd + codeStartIndex;
                  blockToApply = block.replace(
                    /RANGE:\s*(\d+)\s*TO\s*(\d+)/i,
                    `RANGE: ${naiveStart} TO ${naiveEnd}`
                  );
                  log(
                    `[ContextMap] Logical ${logicalStart} not found. Using naive offset ${naiveStart}`
                  );
                }
              }
            }

            // Apply changes to the context string
            const updatedContent = applyChangesToContent(
              state.mappedContext[targetFile]!,
              [blockToApply],
              targetFile,
              (type, msg) => log(`[ContextUpdate] ${msg}`)
            );

            const reindexAndShift = (text: string) => {
              const lines = text.split("\n");
              let insideCode = false;
              let shiftOffset = 0;
              let lastPrintedNum = 0;

              return lines
                .map((line) => {
                  if (line.trim().startsWith("CODE:")) {
                    insideCode = true;
                    return line;
                  }
                  if (line.trim().startsWith("FILE:")) {
                    insideCode = false;
                    return line;
                  }
                  if (!insideCode) return line;

                  const trimmed = line.trim();
                  if (!trimmed) return line;

                  const rangeMatch = line.match(/^(\d+)\s*-\s*(\d+):/);
                  const singleMatch = line.match(/^(\d+):/);

                  if (rangeMatch) {
                    const start = parseInt(rangeMatch[1]!, 10);
                    const end = parseInt(rangeMatch[2]!, 10);
                    // Apply shift
                    const s = start + shiftOffset;
                    const e = end + shiftOffset;
                    lastPrintedNum = e;
                    return line.replace(/^(\d+)\s*-\s*(\d+):/, `${s} - ${e}:`);
                  } else if (singleMatch) {
                    const num = parseInt(singleMatch[1]!, 10);
                    // Apply shift
                    const newNum = num + shiftOffset;
                    lastPrintedNum = newNum;
                    return line.replace(/^(\d+):/, `${newNum}:`);
                  } else {
                    if (
                      trimmed === "..." ||
                      trimmed === "[EMPTY LINES]" ||
                      line.includes("// ...")
                    ) {
                      return line;
                    }

                    // Inserted line.
                    shiftOffset++;
                    lastPrintedNum++;
                    return `${lastPrintedNum}: ${line}`;
                  }
                })
                .join("\n");
            };

            state.mappedContext[targetFile] = reindexAndShift(updatedContent);
            log(`Updated context for ${targetFile} after task: ${task.task}`);
          }
        }
      }
    } else {
      //state.dependencies - neo4j structure generated call dependencies
      prompt = FastCodeChangesPrompt(state.codeContext, state.query);
      log("Coder prompt: ", prompt);

      const promptSize = prompt.length;
      updateOutput("log", `Coder prompt size: ${promptSize} characters`);

      modifications = await generateModifications(prompt, config?.signal);
    }

    return {
      modifications,
      status: "code_generated",
    };
  };
};
