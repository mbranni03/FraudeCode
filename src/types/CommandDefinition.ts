export interface Command {
  name: string;
  description: string;
  subcommands?: Command[];
  action?: (args: string[]) => void;
  usage: string;
  renderedOptions?: string[];
}
