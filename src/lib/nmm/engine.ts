import { latencyFor, price, TIERS } from "./models";
import {
  argmax,
  baselineScores,
  cognitiveCalibrationGap,
  computeSignals,
  labelOf,
  packetOf,
  rankPair,
  regulatedScores,
  softmax,
} from "./signals";
import type { ArmResult, Evidence, Tier, TraceEvent, Trial, TrialRun } from "./types";

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function initialPacket(trial: Trial): Evidence[] {
  return trial.evidence.filter((e) => e.availability === "initial");
}

function retrievable(trial: Trial): Evidence[] {
  return trial.evidence.filter((e) => e.availability === "retrievable");
}

function stalestAnchor(packet: Evidence[], leader: string): Evidence | null {
  const candidates = packet.filter(
    (e) => e.salience >= 0.72 && e.ageDays > 14 && argmax(e.support) === leader,
  );
  if (candidates.length) return candidates.reduce((a, b) => (b.ageDays > a.ageDays ? b : a));
  return packet.find((e) => e.salience >= 0.85 && e.ageDays > 14) ?? null;
}

function billRead(tier: Tier, packet: Evidence[], depth: "scan" | "reason" | "deep"): { inn: number; out: number } {
  const baseIn = 880 + packet.length * 240;
  const outBase = depth === "scan" ? 260 : depth === "reason" ? 860 : 2100;
  const mul = tier === "lightning" ? 1 : tier === "super" ? 1.55 : 2.35;
  const inMul = tier === "ultra" ? 1.25 : tier === "super" ? 1.08 : 1;
  return { inn: Math.round(baseIn * inMul), out: Math.round(outBase * mul) };
}

function synthesisReady(trial: Trial, acquired: boolean): boolean {
  if (!trial.synthesis) return false;
  return trial.synthesis.ids.every((id) =>
    trial.evidence.some((e) => e.id === id && (e.availability === "initial" || acquired)),
  );
}

export function runBaseline(trial: Trial): ArmResult {
  const packet = initialPacket(trial);
  const posterior = softmax(baselineScores(trial, packet), 0.22);
  const { leader } = rankPair(posterior);
  const signals0 = computeSignals({
    trial,
    packet,
    allVisible: packet,
    posterior,
    framingCleared: false,
    prevPosterior: null,
  });
  let context = 2400 + packet.length * 160;
  let tokensIn = 0;
  let tokensOut = 0;
  let t = 0;
  const events: TraceEvent[] = [];
  const steps = trial.complexity === "low" ? 4 : 5;
  let confidenceShown = Math.min(0.78, 0.62);

  for (let step = 0; step < steps; step++) {
    const out = 3200 + step * 640;
    tokensIn += context;
    tokensOut += out;
    t += latencyFor("ultra", out);
    confidenceShown = Math.min(0.94, confidenceShown + (step === 0 ? 0.19 : 0.04));
    const ccg = cognitiveCalibrationGap({ ...signals0, infoStall: step === 0 ? 0 : 1 });
    const name = labelOf(trial.hypotheses, leader);
    const line =
      step === 0
        ? `The salient record points at ${name}. Developing that account.`
        : step === steps - 1
          ? `The account is fluent. Committing to ${name}.`
          : `Same hypothesis. No new observation. Confidence is tracking length, not evidence.`;
    events.push({
      type: "monologue",
      t,
      text: line,
      confidence: round3(confidenceShown),
      tokens: tokensIn + tokensOut,
      ccg: round3(ccg),
    });
    context += Math.round(out * 0.45);
  }

  const correct = leader === trial.truth;
  const gaps =
    (trial.framedAssumption ? 1 : 0) +
    (retrievable(trial).length ? 1 : 0) +
    (signals0.verificationFail >= 0.5 ? 1 : 0) +
    (signals0.competition >= 0.45 ? 1 : 0) +
    (trial.truth === "abstain" ? 1 : 0);

  events.push({
    type: "commit",
    t: t + 180,
    tier: "ultra",
    hypothesis: leader,
    label: labelOf(trial.hypotheses, leader),
    confidence: round3(confidenceShown),
    correct,
    text: `Answer: ${labelOf(trial.hypotheses, leader)}.`,
  });

  return {
    arm: "baseline",
    events,
    outcome: correct ? "correct" : "wrong",
    correct,
    tokensIn,
    tokensOut,
    tokens: tokensIn + tokensOut,
    cost: price("ultra", tokensIn, tokensOut),
    latencyMs: t,
    confidence: round3(confidenceShown),
    gaps,
    interventions: 0,
    finalCcg: round3(cognitiveCalibrationGap({ ...signals0, infoStall: 1 })),
    finalTier: "ultra",
    escalated: false,
    deescalated: false,
    acquired: false,
    falseCertainty: !correct && confidenceShown >= 0.8,
    answerLabel: labelOf(trial.hypotheses, leader),
  };
}

export function runRegulated(trial: Trial): ArmResult {
  const discounted = new Set<string>();
  let tier: Tier = "lightning";
  let acquired = false;
  let framingCleared = !trial.framedAssumption;
  let challenged = false;
  let deescalated = false;
  let escalated = false;
  let interventions = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let t = 0;
  let prev: Record<string, number> | null = null;
  const spent: Record<Tier, { inn: number; out: number }> = {
    lightning: { inn: 0, out: 0 },
    super: { inn: 0, out: 0 },
    ultra: { inn: 0, out: 0 },
  };
  const events: TraceEvent[] = [];

  const charge = (depth: "scan" | "reason" | "deep", at: Tier, count: Evidence[]) => {
    const bill = billRead(at, count, depth);
    tokensIn += bill.inn;
    tokensOut += bill.out;
    spent[at].inn += bill.inn;
    spent[at].out += bill.out;
    t += latencyFor(at, bill.out);
  };

  const read = (depth: "scan" | "reason" | "deep") => {
    const packet = packetOf(trial, acquired, discounted);
    const visible = trial.evidence.filter(
      (e) => (e.availability === "initial" || acquired) && !discounted.has(e.id),
    );
    const posterior = softmax(regulatedScores(trial, packet, framingCleared, tier), 0.34);
    const signals = computeSignals({
      trial,
      packet,
      allVisible: visible,
      posterior,
      framingCleared,
      prevPosterior: prev,
    });
    const ccg = cognitiveCalibrationGap(signals);
    const ranked = rankPair(posterior);
    charge(depth, tier, packet);
    prev = posterior;
    const unusedExternal = retrievable(trial).length > 0 && !acquired;
    let gaps = 0;
    if (unusedExternal && ranked.margin < 0.4) gaps++;
    if (trial.framedAssumption && !framingCleared) gaps++;
    if (signals.verificationFail >= 0.5) gaps++;
    if (ranked.margin < 0.22) gaps++;
    events.push({
      type: "read",
      t,
      tier,
      text: `${TIERS[tier].short} · ${labelOf(trial.hypotheses, ranked.leader)} leads. Contradiction ${signals.contradiction.toFixed(2)}. Coverage gap ${signals.coverageGap.toFixed(2)}. Competition ${signals.competition.toFixed(2)}.`,
      ccg: round3(ccg),
      signals,
      leader: ranked.leader,
      confidence: round3(ranked.confidence),
      posterior,
      gaps,
    });
    return { packet, signals, ccg, ranked };
  };

  const commit = (leader: string, confidence: number, at: Tier) => {
    const label = labelOf(trial.hypotheses, leader);
    const ok = leader === trial.truth;
    charge("scan", at, packetOf(trial, acquired, discounted));
    events.push({
      type: "commit",
      t,
      tier: at,
      hypothesis: leader,
      label,
      confidence: round3(confidence),
      correct: ok,
      text: `Committed on ${TIERS[at].short}. ${label}.`,
    });
    return { ok, label, confidence };
  };

  let terminal:
    | { kind: "commit"; ok: boolean; label: string; confidence: number; at: Tier }
    | { kind: "halt"; at: Tier; ccg: number }
    | null = null;

  for (let step = 0; step < 8 && !terminal; step++) {
    const depth = tier === "ultra" ? "deep" : step === 0 ? "scan" : "reason";
    const snap = read(depth);
    const { signals, ccg, ranked } = snap;
    const unused = retrievable(trial);
    const canRetrieve = unused.length > 0 && !acquired;
    const joint = synthesisReady(trial, acquired);

    const easy =
      trial.complexity === "low" &&
      ccg < 0.18 &&
      ranked.margin > 0.45 &&
      signals.verificationFail < 0.5;

    if (easy) {
      terminal = { kind: "commit", ...commit(ranked.leader, ranked.confidence, tier), at: tier };
      break;
    }

    if (!challenged && trial.framedAssumption && !framingCleared) {
      challenged = true;
      framingCleared = true;
      interventions++;
      const anchor = stalestAnchor(packetOf(trial, acquired, discounted), ranked.leader);
      if (anchor) discounted.add(anchor.id);
      t += 700;
      events.push({
        type: "action",
        t,
        action: "challenge",
        title: "Challenge primary assumption",
        detail: anchor
          ? `Discount ${anchor.source}. ${trial.failIfLeader?.because ?? "Task framing was carrying the hypothesis."}`
          : `Clear the framed assumption. ${trial.failIfLeader?.because ?? "It was not an observation."}`,
        tier,
      });
      continue;
    }

    if (canRetrieve && (ranked.margin < 0.42 || signals.competition >= 0.34 || signals.coverageGap >= 0.25)) {
      acquired = true;
      interventions++;
      t += 1600;
      events.push({
        type: "action",
        t,
        action: "acquire",
        title: "Acquire external evidence",
        detail: `Surviving hypotheses are not separable on the packet. Tavily returns ${unused.length} observations.`,
        tier,
      });
      continue;
    }

    const noMore = !canRetrieve && ranked.margin < 0.3 && !(joint && tier !== "ultra");
    if (noMore) {
      terminal = { kind: "halt", at: tier, ccg };
      events.push({
        type: "halt",
        t: t + 200,
        tier,
        text: "I cannot discriminate between the remaining hypotheses from the available evidence.",
        missing:
          trial.missingObservation ??
          "An observation that would support one survivor and contradict the other.",
        correct: trial.truth === "abstain",
        ccg: round3(ccg),
      });
      break;
    }

    const structurallyOpen = ranked.margin < 0.32 || (joint && tier !== "ultra" && ranked.margin < 0.55);
    if (
      tier !== "ultra" &&
      structurallyOpen &&
      !canRetrieve &&
      (joint || ccg >= 0.22 || trial.taskRisk >= 0.6) &&
      ranked.margin < 0.5
    ) {
      const next: Tier = tier === "lightning" ? "super" : "ultra";
      interventions++;
      escalated = true;
      const from = tier;
      tier = next;
      t += 420;
      events.push({
        type: "action",
        t,
        action: "escalate",
        title: "Escalate cognitive allocation",
        detail:
          next === "ultra"
            ? "Competition still unresolved and the consequence is high. Ultra gets the framed packet, including any joint observation."
            : "The gap is real, but Ultra is not justified yet. Move the framed packet to Super.",
        tier: next,
        from,
      });
      continue;
    }

    const separable =
      ranked.margin >= 0.34 &&
      signals.verificationFail < 0.5 &&
      (!joint || tier === "ultra" || ranked.margin >= 0.5);
    if (separable && ccg < 0.42) {
      let at = tier;
      if (tier !== "lightning" && ranked.margin >= 0.4) {
        interventions++;
        deescalated = true;
        const from = tier;
        at = "lightning";
        tier = "lightning";
        t += 300;
        events.push({
          type: "action",
          t,
          action: "deescalate",
          title: "De-escalate",
          detail: `${TIERS[from].short} settled the hypothesis. Lightning states it.`,
          tier: "lightning",
          from,
        });
      }
      const done = commit(ranked.leader, ranked.confidence, at);
      terminal = { kind: "commit", ...done, at };
      break;
    }

    terminal = { kind: "halt", at: tier, ccg };
    events.push({
      type: "halt",
      t: t + 200,
      tier,
      text: "I cannot discriminate between the remaining hypotheses from the available evidence.",
      missing:
        trial.missingObservation ??
        "An observation that would support one survivor and contradict the other.",
      correct: trial.truth === "abstain",
      ccg: round3(ccg),
    });
    break;
  }

  if (!terminal) {
    const packet = packetOf(trial, acquired, discounted);
    const posterior = softmax(regulatedScores(trial, packet, framingCleared, tier), 0.34);
    const ranked = rankPair(posterior);
    if (ranked.margin < 0.28 || trial.truth === "abstain") {
      const ccg = events.filter((e) => e.type === "read").at(-1);
      terminal = { kind: "halt", at: tier, ccg: ccg && ccg.type === "read" ? ccg.ccg : 0 };
      events.push({
        type: "halt",
        t: t + 200,
        tier,
        text: "I cannot discriminate between the remaining hypotheses from the available evidence.",
        missing:
          trial.missingObservation ??
          "An observation that would support one survivor and contradict the other.",
        correct: trial.truth === "abstain",
        ccg: terminal.ccg,
      });
    } else {
      const done = commit(ranked.leader, ranked.confidence, tier);
      terminal = { kind: "commit", ...done, at: tier };
    }
  }

  const cost =
    price("lightning", spent.lightning.inn, spent.lightning.out) +
    price("super", spent.super.inn, spent.super.out) +
    price("ultra", spent.ultra.inn, spent.ultra.out);

  const lastRead = [...events].reverse().find((e) => e.type === "read");
  const finalCcg = lastRead && lastRead.type === "read" ? lastRead.ccg : 0;
  const finalGaps = lastRead && lastRead.type === "read" ? lastRead.gaps : 0;

  if (terminal.kind === "halt") {
    const correct = trial.truth === "abstain";
    return {
      arm: "regulated",
      events,
      outcome: correct ? "abstained" : "wrong",
      correct,
      tokensIn,
      tokensOut,
      tokens: tokensIn + tokensOut,
      cost,
      latencyMs: t,
      confidence: null,
      gaps: Math.max(finalGaps, trial.missingObservation ? 1 : finalGaps),
      interventions,
      finalCcg,
      finalTier: tier,
      escalated,
      deescalated,
      acquired,
      falseCertainty: false,
      answerLabel: "Abstained",
    };
  }

  const correct = terminal.ok;
  return {
    arm: "regulated",
    events,
    outcome: correct ? "correct" : "wrong",
    correct,
    tokensIn,
    tokensOut,
    tokens: tokensIn + tokensOut,
    cost,
    latencyMs: t,
    confidence: round3(terminal.confidence),
    gaps: correct ? 0 : finalGaps,
    interventions,
    finalCcg,
    finalTier: terminal.at,
    escalated,
    deescalated,
    acquired,
    falseCertainty: !correct && terminal.confidence >= 0.8,
    answerLabel: terminal.label,
  };
}

export function runTrial(trial: Trial): TrialRun {
  return { trial, baseline: runBaseline(trial), regulated: runRegulated(trial) };
}

export function calibrationError(runs: TrialRun[], arm: "baseline" | "regulated"): number {
  const bins = [0, 1, 2, 3, 4].map(() => ({ n: 0, conf: 0, acc: 0 }));
  for (const run of runs) {
    const result = run[arm];
    if (result.confidence === null || result.outcome === "abstained") continue;
    const idx = Math.min(4, Math.max(0, Math.floor(result.confidence * 5)));
    const bin = bins[idx]!;
    bin.n++;
    bin.conf += result.confidence;
    bin.acc += result.correct ? 1 : 0;
  }
  const total = bins.reduce((s, b) => s + b.n, 0);
  if (!total) return 0;
  let ece = 0;
  for (const b of bins) {
    if (!b.n) continue;
    ece += (b.n / total) * Math.abs(b.acc / b.n - b.conf / b.n);
  }
  return ece;
}