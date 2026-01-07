const streamRequest = async () => {
  let response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "xiaomi/mimo-v2-flash:free",
      messages: [
        {
          role: "user",
          content:
            "Solve this step by step: If a train travels 60 mph for 2.5 hours, how far does it go?",
        },
      ],
      stream: true,
      streamOptions: {
        includeUsage: true,
      },
    }),
  });

  return response;
};

// BASIC STREAM DATA (content in choices.delta.content)
// {
//   id: "gen-1767749212-rWGzE4xOCNCOxSM3OxFt",
//   provider: "Xiaomi",
//   model: "xiaomi/mimo-v2-flash:free",
//   object: "chat.completion.chunk",
//   created: 1767749212,
//   choices: [
//     {
//       index: 0,
//       delta: {
//         role: "assistant",
//         content: ", the train",
//         reasoning: null,
//         reasoning_details: [],
//       },
//       finish_reason: null,
//       native_finish_reason: null,
//       logprobs: null,
//     },
//   ],
// }

const basicStream = async () => {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Append new chunk to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines from buffer
      while (true) {
        const lineEnd = buffer.indexOf("\n");
        if (lineEnd === -1) break;

        const line = buffer.slice(0, lineEnd).trim();
        buffer = buffer.slice(lineEnd + 1);

        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0].delta.content;
            if (content) {
              console.log(content);
            }
          } catch (e) {
            // Ignore invalid JSON
          }
        }
      }
    }
  } finally {
    reader.cancel();
  }
};

// Might not be any chance to use
// const reasoningStream = async () => {
//   const reader = response.body?.getReader();
//   const decoder = new TextDecoder();
//   while (true) {
//     const { done, value } = await reader.read();
//     if (done) break;
//     const chunk = decoder.decode(value);
//     const lines = chunk.split("\n");
//     for (const line of lines) {
//       if (line.startsWith("data: ")) {
//         const data = line.slice(6);
//         if (data === "[DONE]") break;
//         try {
//           const parsed = JSON.parse(data);
//           if (parsed.type === "response.reasoning.delta") {
//             console.log("Reasoning:", parsed.delta);
//           }
//         } catch (e) {
//           // Skip invalid JSON
//         }
//       }
//     }
//   }
// };
