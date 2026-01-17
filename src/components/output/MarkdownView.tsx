import Markdown from "@inkkit/ink-markdown";
import Chalk from "chalk";

export default function MarkdownView({ markdown }: { markdown: string }) {
  return (
    <Markdown
      code={Chalk.rgb(255, 105, 180)}
      codespan={Chalk.rgb(255, 105, 180)}
      heading={Chalk.rgb(255, 140, 0)}
    >
      {markdown}
    </Markdown>
  );
}
