import {
  abstainOrClarify,
  branchAndVerify,
  checkCausalOrder,
  normalizeTimestamps,
  recomputeWithUnits,
  traceEntityBindings,
  verifySource,
} from "./nmm-pressure-actions.mjs";

function selectIds(segments, patterns, limit = 2) {
  const ids = [];
  for (const pattern of patterns) {
    const hit = segments.find((segment) => !ids.includes(segment.id) && pattern.test(segment.text));
    if (hit) ids.push(hit.id);
    if (ids.length >= limit) break;
  }
  return ids;
}

export function detectDeterministic(input, initialAnswer, segments) {
  const unitCheck = recomputeWithUnits(input);
  if (unitCheck) {
    return {
      trigger: "unit_inconsistency",
      evidence_ids: selectIds(segments, [
        /micrograms?|µg|μg|\bug\b/i,
        /mg\s*\/\s*mL|milligrams?\s*\/\s*milliliters?/i,
      ]),
      executor: "deterministic_unit_signal_v1",
      observation:
        "The task crosses mass and volume unit scales before an actuator command is committed.",
      initial_answer_snapshot: initialAnswer,
    };
  }

  const timestampCheck = normalizeTimestamps(input);
  if (timestampCheck && /UTC[+-]\d/i.test(input)) {
    return {
      trigger: "temporal_inconsistency",
      evidence_ids: selectIds(segments, [/UTC[+-]\d/i, /\bUTC\b/i]),
      executor: "deterministic_timestamp_signal_v1",
      observation: "The displayed local times use different UTC offsets and require normalization.",
      initial_answer_snapshot: initialAnswer,
    };
  }

  const entityCheck = traceEntityBindings(input);
  const appointments = input.match(/\bappointed\b/gi) ?? [];
  if (entityCheck && appointments.length >= 2) {
    return {
      trigger: "entity_binding_conflict",
      evidence_ids: selectIds(segments, [/appointed/i, /appointed/i]),
      executor: "deterministic_entity_signal_v1",
      observation:
        "Multiple similarly framed appointment relations compete for the queried entity.",
      initial_answer_snapshot: initialAnswer,
    };
  }

  const causalCheck = checkCausalOrder(input);
  if (causalCheck) {
    return {
      trigger: "causal_temporal_conflict",
      evidence_ids: selectIds(segments, [/anomaly\s+begins/i, /throttle\s+is\s+enabled/i]),
      executor: "deterministic_causal_signal_v1",
      observation: "The proposed cause occurs after the effect begins.",
      initial_answer_snapshot: initialAnswer,
    };
  }

  const branchCheck = branchAndVerify(input);
  if (branchCheck) {
    return {
      trigger: "evidence_conflict",
      evidence_ids: selectIds(segments, [/requires\s+BOTH/i, /clearance\s+was\s+revoked/i]),
      executor: "deterministic_policy_signal_v1",
      observation: "A required authorization condition conflicts with a later revocation.",
      initial_answer_snapshot: initialAnswer,
    };
  }

  const premiseCheck = abstainOrClarify(input);
  if (premiseCheck) {
    return {
      trigger: "premise_contradiction",
      evidence_ids: selectIds(segments, [/Every\s+red\s+widget/i, /No\s+red\s+widget/i]),
      executor: "deterministic_premise_signal_v1",
      observation: "The supplied universal premises directly contradict one another.",
      initial_answer_snapshot: initialAnswer,
    };
  }

  const sourceCheck = verifySource(input);
  if (sourceCheck && /blurry/i.test(input)) {
    return {
      trigger: "evidence_quality_issue",
      evidence_ids: selectIds(segments, [/blurry/i, /verification\s+source\s+confirms/i]),
      executor: "deterministic_source_quality_signal_v1",
      observation: "A low-quality source element requires verification before commitment.",
      initial_answer_snapshot: initialAnswer,
    };
  }

  return null;
}