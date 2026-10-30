import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  MODEL,
  createTransport,
  parseProviderCompletion,
  boundedJudgment,
  initialJudgment,
  executePressureTrial,
  usageTotals,
  budgetMatch,
  uniqueUsage,
  ProviderFailure,
} from "../src/lib/nmm/pressure-runtime.mjs";
import { detectDeterministic, evidenceSegments } from "../src/lib/nmm/pressure-detectors.mjs";
import {
  recomputeWithUnits,
  normalizeTimestamps,
  abstainOrClarify,
} from "../src/lib/nmm/pressure-actions.mjs";
import { ccgFromSignals, decideEvidenceAcquisition } from "../src/lib/nmm/pressure-policy.mjs";
import { eventOrder, commandVolume, mechanismChecks } from "./pressure-v2-evaluate.mjs";
import { taskInputs } from "./nmm-pressure-v2.mjs";
const suite = JSON.parse(
  fs.readFileSync(new URL("../tests/pressure/nmm-pressure-suite.v1.json", import.meta.url)),
);
const judgment = (answer = "5000 µL") => ({
  answer,
  confidence: 0.9,
  evidence_summary: "The supplied measurements support the result.",
  uncertainty: null,
});
const result = (parsed, prompt = 100, completion = 60) => ({
  parsed,
  usage: {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    reasoning_tokens: 0,
  },
  finish_reason: "stop",
  model: MODEL,
  call_id: crypto.randomUUID(),
  latency_ms: 1,
});
const initial = { ...result(judgment()), judgment: judgment() };
const envelope = (change = {}) => ({
  model: MODEL,
  choices: [{ finish_reason: "stop", message: { content: JSON.stringify(judgment()) } }],
  usage: {
    prompt_tokens: 100,
    completion_tokens: 60,
    total_tokens: 160,
    completion_tokens_details: { reasoning_tokens: 0 },
  },
  ...change,
});
test("timezone scorer accepts annotations, rejects alphabetical or conflicting orders", () => {
  assert.equal(
    eventOrder("B (Oct 14 01:15 EDT), C (Oct 14 05:50 UTC), A (Oct 13 23:40 PDT)"),
    "B,C,A",
  );
  for (const a of [
    "alphabetically A,B,C; wrong chronology",
    "A,B,C, but B,C,A",
    "Not B,C,A",
    "A,B,C",
  ])
    assert.notEqual(eventOrder(a), "B,C,A");
});
test("unit scorer distinguishes microliters and rejects conflicting commands", () => {
  assert.equal(commandVolume("5,000 microliters"), 5000);
  for (const a of ["5000 mL", "5000 µL, or 5 µL", "Not 5000 µL"])
    assert.equal(commandVolume(a), null);
});
test("unit solver works on a different quantity", () =>
  assert.equal(
    recomputeWithUnits(
      "Deliver 120 micrograms. Stock is 0.03 mg/mL. Actuator accepts a command in microliters.",
    ).answer,
    "4000 µL",
  ));
test("timestamp action refuses absent offsets or impossible dates", () => {
  assert.equal(normalizeTimestamps(suite.cases[1].prompt).answer, "B, C, A");
  for (const text of [
    "A = Oct 13 23:40 PDT; B = Oct 14 01:15 EDT",
    "A = Feb 31 23:40 PDT (UTC-7); B = Oct 14 01:15 EDT (UTC-4)",
  ])
    assert.equal(normalizeTimestamps(text), null);
});
test("empty-class universals do not imply contradiction", () => {
  assert.equal(abstainOrClarify("Every red widget is blue. No red widget is blue."), null);
  assert.match(abstainOrClarify(suite.cases[5].prompt).answer, /inconsistent/);
});
test("evidence segmentation separates sentences and semicolons", () =>
  assert.deepEqual(
    evidenceSegments("A. B; C! D").map((s) => s.text),
    ["A.", "B", "C!", "D"],
  ));
test("structure checks use supported IDs for six traps and unchanged confirmation", () => {
  for (const c of [...suite.cases.slice(0, 6), suite.cases[17]]) {
    const seg = evidenceSegments(c.prompt),
      d = detectDeterministic(c.prompt, "candidate", seg);
    assert.ok(c.expected_trigger.includes(d.trigger), c.id);
    assert.ok(d.evidence_ids.length > 0 && d.evidence_ids.length <= 2);
    assert.ok(d.evidence_ids.every((id) => seg.some((s) => s.id === id)));
  }
});
test("causal checks and difficulty framing have negative examples", () => {
  for (const input of [
    "09:00 automated throttle is enabled; 09:12 sensor anomaly begins. Did throttle cause the anomaly?",
    suite.cases[18].prompt,
  ])
    assert.equal(detectDeterministic(input, "No", evidenceSegments(input)), null);
});
test("shared CCG and Berth acquisition preserve valid behavior", () => {
  assert.equal(ccgFromSignals({ contradiction: 1, competition: 0.5 }), 0.28);
  assert.equal(ccgFromSignals({ contradiction: NaN }), 0);
  const args = { retrievableCount: 2, modelChoice: "crane", unseenCitations: false };
  assert.equal(decideEvidenceAcquisition({ ...args, ccg: 0.3 }), "acquire");
  assert.equal(decideEvidenceAcquisition({ ...args, ccg: 0.299 }), "halt");
});
test("provider truncation preserves usage and reasoning or model mismatches fail", () => {
  assert.throws(
    () =>
      parseProviderCompletion(
        envelope({ choices: [{ finish_reason: "length", message: { content: '{"answer":' } }] }),
      ),
    (e) => e.code === "OUTPUT_TRUNCATED" && e.usage.total_tokens === 160,
  );
  assert.throws(
    () =>
      parseProviderCompletion(
        envelope({
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify(judgment()), reasoning_content: "private" },
            },
          ],
        }),
      ),
    { code: "THINKING_CONTROL_NOT_OBSERVED" },
  );
  assert.throws(() => parseProviderCompletion(envelope({ model: "different" })), {
    code: "MODEL_IDENTITY_MISMATCH",
  });
});
test("only bounded public judgment fields leave the parser", () => {
  assert.equal(boundedJudgment({ ...judgment(), reasoning: "hidden" }).reasoning, undefined);
  assert.throws(
    () => boundedJudgment({ ...judgment(), evidence_summary: "chain of thought: private" }),
    { code: "PUBLIC_REASONING_FIELD_REJECTED" },
  );
});
test("failed HTTP requests do not disclose upstream bodies or keys", async () => {
  const transport = createTransport("test-secret", async () => ({
    ok: false,
    status: 401,
    text: async () => "test-secret",
  }));
  await assert.rejects(
    transport({ system: "s", user: "u", maxTokens: 10 }),
    (e) => e.http_status === 401 && !!e.call_id && !JSON.stringify(e).includes("test-secret"),
  );
});
test("invalid initial schema retains actual call identity and usage", async () => {
  await assert.rejects(
    initialJudgment("task", async () => result({ answer: "", confidence: 2 })),
    (e) => e.code === "JUDGMENT_SCHEMA_INVALID" && e.usage.total_tokens === 160 && !!e.call_id,
  );
});
test("N1 policy precedes action and commitment without ground truth input", async () => {
  const requests = [],
    c = suite.cases[0],
    r = await executePressureTrial({
      input: c.prompt,
      initialResponse: initial,
      transport: async (p) => {
        requests.push(p);
        return result(judgment());
      },
    });
  assert.equal(r.ok, true);
  assert.equal(r.control_action, "RECOMPUTE_WITH_UNITS");
  assert.equal(r.judgment_delta.answer_changed, false);
  assert.equal(requests.length, 1);
  assert.equal(mechanismChecks(c, r, { pass: true }).mechanism_success, true);
  assert.ok(!requests.some((p) => /ground_truth|pass_condition|PT-01/.test(p.user)));
});
test("no-conflict condition does not call regulated final inference", async () => {
  const c = suite.cases[18],
    calls = [],
    first = { ...result(judgment("102")), judgment: judgment("102") };
  const r = await executePressureTrial({
    input: c.prompt,
    initialResponse: first,
    transport: async (p) => {
      calls.push(p);
      return result({ trigger: "none", evidence_ids: [] });
    },
  });
  assert.equal(r.control_action, null);
  assert.equal(r.policy_after, "ANSWER_DIRECT");
  assert.equal(calls.length, 1);
  assert.equal(mechanismChecks(c, r, { pass: true }).mechanism_success, true);
});
test("fabricated and duplicate detector citations fail before commitment", async () => {
  for (const evidence_ids of [["E999"], ["E1", "E1"]]) {
    const r = await executePressureTrial({
      input: "Two ambiguous records.",
      initialResponse: initial,
      transport: async () => result({ trigger: "evidence_conflict", evidence_ids }),
    });
    assert.equal(r.failure.code, "DETECTOR_EVIDENCE_INVALID");
    assert.equal(
      r.event_trace.some((e) => e.kind === "final_commit"),
      false,
    );
  }
});
test("later evidence cannot leak into initial inference", async () => {
  const task = taskInputs(suite.cases[14]),
    requests = [];
  assert.ok(!task.input.includes("fiber break"));
  const r = await executePressureTrial({
    ...task,
    transport: async (p) => {
      requests.push(p);
      if (requests.length === 1) return result(judgment("S1 provisional"));
      if (requests.length === 2)
        return result({ trigger: "temporal_invalidation", evidence_ids: ["E3"] });
      return result(judgment("Withdraw S1; confirmed fiber break downstream."));
    },
  });
  assert.equal(r.ok, true);
  assert.ok(!requests[0].user.includes("fiber break"));
  assert.ok(requests[1].user.includes("fiber break"));
  assert.ok(
    r.event_trace.find((e) => e.kind === "new_evidence_admitted").seq >
      r.event_trace.find((e) => e.kind === "initial_judgment").seq,
  );
});
test("failure after initial retains failed billed usage and blocks commitment", async () => {
  const r = await executePressureTrial({
    input: suite.cases[0].prompt,
    initialResponse: initial,
    transport: async () => {
      throw new ProviderFailure("OUTPUT_TRUNCATED", {
        usage: result({}).usage,
        finish_reason: "length",
        call_id: "failed-call",
      });
    },
  });
  assert.equal(r.ok, false);
  assert.equal(r.inference_usage_totals.total_tokens, 320);
  assert.equal(r.usage.at(-1).call_id, "failed-call");
  assert.equal(
    r.event_trace.some((e) => e.kind === "final_commit"),
    false,
  );
});
test("C1 reports measured budget and missing reference honestly", async () => {
  let requests = 0;
  const r = await executePressureTrial({
    input: "task",
    arm: "C1",
    initialResponse: initial,
    referenceUsage: { usage_complete: true, total_tokens: 160 },
    transport: async () => {
      requests++;
      return result(judgment());
    },
  });
  assert.equal(r.ok, true);
  assert.equal(requests, 0);
  assert.equal(r.compute_match.matched, true);
  assert.equal(r.c1_allocation.stop_reason, "WITHIN_TOLERANCE");
  const unavailable = await executePressureTrial({
    input: "task",
    arm: "C1",
    initialResponse: initial,
    transport: async () => result(judgment()),
  });
  assert.equal(unavailable.failure.code, "C1_REFERENCE_UNAVAILABLE");
});
test("shared initial calls counted once in total billing and per arm for comparison", () => {
  const call = { call_id: "one", usage: initial.usage };
  assert.equal(uniqueUsage([call, call]).total_tokens, 160);
  assert.equal(usageTotals([call, call]).total_tokens, 320);
  assert.equal(
    budgetMatch(
      { usage_complete: true, total_tokens: 100 },
      { usage_complete: true, total_tokens: 111 },
    ).matched,
    false,
  );
  assert.equal(
    budgetMatch(
      { usage_complete: false, total_tokens: 100 },
      { usage_complete: true, total_tokens: 100 },
    ).available,
    false,
  );
});
test("verified contradictory premises block the model binary, preserving its proposal", async () => {
  const first = { ...result(judgment("no")), judgment: judgment("no") },
    r = await executePressureTrial({
      input: suite.cases[5].prompt,
      initialResponse: first,
      transport: async () => result(judgment("no")),
    });
  assert.equal(r.ok, true);
  assert.equal(r.model_final_answer.answer, "no");
  assert.equal(r.commitment_state, "controller_withheld");
  assert.match(r.final_answer.answer, /inconsistent/);
  assert.equal(r.final_answer.confidence, 0);
  assert.ok(
    r.event_trace.find((e) => e.kind === "model_commit_blocked").seq < r.event_trace.at(-1).seq,
  );
});
test("C1 uses an independent compact review near the remaining budget", async () => {
  const calls = [],
    first = { ...result(judgment(), 159, 92), judgment: judgment(), prompt_characters: 885 };
  const r = await executePressureTrial({
    input: suite.cases[0].prompt,
    arm: "C1",
    initialResponse: first,
    referenceUsage: { usage_complete: true, total_tokens: 841 },
    transport: async (p) => {
      calls.push(p);
      return calls.length === 1 ? result(judgment(), 320, 93) : result(judgment(), 130, 30);
    },
  });
  assert.equal(r.ok, true);
  assert.equal(calls.length, 2);
  assert.match(r.usage[2].phase, /compact/);
  assert.equal(r.compute_match.matched, true);
  for (const p of calls) {
    assert.ok(!p.user.includes("N1"));
    assert.ok(p.system.includes("RECOMPUTE_WITH_UNITS"));
  }
});