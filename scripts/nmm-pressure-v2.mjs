import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createTransport,
  initialJudgment,
  executePressureTrial,
  usageTotals,
  MODEL,
  REQUEST_CONFIGURATION,
  RUN_CONFIGURATION,
  CONTROL_TOOLS,
  failedCall,
  uniqueUsage,
} from "../src/lib/nmm/pressure-runtime.mjs";
import { CONTROLLER_VERSION } from "../src/lib/nmm/pressure-policy.mjs";
import {
  evaluateOutcome,
  mechanismChecks,
  digest,
  deterministicOutcome,
} from "./pressure-v2-evaluate.mjs";
const ROOT = process.cwd(),
  SUITE_SHA256 = "984dee433c337a3ccf737a6406f0fe79084234787804bcbbe88a9e0f77b463b4";
const SOURCE_FILES = [
  "src/lib/nmm/pressure-runtime.mjs",
  "src/lib/nmm/pressure-policy.mjs",
  "src/lib/nmm/pressure-detectors.mjs",
  "src/lib/nmm/pressure-actions.mjs",
  "scripts/nmm-pressure-v2.mjs",
  "scripts/pressure-v2-evaluate.mjs",
];
export function taskInputs(item) {
  if (Array.isArray(item.turns) && item.turns.length)
    return {
      input: item.turns[0].content,
      currentInput: item.turns.map((t, i) => `TURN ${i + 1}: ${t.content}`).join("\n"),
    };
  return { input: item.prompt, currentInput: item.prompt };
}
function args(argv) {
  const out = {
    live: false,
    cases: "PT-01,PT-02,PT-03,PT-04,PT-05,PT-06",
    arms: ["N1", "C0", "C1", "C2"],
    runId: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--live") out.live = true;
    else if (arg === "--cases") out.cases = argv[++i];
    else if (arg.startsWith("--cases=")) out.cases = arg.slice(8);
    else if (arg === "--arms") out.arms = argv[++i].split(",");
    else if (arg.startsWith("--arms=")) out.arms = arg.slice(7).split(",");
    else if (arg === "--run-id") out.runId = argv[++i];
    else throw new Error("Unsupported option " + arg);
  }
  if (
    !out.arms.length ||
    out.arms.some((a) => !["N1", "C0", "C1", "C2"].includes(a)) ||
    new Set(out.arms).size !== out.arms.length
  )
    throw new Error("Invalid arms");
  if (out.arms.includes("C1") && !out.arms.includes("N1"))
    throw new Error("C1 requires its paired N1 reference");
  out.arms = ["N1", "C0", "C1", "C2"].filter((a) => out.arms.includes(a));
  out.runId ??=
    "v2-" + new Date().toISOString().replace(/[:.]/g, "-") + "-" + crypto.randomUUID().slice(0, 8);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(out.runId)) throw new Error("Invalid run ID");
  return out;
}
async function seal(dir, name, body) {
  const bytes = JSON.stringify(body, null, 2) + "\n";
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name + ".json"), bytes, { flag: "wx" });
  await fs.writeFile(
    path.join(dir, name + ".SHA256.txt"),
    digest(bytes) + "  " + name + ".json\n",
    { flag: "wx" },
  );
  return digest(bytes);
}
export async function main(argv = process.argv.slice(2)) {
  const options = args(argv),
    suiteBytes = await fs.readFile(path.join(ROOT, "tests/pressure/nmm-pressure-suite.v1.json"));
  if (digest(suiteBytes) !== SUITE_SHA256)
    throw new Error("Frozen suite changed; no execution authorized");
  const suite = JSON.parse(suiteBytes),
    selected =
      options.cases === "all"
        ? suite.cases
        : options.cases.split(",").map((id) => suite.cases.find((c) => c.id === id));
  if (
    !selected.length ||
    selected.some((c) => !c) ||
    new Set(selected.map((c) => c.id)).size !== selected.length
  )
    throw new Error("Invalid case selection");
  const source_sha256 = Object.fromEntries(
    await Promise.all(
      SOURCE_FILES.map(async (f) => [f, digest(await fs.readFile(path.join(ROOT, f)))]),
    ),
  );
  const declaration = {
    schema: CONTROLLER_VERSION,
    run_id: options.runId,
    declared_at: new Date().toISOString(),
    model: MODEL,
    request_configuration: REQUEST_CONFIGURATION,
    run_configuration: RUN_CONFIGURATION,
    suite_sha256: SUITE_SHA256,
    source_sha256,
    cases: selected.map((c) => c.id),
    arms: options.arms,
    control_tool_catalog: CONTROL_TOOLS,
    commitment_boundary:
      "A binary model proposal after independently verified inconsistent premises is retained in model_final_answer and withheld by the controller; it is not a corrected model belief.",
    initial_judgment:
      "One real initial response per case, shared across all arms. Later-turn evidence is excluded until after that response.",
    order: "N1 precedes C1 to establish its numeric token reference; not randomized.",
    boundary:
      "Engineering validation on fixed synthetic cases. Actual inference-token matching is not FLOP equality. Model post-hoc judgment is not independent adjudication. NMM human-state coupling is outside this run.",
  };
  if (!options.live) {
    console.log("DECLARATION " + JSON.stringify(declaration, null, 2));
    return declaration;
  }
  const key = process.env.NEBIUS_API_KEY;
  if (!key) throw new Error("NEBIUS_API_KEY missing from process");
  const runDir = path.join(ROOT, ".secondthought/pressure-v2/runs", options.runId);
  await fs.mkdir(path.dirname(runDir), { recursive: true });
  await fs.mkdir(runDir);
  await seal(runDir, "declaration", declaration);
  const transport = createTransport(key),
    rows = [],
    billedCalls = [];
  let authFailed = false;
  for (const c of selected) {
    const task = taskInputs(c);
    let initial = null,
      initialFailure = null,
      reference = null;
    if (!authFailed) {
      try {
        initial = await initialJudgment(task.input, transport);
      } catch (error) {
        initialFailure = {
          code: error.code ?? "INITIAL_EXECUTION_FAILED",
          http_status: error.http_status ?? null,
          finish_reason: error.finish_reason ?? null,
          usage: error.usage ?? null,
          call: failedCall(error, "initial"),
        };
        if ([401, 403].includes(error.http_status)) authFailed = true;
      }
    }
    for (const arm of options.arms) {
      const dir = path.join(runDir, arm, c.id);
      await fs.mkdir(dir, { recursive: true });
      let receipt;
      if (!initial) {
        const calls = initialFailure?.call ? [{ ...initialFailure.call, shared: true }] : [];
        receipt = {
          ok: false,
          schema: CONTROLLER_VERSION,
          arm,
          failure: initialFailure ?? { code: "AUTHENTICATION_BLOCKED" },
          usage: calls,
          inference_usage_totals: usageTotals(calls),
        };
      } else if (authFailed) {
        receipt = {
          ok: false,
          schema: CONTROLLER_VERSION,
          arm,
          failure: { code: "AUTHENTICATION_BLOCKED" },
        };
      } else {
        receipt = await executePressureTrial({
          ...task,
          arm,
          transport,
          initialResponse: initial,
          referenceUsage: reference,
        });
      }
      if ([401, 403].includes(receipt.failure?.http_status)) authFailed = true;
      let evaluation = null;
      if (receipt.ok) {
        try {
          evaluation = await evaluateOutcome(c, receipt.final_answer, transport);
        } catch (error) {
          evaluation = {
            pass: null,
            source: "evaluation_failed",
            failure: {
              code: error.code ?? "EVALUATION_FAILED",
              http_status: error.http_status ?? null,
              finish_reason: error.finish_reason ?? null,
              usage: error.usage ?? null,
            },
            evaluation_usage: [failedCall(error, "posthoc-judge")],
          };
          if ([401, 403].includes(error.http_status)) authFailed = true;
        }
      }
      if (arm === "N1" && receipt.ok) reference = receipt.inference_usage_totals;
      billedCalls.push(...(receipt.usage ?? []), ...(evaluation?.evaluation_usage ?? []));
      const artifact = {
        ...receipt,
        case_id: c.id,
        case_sha256: digest(JSON.stringify(c)),
        run_id: options.runId,
        source_sha256,
        posthoc_evaluation: evaluation,
        mechanism_checks: arm === "N1" ? mechanismChecks(c, receipt, evaluation) : null,
      };
      const sha256 = await seal(dir, "receipt", artifact);
      const row = {
        case_id: c.id,
        arm,
        status: receipt.ok ? "completed" : "failed",
        outcome_pass: evaluation?.pass ?? null,
        evaluation_source: evaluation?.source ?? null,
        mechanism_success: artifact.mechanism_checks?.mechanism_success ?? null,
        policy_after: receipt.policy_after ?? null,
        initial_correct: deterministicOutcome(c.id, receipt.initial_answer)?.pass ?? null,
        judgment_changed: receipt.judgment_delta?.answer_changed ?? null,
        commitment_state: receipt.commitment_state ?? null,
        model_proposal_outcome: receipt.model_final_answer
          ? (deterministicOutcome(c.id, receipt.model_final_answer)?.pass ?? null)
          : null,
        compute_match: receipt.compute_match ?? null,
        usage: receipt.inference_usage_totals ?? null,
        failure: receipt.failure ?? null,
        sha256,
      };
      rows.push(row);
      console.log(
        `${c.id} ${arm} status=${row.status} outcome=${row.outcome_pass} mechanism=${row.mechanism_success} matched=${row.compute_match?.matched ?? "-"}`,
      );
    }
  }
  const summary = {
    ...declaration,
    completed_at: new Date().toISOString(),
    scheduled: rows.length,
    unique_observed_usage: uniqueUsage(billedCalls),
    completed: rows.filter((r) => r.status === "completed").length,
    outcome_pass: rows.filter((r) => r.outcome_pass === true).length,
    controller_withheld: rows.filter((r) => r.commitment_state === "controller_withheld").length,
    n1_mechanism_pass: rows.filter((r) => r.arm === "N1" && r.mechanism_success).length,
    c1_matched: rows.filter((r) => r.arm === "C1" && r.compute_match?.matched).length,
    rows,
  };
  await seal(runDir, "summary", summary);
  console.log("SUMMARY_PATH " + path.join(runDir, "summary.json"));
  if (
    rows.some(
      (r) =>
        r.status !== "completed" ||
        r.evaluation_source === "evaluation_failed" ||
        (r.arm === "C1" && !r.compute_match?.matched),
    )
  )
    process.exitCode = 1;
  return summary;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error.code ?? error.message);
    process.exitCode = 1;
  });