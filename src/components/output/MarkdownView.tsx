import Markdown from "@inkkit/ink-markdown";
import Chalk from "chalk";
import { THEME } from "@/theme";

export default function MarkdownView({ markdown }: { markdown: string }) {
  return (
    <Markdown
      code={Chalk.white}
      codespan={Chalk.white}
      heading={Chalk.hex(THEME.primary)}
    >
      {markdown}
    </Markdown>
  );
}
