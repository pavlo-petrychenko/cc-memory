import { expect, test } from "bun:test";

import packageManifest from "../package.json" with { type: "json" };
import { CC_MEMORY_VERSION } from "./version.ts";

test("the reported version matches package.json", () => {
  expect(CC_MEMORY_VERSION).toBe(packageManifest.version);
});
