import type { ChatOpenAI } from "@langchain/openai";
import type { Tool } from "langchain";

interface AgentOptions {
  tools?: Tool[];
  temperature?: number;
}

export default class Agent {
  model: ChatOpenAI;

  constructor(model: ChatOpenAI, options?: AgentOptions) {
    this.model = model;
  }
}
