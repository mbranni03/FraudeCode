import { memo } from "react";
import { type OutputItem } from "@/types/OutputItem";
import ModelList from "./settings/ModelList";
import ContextUsage from "./output/ContextUsage";
import TokenUsage from "./settings/TokenUsage";

export default memo(function SettingsRenderer({ item }: { item: OutputItem }) {
  switch (item.content) {
    case "/models":
      return <ModelList />;
    case "/context":
      return <ContextUsage />;
    case "/usage":
      return <TokenUsage />;
    default:
      return null;
  }
});
