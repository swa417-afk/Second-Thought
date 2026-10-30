import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { detectDeterministic } from "./nmm-pressure-detectors.mjs";

const suite = JSON.parse(fs.readFileSync("tests/pressure/nmm-pressure-suite.v1.json", "utf8"));
const byId = new Map(suite.cases.map((item) => [item.id, item]));

function segments(input) {
  return input
    .split(/(?<=[.!?])\s+|;\s+/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, index) => ({ id: `E${index + 1}`, text }));
}

describe("deterministic NMM detectors", () => {
  for (const id of ["PT-01", "PT-02", "PT-03", "PT-04", "PT-05", "PT-06", "PT-18"]) {
    it(`${id} detects an expected trigger without case-id input`, () => {
      const item = byId.get(id);
      const found = detectDeterministic(
        item.prompt,
        "recorded first judgment",
        segments(item.prompt),
      );
      assert.ok(found, `${id} returned no deterministic detector event`);
      assert.ok(
        item.expected_trigger.includes(found.trigger),
        `${id}: unexpected trigger ${found.trigger}`,
      );
      assert.ok(found.evidence_ids.length > 0, `${id}: no bounded evidence IDs`);
    });
  }
});