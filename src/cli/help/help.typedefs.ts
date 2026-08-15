/** One CLI subcommand for `memory --help`'s generated usage text. Each descriptor
 * constant is colocated with its command; `help.constants.ts` collects them into
 * the ordered list `HelpFormatter` renders. */
export type CommandDescriptor = {
  readonly name: string;
  readonly usage: readonly string[];
  readonly summary: string;
  /** Hidden commands are real and dispatchable but omitted from the rendered
   * text — `memory hook <name>` exists only for `settings.json` to invoke. */
  readonly hidden: boolean;
};

export type EnvVarDescriptor = {
  readonly name: string;
  readonly description: string;
};
