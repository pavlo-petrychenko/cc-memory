export type StateTemplateInput = {
  readonly workspace: string;
  readonly slug: string;
  readonly date: string;
};

export type EntryTemplateInput = {
  readonly time: string;
  readonly topic: string;
  readonly changes: string;
  readonly learned: string;
  readonly decided: string;
  readonly open: string;
  readonly refs: string;
};
