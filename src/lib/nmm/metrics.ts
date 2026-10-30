import { calibrationError } from "./engine";
import type { Tier, TrialRun } from "./types";

export type ArmSummary = {
  accuracy: number;
  falseCertainty: number;
  ece: number;
  meanTokens: number;
  meanCost: number;
  meanLatency: number;
  acquisitions: number;
  escalations: number;
  deescalations: number;
  abstentions: number;
  falseCertaintyCount: number;
};

export type LabReport = {
  n: number;
  baseline: ArmSummary;
  regulated: ArmSummary;
  interventionSuccess: number;
  costRatio: number;
  tokenRatio: number;
  byCondition: { condition: string; n: number; baseline: number; regulated: number }[];
  highestTier: Record<Tier, number>;
};

const TIER_RANK: Record<Tier, number> = { lightning: 0, super: 1, ultra: 2 };

function arm(runs: TrialRun[], which: "baseline" | "regulated"): ArmSummary {
  const rows = runs.map((r) => r[which]);
  const n = rows.length || 1;
  return {
    accuracy: rows.filter((r) => r.correct).length / n,
    falseCertainty: rows.filter((r) => r.falseCertainty).length / n,
    falseCertaintyCount: rows.filter((r) => r.falseCertainty).length,
    ece: calibrationError(runs, which),
    meanTokens: rows.reduce((s, r) => s + r.tokens, 0) / n,
    meanCost: rows.reduce((s, r) => s + r.cost, 0) / n,
    meanLatency: rows.reduce((s, r) => s + r.latencyMs, 0) / n,
    acquisitions: rows.filter((r) => r.acquired).length,
    escalations: rows.filter((r) => r.escalated).length,
    deescalations: rows.filter((r) => r.deescalated).length,
    abstentions: rows.filter((r) => r.outcome === "abstained").length,
  };
}

export function summarize(runs: TrialRun[]): LabReport {
  const n = runs.length || 1;
  const baseline = arm(runs, "baseline");
  const regulated = arm(runs, "regulated");
  const rescued = runs.filter((r) => r.regulated.correct && !r.baseline.correct).length;
  const opportunities = runs.filter((r) => !r.baseline.correct).length || 1;
  const highestTier: Record<Tier, number> = { lightning: 0, super: 0, ultra: 0 };
  for (const run of runs) {
    let best: Tier = "lightning";
    for (const event of run.regulated.events) {
      if (!("tier" in event)) continue;
      if (TIER_RANK[event.tier] > TIER_RANK[best]) best = event.tier;
    }
    highestTier[best]++;
  }
  const conditions = ["easy", "stale", "external", "underdetermined"] as const;
  return {
    n,
    baseline,
    regulated,
    interventionSuccess: rescued / opportunities,
    costRatio: baseline.meanCost > 0 ? regulated.meanCost / baseline.meanCost : 1,
    tokenRatio: baseline.meanTokens > 0 ? regulated.meanTokens / baseline.meanTokens : 1,
    byCondition: conditions.map((condition) => {
      const subset = runs.filter((r) => r.trial.condition === condition);
      return {
        condition,
        n: subset.length,
        baseline: subset.filter((r) => r.baseline.correct).length,
        regulated: subset.filter((r) => r.regulated.correct).length,
      };
    }),
    highestTier,
  };
}