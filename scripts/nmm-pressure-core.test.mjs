import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  actionForTrigger,
  conclusionKey,
  judgmentDelta,
  judgmentDeltaForCase,
  mechanismVerdict,
  parseArgs,
  scoreAnswer,
  semanticCorrect,
} from "./nmm-pressure-core.mjs";

describe("pressure runner argument parsing", () => {
  it("defaults to the seven showcase cases", () => {
    const args = parseArgs([]);
    assert.deepEqual(args.caseIds, ["PT-01", "PT-02", "PT-03", "PT-04", "PT-05", "PT-06", "PT-18"]);
    assert.equal(args.live, false);
  });
  it("accepts explicit cases and arms", () => {
    const args = parseArgs(["--live", "--cases=PT-01,PT-18", "--arms", "C0,N1"]);
    assert.equal(args.live, true);
    assert.deepEqual(args.caseIds, ["PT-01", "PT-18"]);
    assert.deepEqual(args.arms, ["C0", "N1"]);
  });
});

describe("detector policy", () => {
  it("maps typed triggers to explicit actions", () => {
    assert.equal(actionForTrigger("unit_inconsistency"), "RECOMPUTE_WITH_UNITS");
    assert.equal(actionForTrigger("premise_contradiction"), "ABSTAIN_OR_CLARIFY");
    assert.equal(actionForTrigger("evidence_quality_issue"), "VERIFY_SOURCE");
    assert.equal(actionForTrigger("not_a_trigger"), "ANSWER_DIRECT");
  });
});

describe("deterministic showcase scorers", () => {
  it("scores PT-01 through PT-06 and PT-18", () => {
    assert.equal(scoreAnswer("PT-01", "5000 µL"), true);
    assert.equal(scoreAnswer("PT-02", "B, C, A"), true);
    assert.equal(scoreAnswer("PT-03", "Mara Chen"), true);
    assert.equal(scoreAnswer("PT-04", "No. The anomaly began before the throttle."), true);
    assert.equal(scoreAnswer("PT-05", "No, the clearance was revoked."), true);
    assert.equal(scoreAnswer("PT-06", "The premises are inconsistent."), true);
    assert.equal(scoreAnswer("PT-18", "Yes. Route B remains the shortest."), true);
  });
});

describe("semantic outcome layer", () => {
  it("separates semantic correctness from strict frozen task pass", () => {
    assert.equal(scoreAnswer("PT-01", "5.0 mL"), false);
    assert.equal(semanticCorrect("PT-01", "5.0 mL"), true);
    assert.equal(scoreAnswer("PT-18", "Yes"), false);
    assert.equal(semanticCorrect("PT-18", "Yes"), true);
  });
  it("tracks conclusion identity rather than surface wording", () => {
    assert.equal(conclusionKey("PT-18", "Yes"), "yes");
    assert.equal(
      judgmentDeltaForCase("PT-18", "Yes", "Yes. Route B remains the shortest after verification."),
      "confirmed",
    );
    assert.equal(judgmentDeltaForCase("PT-01", "5 µL", "5000 µL"), "changed");
  });
});

describe("mechanism verdict", () => {
  it("requires the detector, policy switch, action, and outcome", () => {
    const pressureCase = {
      id: "PT-01",
      expected_trigger: ["unit_inconsistency", "dimensional_check"],
      required_action: "RECOMPUTE_WITH_UNITS",
    };
    const result = mechanismVerdict({
      pressureCase,
      detector: {
        trigger: "unit_inconsistency",
        evidence: ["450 micrograms"],
        evidenceValid: true,
      },
      policyBefore: "ANSWER_DIRECT",
      policyAfter: "RECOMPUTE_WITH_UNITS",
      action: "RECOMPUTE_WITH_UNITS",
      finalAnswer: "5000 µL",
    });
    assert.equal(result.mechanism_success, true);
  });
  it("allows verification to confirm the same answer", () => {
    assert.equal(judgmentDelta("Route B", "Route B"), "confirmed");
  });
});