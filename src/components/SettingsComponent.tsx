import OllamaModelSettings from "./settings/OllamaModelSettings";

const SettingsComponent = ({ query }: { query: string }) => {
  switch (query) {
    case "/ollama":
      return <OllamaModelSettings />;
    default:
      return null;
  }
};

export default SettingsComponent;
