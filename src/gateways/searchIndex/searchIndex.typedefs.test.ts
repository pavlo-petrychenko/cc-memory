import { expect, test } from "bun:test";

import { Collection } from "@/gateways/searchIndex/searchIndex.typedefs.ts";

test("Collection names the two indexed corpora", () => {
  expect(String(Collection.Notes)).toBe("notes");
  expect(String(Collection.Worklog)).toBe("worklog");
});
