import Markdown from "@inkkit/ink-markdown";

export default function MarkdownView({ markdown }: { markdown: string }) {
  return <Markdown>{markdown}</Markdown>;
}
