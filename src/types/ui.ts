export type SelectItem = {
  label: string;
  value: any;
};

export interface PromptInfo {
  query: string;
  options?: SelectItem[];
  selectedOption?: any;
}
