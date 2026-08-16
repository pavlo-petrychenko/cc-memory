import {
  COMMAND_SUMMARY_SEPARATOR,
  ENV_NAME_COLUMN_PADDING,
  ENV_SECTION_HEADING,
  LINE_INDENT,
  USAGE_SECTION_HEADING,
} from "@/cli/commands/help/help.constants.ts";
import type {
  CommandDescriptor,
  EnvVarDescriptor,
} from "@/cli/commands/help/help.typedefs.ts";

const EMPTY_SUMMARY = "";

/** Renders `memory --help`'s usage text from the command surface's own
 * descriptors, rather than a hand-maintained block of prose. */
export class HelpFormatter {
  render(
    header: string,
    commandDescriptors: readonly CommandDescriptor[],
    envVarDescriptors: readonly EnvVarDescriptor[],
  ): string {
    const visibleCommandLines = commandDescriptors
      .filter((descriptor) => !descriptor.hidden)
      .map((descriptor) => this.renderCommandLine(descriptor));

    return [
      header,
      "",
      USAGE_SECTION_HEADING,
      ...visibleCommandLines,
      "",
      ENV_SECTION_HEADING,
      ...this.renderEnvLines(envVarDescriptors),
      "",
    ].join("\n");
  }

  private renderCommandLine(descriptor: CommandDescriptor): string {
    const invocation = `memory ${descriptor.usage.join(" | ")}`;
    if (descriptor.summary === EMPTY_SUMMARY) return `${LINE_INDENT}${invocation}`;
    return `${LINE_INDENT}${invocation}${COMMAND_SUMMARY_SEPARATOR}${descriptor.summary}`;
  }

  private renderEnvLines(
    envVarDescriptors: readonly EnvVarDescriptor[],
  ): readonly string[] {
    const nameColumnWidth =
      Math.max(0, ...envVarDescriptors.map((descriptor) => descriptor.name.length)) +
      ENV_NAME_COLUMN_PADDING;
    return envVarDescriptors.map(
      (descriptor) =>
        `${LINE_INDENT}${descriptor.name.padEnd(nameColumnWidth)}${descriptor.description}`,
    );
  }
}
