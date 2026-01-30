export interface Command {
  name: string;
  description: string;
  subcommands?: Command[];
  action?: (args: string[]) => Promise<void>;
  usage: string;
  renderedOptions?: string[];
}
