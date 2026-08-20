import { ServeCommand } from "@/app/index.ts";
import {
  DoctorCommand,
  InstallCommand,
  UninstallCommand,
} from "@/modules/installation/index.ts";
import { ReindexCommand, SearchCommand } from "@/modules/memory/index.ts";
import {
  InjectMemoryHookResolver,
  SessionStartHookResolver,
} from "@/modules/memory/index.ts";
import { NotesCommand } from "@/modules/memory/index.ts";
import { HelpCommand, VersionCommand } from "@/modules/meta/index.ts";
import {
  CompactCheckpointHookResolver,
  CommitCommand,
  WorklogFloorHookResolver,
  WrapGateHookResolver,
} from "@/modules/worklog/index.ts";
import {
  ResolveCommand,
  WorkspaceAddCommand,
  WorkspaceLsCommand,
  WorkspaceRmCommand,
} from "@/modules/workspace/index.ts";

/** The explicit command registry — every command class, never self-registered. */
export const commands = [
  WorkspaceAddCommand,
  WorkspaceRmCommand,
  WorkspaceLsCommand,
  ResolveCommand,
  ReindexCommand,
  SearchCommand,
  NotesCommand,
  CommitCommand,
  DoctorCommand,
  InstallCommand,
  UninstallCommand,
  ServeCommand,
  HelpCommand,
  VersionCommand,
];

/** The explicit hook registry — every hook resolver class. */
export const hooks = [
  SessionStartHookResolver,
  InjectMemoryHookResolver,
  WrapGateHookResolver,
  CompactCheckpointHookResolver,
  WorklogFloorHookResolver,
];
