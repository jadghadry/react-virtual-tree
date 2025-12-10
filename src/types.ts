export type TreeDefinition = Record<string, TreeItem>;

export type TreeItem = {
  children?: string[];
  data?: Record<string, any>;
  label: string;
  id: number | string;
};
