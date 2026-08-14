import { describe, expect, test } from "bun:test";

import type { AbsPath } from "../../../src/core/AbsPath.ts";
import {
  currentUid,
  defaultLaunchAgentsDir,
  defaultPlistPath,
  defaultPlistTemplatePath,
  defaultReflectorLogPath,
  installLaunchd,
  isLaunchdLoaded,
  launchdPathEnv,
  renderPlist,
  uninstallLaunchd,
} from "../../../src/install/launchd.service.ts";
import { makeFsMemoryFake } from "../../helpers/fakes/fsMemory.fake.ts";
import { makeProcFake } from "../../helpers/fakes/procFake.fake.ts";

// SAFETY: fixed test fixtures, never a real filesystem lookup — matches
// `tests/helpers/container.ts`'s `DEFAULT_HOME`.
const HOME = "/home/test" as AbsPath;
// SAFETY: same reasoning as `HOME` above.
const REPO_ROOT = "/repo" as AbsPath;

const TEMPLATE =
  "<plist><string>@BUN@</string><string>@DIST@</string>" +
  "<string>@PATH@</string><string>@LOG@</string></plist>";

const VALUES = {
  bunPath: "/usr/local/bin/bun",
  distPath: "/repo/dist/memory.js",
  pathEnv: "/home/test/.local/bin:/usr/bin",
  logPath: "/home/test/.claude/memory/reflector.log",
};

// SAFETY: fixed expected-value literals for `toBe` assertions below, never
// real paths — same reasoning as `HOME`/`REPO_ROOT` above.
const EXPECTED_LAUNCH_AGENTS_DIR = "/home/test/Library/LaunchAgents" as AbsPath;
// SAFETY: same reasoning as `EXPECTED_LAUNCH_AGENTS_DIR` above.
const EXPECTED_PLIST_PATH =
  "/home/test/Library/LaunchAgents/dev.ccmemory.reflector.plist" as AbsPath;
// SAFETY: same reasoning as `EXPECTED_LAUNCH_AGENTS_DIR` above.
const EXPECTED_REFLECTOR_LOG_PATH = "/home/test/.claude/memory/reflector.log" as AbsPath;
// SAFETY: same reasoning as `EXPECTED_LAUNCH_AGENTS_DIR` above.
const EXPECTED_PLIST_TEMPLATE_PATH =
  "/repo/runners/dev.ccmemory.reflector.bun.plist" as AbsPath;

describe("install/launchd.ts — path helpers", () => {
  test("defaultLaunchAgentsDir/defaultPlistPath/defaultReflectorLogPath are all ~-relative", () => {
    expect(defaultLaunchAgentsDir(HOME)).toBe(EXPECTED_LAUNCH_AGENTS_DIR);
    expect(defaultPlistPath(HOME)).toBe(EXPECTED_PLIST_PATH);
    expect(defaultReflectorLogPath(HOME)).toBe(EXPECTED_REFLECTOR_LOG_PATH);
  });

  test("launchdPathEnv puts ~/.local/bin first, then the common git/homebrew locations", () => {
    expect(launchdPathEnv(HOME)).toBe(
      "/home/test/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    );
  });

  test("renderPlist substitutes all four placeholders", () => {
    expect(renderPlist(TEMPLATE, VALUES)).toBe(
      "<plist><string>/usr/local/bin/bun</string><string>/repo/dist/memory.js</string>" +
        "<string>/home/test/.local/bin:/usr/bin</string>" +
        "<string>/home/test/.claude/memory/reflector.log</string></plist>",
    );
  });

  test("defaultPlistTemplatePath is <repoRoot>/runners/<label>.bun.plist", () => {
    expect(defaultPlistTemplatePath(REPO_ROOT)).toBe(EXPECTED_PLIST_TEMPLATE_PATH);
  });
});

describe("install/launchd.ts — currentUid / isLaunchdLoaded", () => {
  test("currentUid trims the shelled-out 'id -u' output", async () => {
    const proc = makeProcFake();
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "501\n", stderr: "", exitCode: 0 },
    });
    expect(await currentUid(proc)).toBe("501");
  });

  test("isLaunchdLoaded is true iff 'launchctl print' exits 0", async () => {
    const proc = makeProcFake();
    proc.enqueue({ kind: "resolve", result: { stdout: "501", stderr: "", exitCode: 0 } }); // id -u
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 0 } }); // print
    expect(await isLaunchdLoaded(proc)).toBe(true);
  });

  test("isLaunchdLoaded is false when the job isn't loaded", async () => {
    const proc = makeProcFake();
    proc.enqueue({ kind: "resolve", result: { stdout: "501", stderr: "", exitCode: 0 } });
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "", stderr: "not found", exitCode: 1 },
    });
    expect(await isLaunchdLoaded(proc)).toBe(false);
  });
});

describe("install/launchd.ts — installLaunchd", () => {
  test("returns null and touches nothing when the template file is missing", async () => {
    const fs = makeFsMemoryFake();
    const proc = makeProcFake();

    const outcome = await installLaunchd(fs, proc, REPO_ROOT, HOME, VALUES);

    expect(outcome).toBeNull();
    expect(proc.calls).toHaveLength(0);
  });

  test("renders the plist, writes it, then bootout-then-bootstrap (idempotent order)", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(defaultPlistTemplatePath(REPO_ROOT), TEMPLATE);
    const proc = makeProcFake();
    proc.enqueue({ kind: "resolve", result: { stdout: "501", stderr: "", exitCode: 0 } }); // id -u
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 0 } }); // bootout
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 0 } }); // bootstrap

    const outcome = await installLaunchd(fs, proc, REPO_ROOT, HOME, VALUES);

    expect(outcome?.loaded).toBe(true);
    expect(outcome?.actionLine).toContain("launchd agent loaded ->");
    const written = await fs.readFile(defaultPlistPath(HOME));
    expect(written).toContain(VALUES.bunPath);
    expect(proc.calls.map((call) => call.command)).toEqual([
      "id",
      "launchctl",
      "launchctl",
    ]);
    expect(proc.calls[1]).toMatchObject({
      args: ["bootout", "gui/501/dev.ccmemory.reflector"],
    });
    expect(proc.calls[2]).toMatchObject({
      args: ["bootstrap", "gui/501", defaultPlistPath(HOME)],
    });
  });

  test("reports 'installed (load manually)' when bootstrap fails, without throwing", async () => {
    const fs = makeFsMemoryFake();
    fs.seedFile(defaultPlistTemplatePath(REPO_ROOT), TEMPLATE);
    const proc = makeProcFake();
    proc.enqueue({ kind: "resolve", result: { stdout: "501", stderr: "", exitCode: 0 } });
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 0 } });
    proc.enqueue({
      kind: "resolve",
      result: { stdout: "", stderr: "denied", exitCode: 1 },
    });

    const outcome = await installLaunchd(fs, proc, REPO_ROOT, HOME, VALUES);

    expect(outcome?.loaded).toBe(false);
    expect(outcome?.actionLine).toContain("installed (load manually)");
  });
});

describe("install/launchd.ts — uninstallLaunchd", () => {
  test("bootout then removes the plist file", async () => {
    const fs = makeFsMemoryFake();
    const plistPath = defaultPlistPath(HOME);
    fs.seedFile(plistPath, "<plist/>");
    const proc = makeProcFake();
    proc.enqueue({ kind: "resolve", result: { stdout: "501", stderr: "", exitCode: 0 } });
    proc.enqueue({ kind: "resolve", result: { stdout: "", stderr: "", exitCode: 0 } });

    await uninstallLaunchd(fs, proc, plistPath);

    expect(proc.calls[1]).toMatchObject({
      command: "launchctl",
      args: ["bootout", "gui/501/dev.ccmemory.reflector"],
    });
    expect(await fs.exists(plistPath)).toBe(false);
  });
});
