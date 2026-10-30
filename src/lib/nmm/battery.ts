import { runTrial } from "./engine";
import type { Evidence, Trial, TrialRun } from "./types";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function support(rng: () => number, strong: number, weak: number): [number, number] {
  return [strong + (rng() - 0.5) * 0.06, weak + (rng() - 0.5) * 0.04];
}

export function buildBattery(seed = 4407): Trial[] {
  const rng = mulberry32(seed);
  const trials: Trial[] = [];

  for (let i = 0; i < 16; i++) {
    const [s, w] = support(rng, 0.9, 0.08);
    const evidence: Evidence[] = [
      {
        id: `e-${i}-a`,
        source: "Primary log",
        text: "A fresh observation matches one hypothesis and barely touches the other.",
        ageDays: 0,
        salience: 0.5 + rng() * 0.2,
        support: { truth: s, other: w },
        availability: "initial",
      },
      {
        id: `e-${i}-b`,
        source: "Second log",
        text: "A second fresh observation agrees.",
        ageDays: 1,
        salience: 0.3,
        support: { truth: 0.72, other: 0.1 },
        availability: "initial",
      },
    ];
    trials.push({
      id: `easy-${i}`,
      title: `Easy ${i + 1}`,
      kicker: "Low complexity",
      question: "Which of the two recorded causes is active?",
      brief: "Coverage is already high. Contradiction is absent.",
      hypotheses: [
        { id: "truth", label: "Recorded cause" },
        { id: "other", label: "Alternative cause" },
      ],
      evidence,
      truth: "truth",
      complexity: "low",
      taskRisk: 0.15,
      condition: "easy",
    });
  }

  for (let i = 0; i < 16; i++) {
    trials.push({
      id: `stale-${i}`,
      title: `Stale anchor ${i + 1}`,
      kicker: "False salience",
      question: "The brief suggests a dramatic cause. What actually holds?",
      brief: "A stale, highly salient note frames the task. A quiet fresh observation points elsewhere, and the dramatic cause fails a magnitude check.",
      hypotheses: [
        { id: "drama", label: "Dramatic cause" },
        { id: "quiet", label: "Quiet cause" },
      ],
      truth: "quiet",
      complexity: "medium",
      taskRisk: 0.55,
      framedAssumption: "drama",
      failIfLeader: {
        hypothesis: "drama",
        because: "The dramatic cause predicts a magnitude the fresh tally does not show.",
      },
      condition: "stale",
      evidence: [
        {
          id: `s-${i}-old`,
          source: "Old bulletin",
          text: "A dramatic warning, weeks old, with no start condition.",
          ageDays: 36 + Math.floor(rng() * 10),
          salience: 0.92,
          support: { drama: 0.9, quiet: 0.05 },
          availability: "initial",
        },
        {
          id: `s-${i}-new`,
          source: "Fresh tally",
          text: "A low-salience measurement supports the quiet cause and misses the dramatic one.",
          ageDays: 1,
          salience: 0.22,
          support: { drama: 0.08, quiet: 0.86 },
          availability: "initial",
        },
      ],
    });
  }

  for (let i = 0; i < 16; i++) {
    trials.push({
      id: `ext-${i}`,
      title: `External ${i + 1}`,
      kicker: "Missing evidence",
      question: "Two hypotheses survive the initial packet. Which one is it?",
      brief: "The initial packet cannot separate them. Two retrievable notes entail the answer only when read together.",
      hypotheses: [
        { id: "left", label: "Left hypothesis" },
        { id: "right", label: "Right hypothesis" },
      ],
      truth: "right",
      complexity: "high",
      taskRisk: 0.74,
      framedAssumption: "left",
      synthesis: {
        ids: [`x-${i}-1`, `x-${i}-2`],
        favors: "right",
        note: "Each note is incomplete. Jointly they identify the right hypothesis.",
      },
      condition: "external",
      failIfLeader: {
        hypothesis: "left",
        because: "The framing note is older than the window it claims to explain.",
      },
      evidence: [
        {
          id: `x-${i}-frame`,
          source: "Intake note",
          text: "The ticket arrived already naming the left hypothesis.",
          ageDays: 20,
          salience: 0.9,
          support: { left: 0.7, right: 0.2 },
          availability: "initial",
        },
        {
          id: `x-${i}-split`,
          source: "Partial log",
          text: "A partial log supports both hypotheses almost evenly.",
          ageDays: 2,
          salience: 0.35,
          support: { left: 0.48, right: 0.48 },
          availability: "initial",
        },
        {
          id: `x-${i}-1`,
          source: "Retrieved note A",
          text: "Names a feature, not a place.",
          ageDays: 1,
          salience: 0.2,
          support: { left: 0.16, right: 0.24 },
          availability: "retrievable",
        },
        {
          id: `x-${i}-2`,
          source: "Retrieved note B",
          text: "Names a place, not a feature.",
          ageDays: 1,
          salience: 0.2,
          support: { left: 0.14, right: 0.22 },
          availability: "retrievable",
        },
      ],
    });
  }

  for (let i = 0; i < 16; i++) {
    const lean = 0.62 + rng() * 0.04;
    trials.push({
      id: `halt-${i}`,
      title: `Halt ${i + 1}`,
      kicker: "Underdetermined",
      question: "Which of the two simultaneous changes is causal?",
      brief: "Symmetric evidence. Nothing outside the packet can break it. One observation would.",
      hypotheses: [
        { id: "a", label: "Change A" },
        { id: "b", label: "Change B" },
      ],
      truth: "abstain",
      complexity: "high",
      taskRisk: 0.66,
      missingObservation: "A crossed control that applies change A without change B, or the reverse.",
      condition: "underdetermined",
      evidence: [
        {
          id: `h-${i}-a`,
          source: "Note A",
          text: "Change A is out of family. No control shows it reaches the failure.",
          ageDays: 1,
          salience: 0.7,
          support: { a: lean, b: 0.28 },
          availability: "initial",
        },
        {
          id: `h-${i}-b`,
          source: "Note B",
          text: "Change B is also out of family, with the same gap.",
          ageDays: 1,
          salience: 0.64,
          support: { a: 0.28, b: lean },
          availability: "initial",
        },
      ],
    });
  }

  return trials;
}

export function runBattery(seed = 4407): TrialRun[] {
  return buildBattery(seed).map(runTrial);
}