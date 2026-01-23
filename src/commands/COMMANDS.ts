import type { CommandDefinition } from "../types/CommandDefinition";

const COMMANDS: CommandDefinition[] = [
  {
    name: "help",
    description: "Show available commands and usage",
    usage: "/help [command]",
  },
  {
    name: "models",
    description: "List available models",
    usage: "/models",
  },
  {
    name: "usage",
    description: "Show usage information",
    usage: "/usage",
  },
  {
    name: "session",
    description: "Manage session",
    usage: "/session <subcommand>",
    subcommands: [
      {
        name: "clear",
        description: "Clear current session",
        usage: "/session clear",
      },
    ],
  },
  {
    name: "model",
    description: "Set active model(s) by role",
    usage: "/model <model-name> [role]",
    subcommands: [
      {
        name: "list",
        description: "Show current model assignments",
        usage: "/model list",
      },
      {
        name: "all",
        description: "Set model for all roles",
        usage: "/model all <model-name>",
      },
      {
        name: "primary",
        description: "Set primary model",
        usage: "/model primary <model-name>",
      },
      {
        name: "secondary",
        description: "Set secondary model",
        usage: "/model secondary <model-name>",
      },
    ],
  },
  {
    name: "openrouter",
    description: "Manage OpenRouter models",
    usage: "/openrouter <subcommand>",
    subcommands: [
      {
        name: "add",
        description: "Add an OpenRouter model",
        usage: "/openrouter add <model-id>",
      },
      {
        name: "auth",
        description: "Set OpenRouter API key",
        usage: "/openrouter auth <api-key>",
      },
    ],
  },
  {
    name: "ollama",
    description: "Manage Ollama models",
    usage: "/ollama <subcommand>",
    subcommands: [],
  },
  {
    name: "groq",
    description: "Manage Groq models",
    usage: "/groq <subcommand>",
    subcommands: [
      {
        name: "add",
        description: "Add a Groq model",
        usage: "/groq add <model-id>",
      },
      {
        name: "auth",
        description: "Set Groq API key",
        usage: "/groq auth <api-key>",
      },
    ],
  },
  {
    name: "mistral",
    description: "Manage Mistral models",
    usage: "/mistral <subcommand>",
    subcommands: [
      {
        name: "auth",
        description: "Set Mistral API key",
        usage: "/mistral auth <api-key>",
      },
    ],
  },
  {
    name: "cerebras",
    description: "Manage Cerebras models",
    usage: "/cerebras <subcommand>",
    subcommands: [
      {
        name: "auth",
        description: "Set Cerebras API key",
        usage: "/cerebras auth <api-key>",
      },
    ],
  },
];

export default COMMANDS;
