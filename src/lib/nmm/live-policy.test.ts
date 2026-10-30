import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideAcquisition } from "./live-policy.ts";

const base = {
  ccg: 0.1,
  retrievableCount: 2,
  modelChoice: "crane" as const,
  unseenCitations: false,
};

describe("NMM observable acquisition gate", () => {
  it("acquires when measured CCG exceeds threshold", () => {
    assert.equal(decideAcquisition({ ...base, ccg: 0.531 }), "acquire");
  });
  it("investigates model abstention even with low CCG", () => {
    assert.equal(decideAcquisition({ ...base, modelChoice: "abstain" }), "acquire");
  });
  it("challenges a model citing evidence it could not see", () => {
    assert.equal(decideAcquisition({ ...base, unseenCitations: true }), "acquire");
  });
  it("halts rather than fabricates a readable model answer", () => {
    assert.equal(decideAcquisition({ ...base, modelChoice: "unreadable", ccg: 0.9 }), "halt");
  });
  it("halts when no external observations remain", () => {
    assert.equal(decideAcquisition({ ...base, retrievableCount: 0, ccg: 0.9 }), "halt");
  });
  it("does not acquire when the current evidence signals do not warrant it", () => {
    assert.equal(decideAcquisition(base), "halt");
  });
});