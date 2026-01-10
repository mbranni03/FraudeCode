import { Settings } from "./src/utils/Settings";
import { useSettingsStore } from "./src/store/settingsStore";
import { llm } from "./src/core/llm";
import { mkdir } from "fs/promises";
import {
  tool,
  createAgent,
  summarizationMiddleware,
  ReactAgent,
} from "langchain";
import { z } from "zod";

const allModels = [
  "xiaomi/mimo-v2-flash:free", // 0
  "openai/gpt-oss-120b", // 1
  "moonshotai/kimi-k2-instruct-0905", // 2
  "llama3.1:latest", // 3
  "mistral:latest", // 4
  "phi4:latest", // 5
  "qwen2.5-coder:7b", // 6
  "qwen3:8b", // 7
];

const systemBasePrompt = `
You are a programming instructor. Your job is to design lessons for a student to learn the programming language Rust. Use the available tools to complete the user's request.

AVAILABLE TOOLS:
- **writeFile**: Write a file to the learning directory.
- **viewLessonHistory**: View the lesson history. Use this to understand what the student has already learned and determine what lesson to create next.
`;

const introPrompt = `
Create a markdown file called INTRODUCTION.md in the learning directory.

Start the file introducing the language and common uses, as well as any notable features that differentiate it.

Next, provide detailed instructions to make sure the user has everything they need to setup their local environment to execute code and start learning.
`;

const generateLessonPrompt = `
Your job is to design and setup a lesson for the student.

Examine the lesson history to understand what the student has already learned and determine what lesson to create next.

If the student has not started learning, create a Hello World lesson to introduce them to the language.
  
Your Lesson should have the following:
<LESSON>
- A title for the lesson
- Topics to be covered in the lesson
- Provide instruction on what the concepts are and how they can be used. i.e. print in python is used to print text to the console
- A task for the student to complete to demonstrate their understanding of the lesson
- Keep the lesson short and simple, but explain everything clearly
- Create a file called LESSON_{title}.md in the learning directory
</LESSON>

<SETUP>
- Create any files in the learning directory needed for the student to complete the task.
- Make sure not to complete the task.
- Add the skeleton for the function that the user should modify.
- Add comments to the skeleton to explain what the function should do.
</SETUP>
`;

async function initLearning() {
  await mkdir("./learning", { recursive: true });
  await mkdir("./learning/.fraudecode", { recursive: true });
  Bun.write(
    "./learning/.fraudecode/learning.json",
    JSON.stringify({ lang: "rust", lessons: [] })
  );
}

async function main() {
  await Settings.init();
  useSettingsStore.getState().syncWithSettings();
  await initLearning();
  let modelName = allModels[1];
  if (!modelName) return;
  const model = llm.getClient(modelName);
  const agent = createAgent({
    model,
    tools: [writeFile, viewLessonHistory],
    middleware: [
      summarizationMiddleware({
        model,
        trigger: { fraction: 0.5 },
        keep: { fraction: 0.3 },
      }),
    ],
  });
  // await useAgent(agent, introPrompt);
  await useAgent(agent, generateLessonPrompt);
}

const useAgent = async (agent: ReactAgent, query: string) => {
  const startTime = Date.now();
  const response = await agent.invoke({
    messages: [
      { role: "system", content: systemBasePrompt },
      { role: "user", content: query },
    ],
  });
  const endTime = Date.now();
  console.log(response);
  console.log(`Time taken: ${(endTime - startTime) / 1000}s`);
};

const writeFile = tool(
  ({ fileName, content }) => {
    Bun.write(`./learning/${fileName}`, content);
    return `File ${fileName} created successfully.`;
  },
  {
    name: "writeFile",
    description: "Write a file",
    schema: z.object({
      fileName: z
        .string()
        .describe("File name to write to in the learning directory"),
      content: z
        .string()
        .describe(
          "The full content of the file. content must be a properly escaped JSON string, especially newlines and quotes."
        ),
    }),
  }
);

const viewLessonHistory = tool(
  async () => {
    const learningFile = Bun.file("./learning/.fraudecode/learning.json");
    if (!(await learningFile.exists())) return "No learning history found.";
    const data = await learningFile.json();
    return JSON.stringify(data.lessons);
  },
  {
    name: "viewLessonHistory",
    description:
      "View the lesson history. Used to understand what the student has already learned.",
    schema: z.object({}),
  }
);

main();
