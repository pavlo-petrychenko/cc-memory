import { expect, test } from "bun:test";

import { CC_MEMORY_VERSION } from "@/version.ts";

import packageManifest from "../package.json" with { type: "json" };

test("the reported version matches package.json", () => {
  expect(CC_MEMORY_VERSION).toBe(packageManifest.version);
});
