import { runBattery } from "./battery";
import { calibrationError, runTrial } from "./engine";
import { CANONICAL } from "./trials";
import type { TraceEvent } from "./types";

function brief(events: TraceEvent[]): string[] {
  return events.map((e) => {
    if (e.type === "read") return `  read ${e.tier} ccg ${e.ccg.toFixed(2)} leader ${e.leader} gaps ${e.gaps}`;
    if (e.type === "action") return `  ${e.action}: ${e.title}`;
    if (e.type === "commit") return `  commit ${e.label} correct=${e.correct} conf ${e.confidence}`;
    if (e.type === "halt") return `  halt correct=${e.correct}`;
    return `  mono conf ${e.confidence.toFixed(2)}`;
  });
}

for (const trial of CANONICAL) {
  const run = runTrial(trial);
  console.log("\n==", trial.id, "==");
  console.log("BASE", run.baseline.outcome, "tok", run.baseline.tokens, "cost", run.baseline.cost.toFixed(4), "conf", run.baseline.confidence, "gaps", run.baseline.gaps);
  console.log(brief(run.baseline.events).join("\n"));
  console.log("ST", run.regulated.outcome, "tok", run.regulated.tokens, "cost", run.regulated.cost.toFixed(4), "int", run.regulated.interventions, "ccg", run.regulated.finalCcg, "gaps", run.regulated.gaps, "tier", run.regulated.finalTier);
  console.log(brief(run.regulated.events).join("\n"));
}

const runs = runBattery();
function summarize(arm: "baseline" | "regulated") {
  const rows = runs.map((r) => r[arm]);
  const n = rows.length;
  const acc = rows.filter((r) => r.correct).length / n;
  const falseC = rows.filter((r) => r.falseCertainty).length / n;
  const tokens = rows.reduce((s, r) => s + r.tokens, 0) / n;
  const cost = rows.reduce((s, r) => s + r.cost, 0) / n;
  const acquired = rows.filter((r) => r.acquired).length;
  const esc = rows.filter((r) => r.escalated).length;
  const de = rows.filter((r) => r.deescalated).length;
  const abstain = rows.filter((r) => r.outcome === "abstained").length;
  return { acc, falseC, ece: calibrationError(runs, arm), tokens, cost, acquired, esc, de, abstain };
}

console.log("\nBATTERY", runs.length);
console.log("baseline", summarize("baseline"));
console.log("regulated", summarize("regulated"));

const by = (c: string) => {
  const subset = runs.filter((r) => r.trial.condition === c);
  const b = subset.filter((r) => r.baseline.correct).length;
  const s = subset.filter((r) => r.regulated.correct).length;
  console.log(c, "n", subset.length, "base", b, "st", s);
};
for (const c of ["easy", "stale", "external", "underdetermined"]) by(c);