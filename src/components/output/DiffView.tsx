import { Box, Text } from "ink";
import React from "react";

interface DiffViewProps {
  diff: string;
}

export default function DiffView({ diff }: DiffViewProps) {
  const lines = diff.split("\n");

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      padding={1}
    >
      {lines.map((line, index) => {
        if (line.startsWith("+")) {
          return (
            <Text key={index} color="green">
              {line}
            </Text>
          );
        }
        if (line.startsWith("-")) {
          return (
            <Text key={index} color="red">
              {line}
            </Text>
          );
        }
        if (line.startsWith("@@")) {
          return (
            <Text key={index} color="cyan">
              {line}
            </Text>
          );
        }
        return (
          <Text key={index} color="white">
            {line}
          </Text>
        );
      })}
    </Box>
  );
}
