import { StateGraph, END, START } from "@langchain/langgraph";
import {
  type BaseMessage,
  AIMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { type DynamicStructuredTool } from "@langchain/core/tools";
import { generalModel } from "../../services/llm";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { useFraudeStore } from "../../store/useFraudeStore";

interface RouterState {
  messages: BaseMessage[];
}

// const SYSTEM_PROMPT = `You are a helpful coding assistant.
// Your goal is to help the user with their codebase.
// You have access to tools that can summarize the project or modify it.

// - If the user asks for something about the project and it aligns with a tool's description, use that tool.
// - Otherwise, just respond naturally about the project.
// `;

export const createRouterGraph = (tools: DynamicStructuredTool[]) => {
  const modelWithTools = generalModel.bindTools(tools);

  const toolNode = new ToolNode<RouterState>(tools);

  const classifyIntent = async (state: RouterState) => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage) return "general";

    const response = await generalModel.invoke([
      new SystemMessage(
        "Classify the user query into 'project' if it's about coding, files, or project structure, or 'general' if it's unrelated conversation. Respond with exactly one word: 'project' or 'general'."
      ),
      lastMessage,
    ]);
    const decision = response.content.toString().toLowerCase().trim();
    return decision.includes("project") ? "agent" : "general";
  };

  const callModel = async (state: RouterState, config?: any) => {
    const { messages } = state;
    let fullResponse: any = null;
    const stream = await modelWithTools.stream(messages, {
      signal: config?.signal,
    });

    for await (const chunk of stream) {
      fullResponse = fullResponse ? fullResponse.concat(chunk) : chunk;
      if (
        fullResponse.content &&
        (!chunk.tool_call_chunks || chunk.tool_call_chunks.length === 0)
      ) {
        useFraudeStore
          .getState()
          .updateOutput("markdown", fullResponse.content.toString());
      }
    }
    return { messages: [fullResponse] };
  };

  const callGeneralModel = async (state: RouterState, config?: any) => {
    const { messages } = state;
    let fullResponse: any = null;
    const stream = await generalModel.stream(messages, {
      signal: config?.signal,
    });

    for await (const chunk of stream) {
      fullResponse = fullResponse ? fullResponse.concat(chunk) : chunk;
      if (fullResponse.content) {
        useFraudeStore
          .getState()
          .updateOutput("markdown", fullResponse.content.toString());
      }
    }
    return { messages: [fullResponse] };
  };

  const shouldContinue = (state: RouterState) => {
    const { messages } = state;
    const lastMessage = messages[messages.length - 1];
    if (
      lastMessage instanceof AIMessage &&
      lastMessage.tool_calls &&
      lastMessage.tool_calls.length > 0
    ) {
      return "tools";
    }
    return END;
  };

  const workflow = new StateGraph<RouterState>({
    channels: {
      messages: {
        value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
        default: () => [],
      },
    },
  })
    .addNode("agent", callModel)
    .addNode("general", callGeneralModel)
    .addNode("tools", toolNode)
    .addConditionalEdges(START, classifyIntent, {
      agent: "agent",
      general: "general",
    })
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("tools", "agent") // Loop back to agent after tools to let it summarize/thank
    .addEdge("general", END);

  return workflow.compile();
};
