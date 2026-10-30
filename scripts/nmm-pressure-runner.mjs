import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  DETECTOR_VOCABULARY,
  FROZEN_SUITE_SHA256,
  actionForTrigger,
  conclusionKey,
  judgmentDeltaForCase,
  mechanismVerdict,
  semanticCorrect,
  parseArgs,
  receiptHash,
  scoreAnswer,
} from "./nmm-pressure-core.mjs";
import { executeDeterministicAction } from "./nmm-pressure-actions.mjs";
import { detectDeterministic } from "./nmm-pressure-detectors.mjs";

const ROOT = process.cwd();
const SUITE_PATH = path.join(ROOT, "tests", "pressure", "nmm-pressure-suite.v1.json");
const MODEL = "nvidia/Nemotron-3_5-Lightning";
const CONTROL_TOOL_NAMES = [
  "RECOMPUTE_WITH_UNITS",
  "NORMALIZE_TIMESTAMPS",
  "TRACE_ENTITY_BINDINGS",
  "CHECK_CAUSAL_ORDER",
  "BRANCH_AND_VERIFY",
  "ABSTAIN_OR_CLARIFY",
  "VERIFY_SOURCE",
];

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function loadSuite() {
  const actual = sha256File(SUITE_PATH);
  if (actual !== FROZEN_SUITE_SHA256) {
    throw new Error(
      `Frozen pressure suite hash mismatch. Expected ${FROZEN_SUITE_SHA256}, got ${actual}. Refusing to run.`,
    );
  }
  const suite = JSON.parse(fs.readFileSync(SUITE_PATH, "utf8"));
  if (suite.schema_version !== "1.0" || !Array.isArray(suite.cases) || suite.cases.length !== 20) {
    throw new Error("Pressure suite shape is invalid or unexpected.");
  }
  const ids = suite.cases.map((item) => item.id);
  if (new Set(ids).size !== ids.length)
    throw new Error("Pressure suite contains duplicate case IDs.");
  return suite;
}

function loadEnvLocal() {
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key]) continue;
    let value = raw.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function caseInput(item) {
  if (typeof item.prompt === "string") return item.prompt;
  if (Array.isArray(item.turns)) {
    return item.turns
      .map((turn, index) => `TURN ${index + 1} (${turn.role}): ${turn.content}`)
      .join("\n");
  }
  throw new Error(`Case ${item.id} has no prompt or turns.`);
}

function evidenceSegments(input) {
  return input
    .split(/(?<=[.!?])\\s+|;\\s+/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, index) => ({ id: `E${index + 1}`, text }));
}

function safeJson(content) {
  if (typeof content !== "string") return null;
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
}

function usageOf(payload) {
  return {
    input: payload?.usage?.prompt_tokens ?? 0,
    output: payload?.usage?.completion_tokens ?? 0,
    total: (payload?.usage?.prompt_tokens ?? 0) + (payload?.usage?.completion_tokens ?? 0),
  };
}

async function callModel(apiKey, label, messages, maxTokens = 320) {
  const started = Date.now();
  const response = await fetch("https://api.tokenfactory.nebius.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0,
      response_format: { type: "json_object" },
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(45000),
  });
  const latencyMs = Date.now() - started;
  if (!response.ok) {
    throw new Error(`${label}: Nebius Token Factory returned HTTP ${response.status}`);
  }
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  const parsed = safeJson(content);
  if (!parsed) throw new Error(`${label}: model did not return usable structured JSON`);
  return {
    parsed,
    latency_ms: latencyMs,
    usage: usageOf(payload),
    model: payload?.model ?? MODEL,
  };
}

function initialMessages(input) {
  return [
    {
      role: "system",
      content:
        "Answer the supplied synthetic reasoning task on a normal first pass. Return exactly one JSON object with keys answer (short complete self-contained answer that includes any requested units, entity name, ordering, or yes/no judgment), confidence (number 0 to 1), and support (array of at most 2 short facts from the prompt). Do not expose hidden chain-of-thought.",
    },
    { role: "user", content: input },
  ];
}

function genericReviewMessages(input, previous, pass, toolResult = null) {
  const toolCatalog = CONTROL_TOOL_NAMES.join(", ");
  const system =
    pass === 1
      ? "Perform a generic additional reasoning pass. Do not use a named metacognitive policy or detector. You may request one neutral verification tool if useful. Available tool_request values: " +
        toolCatalog +
        ", or null. Return JSON with answer (self-contained and including requested units/entity/order), confidence, verification (array of at most 3 bounded checks), and tool_request. No hidden chain-of-thought."
      : "Perform a final generic additional reasoning pass using any supplied neutral tool result. Do not use a named metacognitive policy or detector. Return JSON with answer (self-contained and including requested units/entity/order), confidence, verification (array of at most 3 bounded checks). No hidden chain-of-thought.";
  return [
    { role: "system", content: system },
    {
      role: "user",
      content:
        `TASK:\n${input}\n\nPREVIOUS ANSWER:\n${previous}\n\nThis is sequential review pass ${pass}.` +
        (toolResult ? `\n\nNEUTRAL TOOL RESULT:\n${JSON.stringify(toolResult)}` : ""),
    },
  ];
}

function critiqueMessages(input, initialAnswer) {
  return [
    {
      role: "system",
      content:
        "Provide generic self-critique of an answer. You may request one neutral verification tool if useful. Available tool_request values: " +
        CONTROL_TOOL_NAMES.join(", ") +
        ", or null. Return JSON with issues (array of at most 3 short externally checkable concerns), recommendation (keep or revise), and tool_request. Do not use a typed NMM detector or reveal hidden chain-of-thought.",
    },
    { role: "user", content: `TASK:\n${input}\n\nANSWER TO CRITIQUE:\n${initialAnswer}` },
  ];
}

function refineMessages(input, initialAnswer, critique, toolResult = null) {
  return [
    {
      role: "system",
      content:
        "Refine the answer using the supplied generic critique and any neutral tool result. Return JSON with answer (self-contained and including requested units/entity/order), confidence, verification (array of at most 3 bounded checks). Do not expose hidden chain-of-thought.",
    },
    {
      role: "user",
      content:
        `TASK:\n${input}\n\nINITIAL ANSWER:\n${initialAnswer}\n\nGENERIC CRITIQUE:\n${JSON.stringify(critique)}` +
        (toolResult ? `\n\nNEUTRAL TOOL RESULT:\n${JSON.stringify(toolResult)}` : ""),
    },
  ];
}

function normalizeToolRequest(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return CONTROL_TOOL_NAMES.includes(normalized) ? normalized : null;
}

function runNeutralTool(request, input) {
  const tool = normalizeToolRequest(request);
  if (!tool) return { requested: null, result: null };
  return { requested: tool, result: executeDeterministicAction(tool, input) };
}

function detectorMessages(initialAnswer, segments) {
  const indexed = segments.map((segment) => `[${segment.id}] ${segment.text}`).join("\n");
  return [
    {
      role: "system",
      content:
        "You are a bounded reliability detector. You do not solve the task. Inspect the indexed task evidence and the recorded first answer for a pre-commit reliability problem. Return exactly one JSON object with trigger and evidence_ids. trigger must be one value from this list or none: " +
        DETECTOR_VOCABULARY.join(", ") +
        ". evidence_ids must contain at most 2 IDs from the supplied evidence segments. If no intervention is warranted, return trigger=none and evidence_ids=[]. Do not reveal hidden chain-of-thought.",
    },
    {
      role: "user",
      content: `TASK EVIDENCE:\n${indexed}\n\nRECORDED FIRST ANSWER:\n${initialAnswer}`,
    },
  ];
}

const ACTION_INSTRUCTIONS = {
  RECOMPUTE_WITH_UNITS:
    "Normalize the supplied quantities into compatible units and verify dimensional consistency before answering.",
  NORMALIZE_TIMESTAMPS:
    "Convert all supplied timestamps to one common time basis before ordering them.",
  TRACE_ENTITY_BINDINGS:
    "Trace only explicit entity-to-entity relationships in the supplied text before answering.",
  CHECK_CAUSAL_ORDER:
    "Check temporal order of the proposed cause and effect before making a causal judgment.",
  BRANCH_AND_VERIFY:
    "Evaluate the competing branches against all supplied conditions before selecting or rejecting a conclusion.",
  ABSTAIN_OR_CLARIFY:
    "Check the supplied premises for consistency. If they cannot jointly support a definitive answer, say so.",
  VERIFY_SOURCE:
    "Verify the uncertain source detail supplied in the task and then decide whether the original conclusion remains supported.",
  DEFER_OR_REQUEST_DISCRIMINATING_EVIDENCE:
    "Determine whether the supplied evidence can discriminate the competing possibilities. If not, defer.",
  RECOMPUTE_BAYES:
    "Recompute the posterior using the supplied base rate, sensitivity, and false-positive rate.",
  BLOCK_AND_ESCALATE: "Check the stated operational invariant before authorizing the action.",
  REQUEST_AUTHORITY_RESOLUTION:
    "Do not invent precedence between equally authoritative conflicting sources.",
  ASK_FOR_MISSING_EVIDENCE: "Identify the required missing quantity instead of fabricating it.",
  REQUEST_SPECIFICATION: "Do not invent semantics for an undefined protocol or term.",
  CLARIFY_REFERENT: "Do not choose among multiple plausible referents without evidence.",
  BOUND_OR_ABSTAIN:
    "Preserve the evidence-supported interval or uncertainty instead of inventing precision.",
  INVALIDATE_AND_REPLAN:
    "Explicitly retire any earlier hypothesis falsified by the verified later observation.",
  ROLLBACK_AND_REPLAN:
    "Identify dependent steps whose assumption was invalidated and replace them.",
  REVISE_ON_EVIDENCE:
    "Update the provisional conclusion using the newly arrived verified evidence.",
};

function regulatedMessages(input, initialAnswer, detector, action) {
  const instruction =
    ACTION_INSTRUCTIONS[action] ?? "Re-evaluate only as justified by the detected issue.";
  return [
    {
      role: "system",
      content:
        "Apply the specified bounded control action before final commitment. Return JSON with answer, confidence, verification (array of at most 3 short externally checkable facts or calculations). Do not expose hidden chain-of-thought.",
    },
    {
      role: "user",
      content: `TASK:\n${input}\n\nINITIAL ANSWER:\n${initialAnswer}\n\nDETECTOR EVENT:\n${JSON.stringify(detector)}\n\nCONTROL ACTION: ${action}\nACTION REQUIREMENT: ${instruction}`,
    },
  ];
}

function answerOf(result) {
  return String(result?.parsed?.answer ?? "").trim();
}

function confidenceOf(result) {
  const n = Number(result?.parsed?.confidence);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
}

function sumUsage(items) {
  return items.reduce(
    (acc, item) => {
      acc.input += item?.usage?.input ?? 0;
      acc.output += item?.usage?.output ?? 0;
      acc.total += item?.usage?.total ?? 0;
      acc.latency_ms += item?.latency_ms ?? 0;
      return acc;
    },
    { input: 0, output: 0, total: 0, latency_ms: 0 },
  );
}

async function executeCase(apiKey, pressureCase, arms) {
  const input = caseInput(pressureCase);
  const initial = await callModel(
    apiKey,
    `${pressureCase.id}/initial`,
    initialMessages(input),
    240,
  );
  const initialAnswer = answerOf(initial);
  const result = {
    case_id: pressureCase.id,
    category: pressureCase.category,
    title: pressureCase.title,
    frozen_ground_truth: pressureCase.ground_truth,
    expected_trigger: pressureCase.expected_trigger,
    required_action: pressureCase.required_action,
    shared_initial: {
      answer: initialAnswer,
      confidence: confidenceOf(initial),
      support: Array.isArray(initial.parsed.support) ? initial.parsed.support.slice(0, 2) : [],
      outcome_pass: scoreAnswer(pressureCase.id, initialAnswer),
      semantic_correct: semanticCorrect(pressureCase.id, initialAnswer),
      conclusion_key: conclusionKey(pressureCase.id, initialAnswer),
      latency_ms: initial.latency_ms,
      usage: initial.usage,
      model: initial.model,
    },
    arms: {},
  };

  if (arms.includes("C0")) {
    result.arms.C0 = {
      final_answer: initialAnswer,
      final_confidence: confidenceOf(initial),
      outcome_pass: scoreAnswer(pressureCase.id, initialAnswer),
      semantic_correct: semanticCorrect(pressureCase.id, initialAnswer),
      conclusion_key: conclusionKey(pressureCase.id, initialAnswer),
      calls_after_initial: 0,
      usage_after_initial: { input: 0, output: 0, total: 0, latency_ms: 0 },
    };
  }

  if (arms.includes("C1")) {
    try {
      const pass1 = await callModel(
        apiKey,
        `${pressureCase.id}/C1/pass1`,
        genericReviewMessages(input, initialAnswer, 1),
      );
      const neutralTool = runNeutralTool(pass1.parsed.tool_request, input);
      const pass2 = await callModel(
        apiKey,
        `${pressureCase.id}/C1/pass2`,
        genericReviewMessages(input, answerOf(pass1), 2, neutralTool.result),
      );
      const final = answerOf(pass2);
      result.arms.C1 = {
        valid: true,
        final_answer: final,
        final_confidence: confidenceOf(pass2),
        verification: Array.isArray(pass2.parsed.verification)
          ? pass2.parsed.verification.slice(0, 3)
          : [],
        tool_requested: neutralTool.requested,
        tool_executor: neutralTool.result?.executor ?? null,
        tool_result: neutralTool.result,
        judgment_delta: judgmentDeltaForCase(pressureCase.id, initialAnswer, final),
        outcome_pass: scoreAnswer(pressureCase.id, final),
        semantic_correct: semanticCorrect(pressureCase.id, final),
        conclusion_key: conclusionKey(pressureCase.id, final),
        calls_after_initial: 2,
        usage_after_initial: sumUsage([pass1, pass2]),
      };
    } catch (error) {
      result.arms.C1 = {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
        outcome_pass: false,
      };
    }
  }

  if (arms.includes("C2")) {
    try {
      const critique = await callModel(
        apiKey,
        `${pressureCase.id}/C2/critique`,
        critiqueMessages(input, initialAnswer),
        260,
      );
      const neutralTool = runNeutralTool(critique.parsed.tool_request, input);
      const refine = await callModel(
        apiKey,
        `${pressureCase.id}/C2/refine`,
        refineMessages(input, initialAnswer, critique.parsed, neutralTool.result),
      );
      const final = answerOf(refine);
      result.arms.C2 = {
        valid: true,
        critique: {
          issues: Array.isArray(critique.parsed.issues) ? critique.parsed.issues.slice(0, 3) : [],
          recommendation: critique.parsed.recommendation ?? null,
        },
        final_answer: final,
        final_confidence: confidenceOf(refine),
        verification: Array.isArray(refine.parsed.verification)
          ? refine.parsed.verification.slice(0, 3)
          : [],
        tool_requested: neutralTool.requested,
        tool_executor: neutralTool.result?.executor ?? null,
        tool_result: neutralTool.result,
        judgment_delta: judgmentDeltaForCase(pressureCase.id, initialAnswer, final),
        outcome_pass: scoreAnswer(pressureCase.id, final),
        semantic_correct: semanticCorrect(pressureCase.id, final),
        conclusion_key: conclusionKey(pressureCase.id, final),
        calls_after_initial: 2,
        usage_after_initial: sumUsage([critique, refine]),
      };
    } catch (error) {
      result.arms.C2 = {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
        outcome_pass: false,
      };
    }
  }

  if (arms.includes("N1")) {
    const segments = evidenceSegments(input);
    const segmentMap = new Map(segments.map((segment) => [segment.id, segment.text]));
    const deterministicDetector = detectDeterministic(input, initialAnswer, segments);
    let detectorCall = null;
    let triggerCandidate = deterministicDetector?.trigger ?? null;
    let evidenceIds = deterministicDetector?.evidence_ids ?? [];
    let detectorExecutor = deterministicDetector?.executor ?? "regulated_model_detector";
    let detectorObservation = deterministicDetector?.observation ?? null;
    if (!deterministicDetector) {
      detectorCall = await callModel(
        apiKey,
        `${pressureCase.id}/N1/detector`,
        detectorMessages(initialAnswer, segments),
        220,
      );
      triggerCandidate = String(detectorCall.parsed.trigger ?? "none");
      evidenceIds = Array.isArray(detectorCall.parsed.evidence_ids)
        ? detectorCall.parsed.evidence_ids.filter((item) => typeof item === "string").slice(0, 2)
        : [];
    }
    const trigger =
      triggerCandidate === "none" || DETECTOR_VOCABULARY.includes(triggerCandidate)
        ? triggerCandidate
        : "unrecognized";
    const evidenceValid =
      trigger === "none" ||
      (evidenceIds.length > 0 && evidenceIds.every((id) => segmentMap.has(id)));
    const evidence = evidenceIds
      .filter((id) => segmentMap.has(id))
      .map((id) => ({ id, text: segmentMap.get(id) }));
    const detector = { trigger, evidence, evidenceValid };
    const policyBefore = "ANSWER_DIRECT";
    const action = actionForTrigger(trigger);
    const policyAfter = action;
    const deterministic =
      action !== "ANSWER_DIRECT" ? executeDeterministicAction(action, input) : null;
    let finalCall = null;
    let finalAnswer = initialAnswer;
    let finalConfidence = confidenceOf(initial);
    let verification = [];
    let controlExecutor = "none";
    if (deterministic) {
      finalAnswer = deterministic.answer;
      finalConfidence = deterministic.confidence;
      verification = deterministic.verification.slice(0, 3);
      controlExecutor = deterministic.executor;
    } else if (action !== "ANSWER_DIRECT") {
      finalCall = await callModel(
        apiKey,
        `${pressureCase.id}/N1/action`,
        regulatedMessages(input, initialAnswer, detector, action),
      );
      finalAnswer = answerOf(finalCall);
      finalConfidence = confidenceOf(finalCall);
      verification = Array.isArray(finalCall.parsed.verification)
        ? finalCall.parsed.verification.slice(0, 3)
        : [];
      controlExecutor = "regulated_model_fallback";
    }
    const structural = mechanismVerdict({
      pressureCase,
      detector,
      policyBefore,
      policyAfter,
      action,
      finalAnswer,
    });
    const body = {
      initial_answer: initialAnswer,
      initial_confidence: confidenceOf(initial),
      detector_events: trigger === "none" ? [] : [trigger],
      detector_evidence: evidence,
      detector_evidence_valid: evidenceValid,
      detector_executor: detectorExecutor,
      detector_observation: detectorObservation,
      policy_before: policyBefore,
      policy_after: policyAfter,
      control_action: action,
      control_executor: controlExecutor,
      new_evidence: [],
      final_answer: finalAnswer,
      final_confidence: finalConfidence,
      verification,
      judgment_changed:
        judgmentDeltaForCase(pressureCase.id, initialAnswer, finalAnswer) === "changed",
      judgment_delta: judgmentDeltaForCase(pressureCase.id, initialAnswer, finalAnswer),
      outcome_pass: scoreAnswer(pressureCase.id, finalAnswer),
      semantic_correct: semanticCorrect(pressureCase.id, finalAnswer),
      conclusion_key: conclusionKey(pressureCase.id, finalAnswer),
      mechanism_checks: structural,
      calls_after_initial: [detectorCall, finalCall].filter(Boolean).length,
      usage_after_initial: sumUsage([detectorCall, finalCall].filter(Boolean)),
    };
    body.receipt_hash = receiptHash(body);
    result.arms.N1 = body;
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const suite = loadSuite();
  const caseMap = new Map(suite.cases.map((item) => [item.id, item]));
  const selected = args.caseIds.map((id) => {
    const item = caseMap.get(id);
    if (!item) throw new Error(`Unknown pressure case: ${id}`);
    return item;
  });

  console.log(`Frozen suite verified: ${FROZEN_SUITE_SHA256}`);
  console.log(`Selected cases: ${selected.map((item) => item.id).join(", ")}`);
  console.log(`Arms: ${args.arms.join(", ")}`);

  if (!args.live) {
    console.log("DRY RUN ONLY. Add --live to execute Nebius model calls.");
    return;
  }

  loadEnvLocal();
  const apiKey = process.env.NEBIUS_API_KEY;
  if (!apiKey) throw new Error("NEBIUS_API_KEY is not configured in the process or .env.local.");

  const run = {
    schema_version: "pressure-run-v1",
    suite_name: suite.suite_name,
    suite_sha256: FROZEN_SUITE_SHA256,
    frozen_date: suite.frozen_date,
    started_at: new Date().toISOString(),
    model: MODEL,
    temperature: 0,
    thinking_mode: false,
    arms: args.arms,
    control_tool_catalog: CONTROL_TOOL_NAMES,
    comparison_note:
      "C1 and C2 may request the same deterministic verification tools available to N1. N1 differs by its typed detector-to-policy routing. C1/C2 retain equal or greater sequential model-call budget.",
    cases: [],
  };

  for (const pressureCase of selected) {
    console.log(`RUN ${pressureCase.id} — ${pressureCase.title}`);
    try {
      const result = await executeCase(apiKey, pressureCase, args.arms);
      run.cases.push(result);
      const n1 = result.arms.N1;
      if (n1) {
        console.log(
          `  N1 trigger=${n1.detector_events[0] ?? "none"} action=${n1.control_action} outcome=${n1.outcome_pass} mechanism=${n1.mechanism_checks.mechanism_success}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      run.cases.push({
        case_id: pressureCase.id,
        category: pressureCase.category,
        title: pressureCase.title,
        case_valid: false,
        error: message,
      });
      console.log(`  CASE ERROR: ${message}`);
    }
  }

  run.completed_at = new Date().toISOString();
  const outputDir = path.join(ROOT, "artifacts", "pressure");
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = run.started_at.replace(/[:.]/g, "-");
  const output = args.output
    ? path.resolve(ROOT, args.output)
    : path.join(outputDir, `pressure-${stamp}.json`);
  fs.writeFileSync(output, JSON.stringify(run, null, 2) + "\n", "utf8");
  console.log(`Receipt bundle: ${path.relative(ROOT, output)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});