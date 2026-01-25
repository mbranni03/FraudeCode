import { Box, Text } from "ink";
import React from "react";
import { type DiffPatch } from "@/agent/pendingChanges";
import { THEME } from "@/theme";

interface DiffViewProps {
  diff?: string;
  patches?: DiffPatch[];
}

export default function DiffView({ diff, patches }: DiffViewProps) {
  if (patches && patches.length > 0) {
    return (
      <Box flexDirection="column" paddingY={1}>
        {patches.map((patch, pIndex) => (
          <Box key={pIndex} flexDirection="column" marginBottom={1}>
            {patch.hunks.map((hunk, hIndex) => {
              let oldLn = hunk.oldStart;
              let newLn = hunk.newStart;

              return (
                <Box key={hIndex} flexDirection="column">
                  {/* Visual separator for hunks/chunks */}
                  {(pIndex > 0 || hIndex > 0) && (
                    <Box
                      borderStyle="single"
                      borderTop={false}
                      borderLeft={false}
                      borderRight={false}
                      borderColor={THEME.border}
                      marginY={0}
                    />
                  )}
                  {/* Hunk Header */}
                  <Box>
                    <Text color={THEME.primary}>
                      ┌─ {hunk.oldStart},{hunk.oldLines} → {hunk.newStart},
                      {hunk.newLines}
                    </Text>
                  </Box>

                  {hunk.lines.map((line, lIndex) => {
                    let type: "add" | "remove" | "context" = "context";
                    if (line.startsWith("-")) type = "remove";
                    else if (line.startsWith("+")) type = "add";

                    const content = line.substring(1);
                    let displayNum = "";
                    let color = THEME.text;

                    if (type === "remove") {
                      displayNum = oldLn.toString();
                      oldLn++;
                      color = THEME.error;
                    } else if (type === "add") {
                      displayNum = newLn.toString();
                      newLn++;
                      color = THEME.success;
                    } else {
                      displayNum = newLn.toString();
                      oldLn++;
                      newLn++;
                    }

                    return (
                      <Box key={lIndex}>
                        <Box
                          width={4}
                          marginRight={1}
                          justifyContent="flex-end"
                        >
                          <Text color={THEME.dim}>{displayNum}</Text>
                        </Box>
                        <Box>
                          <Text bold={type !== "context"} color={color}>
                            {content}
                          </Text>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
    );
  }

  if (diff) {
    /*
     * Filter out the header lines:
     * --- @/sample/utils.py	Original
     * +++ @/sample/utils.py	Modified
     */
    const rawLines = diff
      .split("\n")
      .filter((line) => !line.startsWith("--- ") && !line.startsWith("+++ "));

    let oldLn = 0;
    let newLn = 0;

    const parsedLines = rawLines.reduce<
      {
        type: "add" | "remove" | "context" | "chunk" | "other";
        content: string;
        lineNumber?: number; // focusing on new line number for simplicity or context
        oldLineNumber?: number;
      }[]
    >((acc, line) => {
      if (line.startsWith("@@")) {
        const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          oldLn = parseInt(match[1] || "0", 10);
          newLn = parseInt(match[2] || "0", 10);
        }
        if (acc.length > 0) {
          acc.push({ type: "chunk", content: "..." });
        }
        return acc;
      }

      if (line.startsWith("-")) {
        acc.push({
          type: "remove",
          content: line.substring(1),
          oldLineNumber: oldLn,
        });
        oldLn++;
      } else if (line.startsWith("+")) {
        acc.push({
          type: "add",
          content: line.substring(1),
          lineNumber: newLn,
        });
        newLn++;
      } else if (line.startsWith(" ")) {
        acc.push({
          type: "context",
          content: line.substring(1),
          oldLineNumber: oldLn,
          lineNumber: newLn,
        });
        oldLn++;
        newLn++;
      } else {
        acc.push({ type: "other", content: line });
      }
      return acc;
    }, []);

    return (
      <Box flexDirection="column" paddingY={1}>
        {parsedLines.map((item, index) => {
          if (item.type === "chunk") {
            return (
              <Box
                key={index}
                borderStyle="single"
                borderTop={false}
                borderLeft={false}
                borderRight={false}
                borderColor={THEME.border}
                marginY={0}
              >
                {/* Visual separator for chunks */}
              </Box>
            );
          }

          const lineNum = item.lineNumber ? item.lineNumber.toString() : "";
          const oldLineNum = item.oldLineNumber
            ? item.oldLineNumber.toString()
            : "";

          // Determine color
          let color = THEME.text;
          if (item.type === "add") color = THEME.success;
          if (item.type === "remove") color = THEME.error;

          const displayNum = item.type === "remove" ? oldLineNum : lineNum;

          return (
            <Box key={index}>
              <Box width={4} marginRight={1} justifyContent="flex-end">
                <Text color={THEME.dim}>{displayNum}</Text>
              </Box>
              <Box>
                <Text bold={item.type !== "context"} color={color}>
                  {item.content}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>
    );
  }

  return null;
}
