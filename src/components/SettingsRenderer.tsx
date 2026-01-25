import { memo } from "react";
import { type OutputItem } from "@/types/OutputItem";
import ModelList from "./settings/ModelList";
import ContextUsage from "./output/ContextUsage";
import TokenUsage from "./settings/TokenUsage";

export default memo(function SettingsRenderer({ item }: { item: OutputItem }) {
  const content = item.content;

  if (content.startsWith("/models")) {
    const provider = content.split(":")[1];
    return <ModelList providerFilter={provider} showAll={!!provider} />;
  }

  switch (content) {
    case "/context":
      return <ContextUsage />;
    case "/usage":
      return <TokenUsage />;
    default:
      return null;
  }
});
