import type { AbsPath } from "../../../src/domain/AbsPath.ts";
import type { Git } from "../../../src/ports/git.port.ts";

/** One recorded `Git` call, for assertions in services/hooks tests that don't
 * care about the underlying `Proc` invocation, only "did we call `git add`". */
export type RecordedGitCall = {
  readonly method: string;
  readonly cwd: AbsPath;
};

export type GitFake = Git & {
  readonly calls: readonly RecordedGitCall[];
  readonly setStatusPorcelain: (value: string) => void;
  readonly setRevParse: (value: string) => void;
  readonly setShowToplevel: (value: string) => void;
  readonly setDiffStat: (value: string) => void;
  readonly setLogOneline: (value: string) => void;
  readonly setAddResult: (value: boolean) => void;
  readonly setCommitResult: (value: boolean) => void;
};

/**
 * A `Git` with a fixed, settable return value per method — for services/hooks
 * tests (P4/P7/P8) that want to script "the tree is dirty" or "there is no
 * git repo here" without going through `procFake.fake.ts`'s argv-level detail.
 * `gitCli.adapter.test.ts` itself tests the real adapter over `procFake`, not
 * this fake.
 */
export function makeGitFake(): GitFake {
  const calls: RecordedGitCall[] = [];
  let statusPorcelainValue = "";
  let revParseValue = "";
  let showToplevelValue = "";
  let diffStatValue = "";
  let logOnelineValue = "";
  let addResult = true;
  let commitResult = true;

  const record = (method: string, cwd: AbsPath): void => {
    calls.push({ method, cwd });
  };

  return {
    calls,
    setStatusPorcelain: (value: string) => {
      statusPorcelainValue = value;
    },
    setRevParse: (value: string) => {
      revParseValue = value;
    },
    setShowToplevel: (value: string) => {
      showToplevelValue = value;
    },
    setDiffStat: (value: string) => {
      diffStatValue = value;
    },
    setLogOneline: (value: string) => {
      logOnelineValue = value;
    },
    setAddResult: (value: boolean) => {
      addResult = value;
    },
    setCommitResult: (value: boolean) => {
      commitResult = value;
    },
    statusPorcelain: (cwd: AbsPath) => {
      record("statusPorcelain", cwd);
      return Promise.resolve(statusPorcelainValue);
    },
    revParse: (cwd: AbsPath) => {
      record("revParse", cwd);
      return Promise.resolve(revParseValue);
    },
    showToplevel: (cwd: AbsPath) => {
      record("showToplevel", cwd);
      return Promise.resolve(showToplevelValue);
    },
    diffStat: (cwd: AbsPath) => {
      record("diffStat", cwd);
      return Promise.resolve(diffStatValue);
    },
    logOneline: (cwd: AbsPath) => {
      record("logOneline", cwd);
      return Promise.resolve(logOnelineValue);
    },
    add: (cwd: AbsPath) => {
      record("add", cwd);
      return Promise.resolve(addResult);
    },
    commit: (cwd: AbsPath) => {
      record("commit", cwd);
      return Promise.resolve(commitResult);
    },
  };
}
