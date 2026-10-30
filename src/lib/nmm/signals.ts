import { ccgFromSignals } from "./pressure-policy.mjs";
import type { Evidence, Hypothesis, Signals, Trial } from "./types";

export const WEIGHTS: { key: keyof Signals; label: string; w: number }[] = [
  { key: "contradiction", label: "Contradiction", w: 0.2 },
  { key: "coverageGap", label: "Coverage gap", w: 0.16 },
  { key: "assumptions", label: "Unresolved assumptions", w: 0.1 },
  { key: "instability", label: "Answer instability", w: 0.1 },
  { key: "evidenceAge", label: "Evidence age", w: 0.08 },
  { key: "competition", label: "Hypothesis competition", w: 0.16 },
  { key: "taskRisk", label: "Task risk", w: 0.08 },
  { key: "verificationFail", label: "Failed verification", w: 0.06 },
  { key: "infoStall", label: "No information gain", w: 0.06 },
];

export function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function recency(ageDays: number): number {
  return Math.exp(-ageDays / 18);
}

export function argmax(scores: Record<string, number>): string {
  let best = "";
  let v = -Infinity;
  for (const [k, val] of Object.entries(scores)) {
    if (val > v) {
      v = val;
      best = k;
    }
  }
  return best;
}

export function softmax(scores: Record<string, number>, temp: number): Record<string, number> {
  const ids = Object.keys(scores);
  let max = -Infinity;
  for (const id of ids) max = Math.max(max, scores[id] ?? 0);
  const exps = ids.map((id) => Math.exp(((scores[id] ?? 0) - max) / temp));
  const z = exps.reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(ids.map((id, i) => [id, exps[i]! / z]));
}

export function rankPair(posterior: Record<string, number>): {
  leader: string;
  second: string;
  margin: number;
  confidence: number;
} {
  const ranked = Object.entries(posterior).sort((a, b) => b[1] - a[1]);
  const leader = ranked[0]?.[0] ?? "";
  const second = ranked[1]?.[0] ?? "";
  const p1 = ranked[0]?.[1] ?? 0;
  const p2 = ranked[1]?.[1] ?? 0;
  return { leader, second, margin: p1 - p2, confidence: p1 };
}

function favorite(support: Record<string, number>): string {
  return argmax(support);
}

export function packetOf(
  trial: Trial,
  acquired: boolean,
  discounted: ReadonlySet<string>,
): Evidence[] {
  return trial.evidence.filter((e) => {
    if (discounted.has(e.id)) return false;
    if (e.availability === "retrievable" && !acquired) return false;
    return true;
  });
}

export function regulatedScores(
  trial: Trial,
  packet: Evidence[],
  framingCleared: boolean,
  tier: "lightning" | "super" | "ultra",
): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const h of trial.hypotheses) scores[h.id] = 0.05;
  for (const e of packet) {
    const w = recency(e.ageDays);
    for (const h of trial.hypotheses) {
      scores[h.id] = (scores[h.id] ?? 0) + w * (e.support[h.id] ?? 0);
    }
  }
  if (!framingCleared && trial.framedAssumption && scores[trial.framedAssumption] !== undefined) {
    scores[trial.framedAssumption] += 1.55;
  }
  const syn = trial.synthesis;
  if (syn && syn.ids.every((id) => packet.some((e) => e.id === id))) {
    if (tier === "super") scores[syn.favors] = (scores[syn.favors] ?? 0) + 0.22;
    if (tier === "ultra") scores[syn.favors] = (scores[syn.favors] ?? 0) + 1.15;
  }
  return scores;
}

export function baselineScores(trial: Trial, packet: Evidence[]): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const h of trial.hypotheses) scores[h.id] = 0.02;
  for (const e of packet) {
    for (const h of trial.hypotheses) {
      scores[h.id] = (scores[h.id] ?? 0) + e.salience * (e.support[h.id] ?? 0);
    }
  }
  if (packet.length) {
    const anchor = packet.reduce((a, b) => (b.salience > a.salience ? b : a));
    const favored = favorite(anchor.support);
    if (scores[favored] !== undefined) scores[favored] += 0.9 * anchor.salience;
  }
  return scores;
}

function pairConflict(a: Evidence, b: Evidence): number {
  const fa = favorite(a.support);
  const fb = favorite(b.support);
  if (!fa || !fb || fa === fb) return 0;
  return Math.min(a.support[fa] ?? 0, b.support[fb] ?? 0);
}

function probeLeader(
  trial: Trial,
  packet: Evidence[],
  dropId: string | null,
  framingCleared: boolean,
): string {
  const kept = dropId ? packet.filter((e) => e.id !== dropId) : packet;
  return argmax(softmax(regulatedScores(trial, kept, framingCleared, "lightning"), 0.33));
}

export function computeSignals(args: {
  trial: Trial;
  packet: Evidence[];
  allVisible: Evidence[];
  posterior: Record<string, number>;
  framingCleared: boolean;
  prevPosterior: Record<string, number> | null;
}): Signals {
  const { trial, packet, allVisible, posterior, framingCleared, prevPosterior } = args;
  const { leader, margin } = rankPair(posterior);

  let conflictSum = 0;
  let pairs = 0;
  for (let i = 0; i < allVisible.length; i++) {
    for (let j = i + 1; j < allVisible.length; j++) {
      conflictSum += pairConflict(allVisible[i]!, allVisible[j]!);
      pairs++;
    }
  }
  const contradiction = clamp01(pairs ? (conflictSum / pairs) * 1.35 : 0);

  const have = packet.reduce((s, e) => s + recency(e.ageDays) * (e.support[leader] ?? 0), 0);
  const coverageGap = clamp01(1 - have / 0.82);

  let assumptionCount = 0;
  if (!framingCleared && trial.framedAssumption && trial.framedAssumption === leader)
    assumptionCount += 1;
  for (const e of packet) {
    if (e.salience >= 0.8 && e.ageDays > 20 && favorite(e.support) === leader) assumptionCount += 1;
  }
  const assumptions = clamp01(assumptionCount / 2);

  const probes = [
    packet.length ? packet.reduce((a, b) => (b.salience > a.salience ? b : a)).id : null,
    packet.length ? packet.reduce((a, b) => (b.ageDays < a.ageDays ? b : a)).id : null,
    packet.length ? packet.reduce((a, b) => (b.ageDays > a.ageDays ? b : a)).id : null,
  ];
  let flips = 0;
  let ran = 0;
  for (const id of probes) {
    if (!id) continue;
    ran++;
    if (probeLeader(trial, packet, id, framingCleared) !== leader) flips++;
  }
  const instability = ran ? flips / ran : 0;

  const supporting = packet.filter((e) => (e.support[leader] ?? 0) >= 0.25);
  const meanAge = supporting.length
    ? supporting.reduce((s, e) => s + e.ageDays, 0) / supporting.length
    : 0;
  const evidenceAge = clamp01(meanAge / 40);

  const competition = clamp01(1 - margin);

  const verificationFail = trial.failIfLeader && trial.failIfLeader.hypothesis === leader ? 1 : 0;

  let infoStall = 0;
  if (prevPosterior) {
    let kl = 0;
    for (const h of trial.hypotheses) {
      const p = Math.max(posterior[h.id] ?? 0, 1e-6);
      const q = Math.max(prevPosterior[h.id] ?? 0, 1e-6);
      kl += p * Math.log(p / q);
    }
    infoStall = kl < 0.015 ? 1 : 0;
  }

  return {
    contradiction,
    coverageGap,
    assumptions,
    instability,
    evidenceAge,
    competition,
    taskRisk: clamp01(trial.taskRisk),
    verificationFail,
    infoStall,
  };
}

export function cognitiveCalibrationGap(signals: Signals): number {
  return ccgFromSignals(signals);
}

export function evidenceGaps(signals: Signals, unresolvedExternal: boolean): number {
  let g = 0;
  if (signals.contradiction >= 0.22) g++;
  if (signals.coverageGap >= 0.34) g++;
  if (signals.competition >= 0.42) g++;
  if (signals.verificationFail >= 0.5) g++;
  if (unresolvedExternal) g++;
  return g;
}

export function labelOf(hypotheses: Hypothesis[], id: string): string {
  return hypotheses.find((h) => h.id === id)?.label ?? id;
}