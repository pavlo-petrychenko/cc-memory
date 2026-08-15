import { expect, test } from "bun:test";

import type { WrapStateEntry, WrapStateMap } from "@/modules/session/session.entity.ts";

test("a WrapStateMap keys wrap-state entries by session id", () => {
  const entry: WrapStateEntry = { sig: "abc123:3", ts: 1_700_000_000_000, nudges: 2 };
  const map: WrapStateMap = { sess1: entry };

  expect(map["sess1"]).toEqual(entry);
  expect(map["sess1"]?.nudges).toBe(2);
});
