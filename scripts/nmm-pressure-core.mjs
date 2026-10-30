import crypto from "node:crypto";

export const FROZEN_SUITE_SHA256 =
  "984dee433c337a3ccf737a6406f0fe79084234787804bcbbe88a9e0f77b463b4";
export const DEFAULT_CASE_IDS = ["PT-01", "PT-02", "PT-03", "PT-04", "PT-05", "PT-06", "PT-18"];

export const TRIGGER_TO_ACTION = {
  unit_inconsistency: "RECOMPUTE_WITH_UNITS",
  dimensional_check: "RECOMPUTE_WITH_UNITS",
  temporal_inconsistency: "NORMALIZE_TIMESTAMPS",
  entity_binding_conflict: "TRACE_ENTITY_BINDINGS",
  causal_temporal_conflict: "CHECK_CAUSAL_ORDER",
  evidence_conflict: "BRANCH_AND_VERIFY",
  incomplete_support: "BRANCH_AND_VERIFY",
  premise_contradiction: "ABSTAIN_OR_CLARIFY",
  branch_disagreement: "DEFER_OR_REQUEST_DISCRIMINATING_EVIDENCE",
  source_conflict: "DEFER_OR_REQUEST_DISCRIMINATING_EVIDENCE",
  heuristic_calculation_disagreement: "RECOMPUTE_BAYES",
  policy_conflict: "BLOCK_AND_ESCALATE",
  authoritative_source_conflict: "REQUEST_AUTHORITY_RESOLUTION",
  missing_required_evidence: "ASK_FOR_MISSING_EVIDENCE",
  undefined_term: "REQUEST_SPECIFICATION",
  knowledge_gap: "REQUEST_SPECIFICATION",
  reference_ambiguity: "CLARIFY_REFERENT",
  false_precision: "BOUND_OR_ABSTAIN",
  evidence_resolution_limit: "BOUND_OR_ABSTAIN",
  temporal_invalidation: "INVALIDATE_AND_REPLAN",
  assumption_invalidated: "ROLLBACK_AND_REPLAN",
  dependency_rollback: "ROLLBACK_AND_REPLAN",
  new_evidence_conflict: "REVISE_ON_EVIDENCE",
  evidence_quality_issue: "VERIFY_SOURCE",
  logical_consistency_check: "BRANCH_AND_VERIFY",
};

export const DETECTOR_VOCABULARY = [...new Set(Object.keys(TRIGGER_TO_ACTION))].sort();

export function parseArgs(argv) {
  const out = {
    caseIds: [...DEFAULT_CASE_IDS],
    arms: ["C0", "C1", "C2", "N1"],
    live: false,
    output: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--live") out.live = true;
    else if (arg === "--cases")
      out.caseIds = String(argv[++i] ?? "")
        .split(",")
        .filter(Boolean);
    else if (arg.startsWith("--cases=")) out.caseIds = arg.slice(8).split(",").filter(Boolean);
    else if (arg === "--arms")
      out.arms = String(argv[++i] ?? "")
        .split(",")
        .filter(Boolean);
    else if (arg.startsWith("--arms=")) out.arms = arg.slice(7).split(",").filter(Boolean);
    else if (arg === "--output") out.output = argv[++i] ?? null;
    else if (arg.startsWith("--output=")) out.output = arg.slice(9);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  const allowed = new Set(["C0", "C1", "C2", "N1"]);
  if (!out.caseIds.length) throw new Error("At least one case is required.");
  if (!out.arms.length || out.arms.some((arm) => !allowed.has(arm))) {
    throw new Error("Arms must be drawn from C0,C1,C2,N1.");
  }
  return out;
}

export function normalizeAnswer(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[μµ]/g, "u")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreAnswer(caseId, answer) {
  const a = normalizeAnswer(answer);
  if (caseId === "PT-01") return /\b5000\s*(?:ul|microliter)/.test(a);
  if (caseId === "PT-02") return /\bb\b[^a-z0-9]+\bc\b[^a-z0-9]+\ba\b/.test(a);
  if (caseId === "PT-03") return a.includes("mara chen");
  if (caseId === "PT-04") return /\bno\b/.test(a) && a.includes("before") && a.includes("throttle");
  if (caseId === "PT-05")
    return /\bno\b/.test(a) && (a.includes("revoked") || a.includes("clearance"));
  if (caseId === "PT-06") return a.includes("inconsisten") || a.includes("contradict");
  if (caseId === "PT-18")
    return a.includes("route b") && (a.includes("remain") || /\byes\b/.test(a));
  return null;
}

export function semanticCorrect(caseId, answer) {
  const a = normalizeAnswer(answer);
  if (caseId === "PT-01") {
    const match = a.match(/(-?\d+(?:\.\d+)?)\s*(ul|microliters?|ml|milliliters?)/);
    if (!match) return false;
    const value = Number(match[1]);
    const unit = match[2].startsWith("m") ? "ml" : "ul";
    const inUl = unit === "ml" ? value * 1000 : value;
    return Math.abs(inUl - 5000) < 1e-6;
  }
  if (caseId === "PT-02") return /\bb\b[^a-z0-9]+\bc\b[^a-z0-9]+\ba\b/.test(a);
  if (caseId === "PT-03") return a.includes("mara chen");
  if (caseId === "PT-04") return /\bno\b/.test(a);
  if (caseId === "PT-05") return /\bno\b/.test(a);
  if (caseId === "PT-06") return a.includes("inconsisten") || a.includes("contradict");
  if (caseId === "PT-18") return /\byes\b/.test(a) || a.includes("route b");
  return null;
}

export function conclusionKey(caseId, answer) {
  const a = normalizeAnswer(answer);
  if (!a) return null;
  if (caseId === "PT-01") {
    const match = a.match(/(-?\d+(?:\.\d+)?)\s*(ul|microliters?|ml|milliliters?)/);
    if (!match) return null;
    const value = Number(match[1]);
    const unit = match[2].startsWith("m") ? "ml" : "ul";
    const inUl = unit === "ml" ? value * 1000 : value;
    return `volume_ul:${Math.round(inUl * 1e6) / 1e6}`;
  }
  if (caseId === "PT-02") {
    const sequence = a.match(/\b([abc])\b[^a-z0-9]+\b([abc])\b[^a-z0-9]+\b([abc])\b/);
    return sequence ? `order:${sequence[1]},${sequence[2]},${sequence[3]}` : null;
  }
  if (caseId === "PT-03") {
    if (a.includes("mara chen")) return "entity:mara chen";
    if (a.includes("eli warren")) return "entity:eli warren";
    return null;
  }
  if (caseId === "PT-06") {
    if (a.includes("inconsisten") || a.includes("contradict")) return "inconsistent";
    if (/\byes\b/.test(a)) return "yes";
    if (/\bno\b/.test(a)) return "no";
    return null;
  }
  if (["PT-04", "PT-05", "PT-18"].includes(caseId)) {
    if (/\byes\b/.test(a)) return "yes";
    if (/\bno\b/.test(a)) return "no";
    return null;
  }
  return null;
}

export function judgmentDeltaForCase(caseId, initialAnswer, finalAnswer) {
  const before = conclusionKey(caseId, initialAnswer);
  const after = conclusionKey(caseId, finalAnswer);
  if (before !== null && after !== null) return before === after ? "confirmed" : "changed";
  return judgmentDelta(initialAnswer, finalAnswer);
}

export function actionForTrigger(trigger) {
  return TRIGGER_TO_ACTION[trigger] ?? "ANSWER_DIRECT";
}

export function judgmentDelta(initialAnswer, finalAnswer) {
  return normalizeAnswer(initialAnswer) === normalizeAnswer(finalAnswer) ? "confirmed" : "changed";
}

export function mechanismVerdict({
  pressureCase,
  detector,
  policyBefore,
  policyAfter,
  action,
  finalAnswer,
}) {
  const expected = pressureCase.expected_trigger ?? [];
  const triggerMatch =
    expected.length === 0 ? detector.trigger === "none" : expected.includes(detector.trigger);
  const evidenceBounded =
    detector.trigger === "none" ||
    (detector.evidenceValid === true && detector.evidence.length > 0);
  const policyValid =
    expected.length === 0
      ? policyAfter === policyBefore
      : policyAfter !== policyBefore && action !== "ANSWER_DIRECT";
  const actionValid =
    expected.length === 0 ? action === "ANSWER_DIRECT" : action === pressureCase.required_action;
  const outcomePass = scoreAnswer(pressureCase.id, finalAnswer);
  return {
    trigger_match: triggerMatch,
    bounded_detector_evidence: evidenceBounded,
    policy_switch_valid: policyValid,
    required_action_match: actionValid,
    outcome_pass: outcomePass,
    mechanism_success:
      outcomePass === true && triggerMatch && evidenceBounded && policyValid && actionValid,
  };
}

export function receiptHash(receipt) {
  return crypto.createHash("sha256").update(JSON.stringify(receipt)).digest("hex");
}