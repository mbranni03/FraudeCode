import { memo } from "react";
import { type OutputItem } from "@/types/OutputItem";
import ModelList from "./settings/ModelList";

export default memo(function SettingsRenderer({ item }: { item: OutputItem }) {
  switch (item.content) {
    case "/models":
      return <ModelList />;
    default:
      return null;
  }
});
