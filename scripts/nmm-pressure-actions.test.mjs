import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { executeDeterministicAction } from "./nmm-pressure-actions.mjs";

const suite = JSON.parse(fs.readFileSync("tests/pressure/nmm-pressure-suite.v1.json", "utf8"));
const byId = new Map(suite.cases.map((item) => [item.id, item]));

describe("deterministic NMM control actions", () => {
  for (const id of ["PT-01", "PT-02", "PT-03", "PT-04", "PT-05", "PT-06", "PT-18"]) {
    it(`${id} executes its typed action without ground-truth input`, () => {
      const item = byId.get(id);
      const result = executeDeterministicAction(item.required_action, item.prompt);
      assert.ok(result, `${id} action returned no deterministic result`);
      assert.ok(result.answer);
      assert.ok(result.executor);
      assert.ok(Array.isArray(result.verification));
    });
  }
});