import type { Command } from "../types/CommandDefinition";
import modelCommands from "./model";
import openRouterCommands from "./openrouter";
import cerebrasCommands from "./cerebras";
import groqCommands from "./groq";
import googleCommands from "./google";
import mistralCommands from "./mistral";
import modelsCommands from "./models";
import sessionCommands from "./session";
import usageCommand from "./usage";

const COMMANDS: Command[] = [
  usageCommand,
  sessionCommands,
  modelCommands, //starts with model
  modelsCommands, //starts with models
  openRouterCommands,
  cerebrasCommands,
  groqCommands,
  googleCommands,
  mistralCommands,
];

export default COMMANDS;
