import type { Tier } from "./types";

/** Published Token Factory list prices and listed endpoint throughput. */
export const TIERS: Record<
  Tier,
  {
    id: string;
    name: string;
    short: string;
    params: string;
    context: string;
    inPerM: number;
    outPerM: number;
    tokPerSec: number;
    role: string;
  }
> = {
  lightning: {
    id: "nvidia/Nemotron-3_5-Lightning",
    name: "Nemotron 3.5 Lightning",
    short: "Lightning",
    params: "30B MoE · 3B active",
    context: "1,024K",
    inPerM: 0.06,
    outPerM: 0.24,
    tokPerSec: 314,
    role: "Everyday cognition. The correct call when uncertainty, evidence, and complexity are already settled.",
  },
  super: {
    id: "nvidia/nemotron-3-super-120b-a12b",
    name: "Nemotron 3 Super",
    short: "Super",
    params: "120B MoE · 12B active",
    context: "256K",
    inPerM: 0.3,
    outPerM: 0.9,
    tokPerSec: 127,
    role: "Middle tier. Stronger reasoning when the calibration gap is opening, before Ultra is justified.",
  },
  ultra: {
    id: "nvidia/Nemotron-3-Ultra-550b-a55b",
    name: "Nemotron 3 Ultra",
    short: "Ultra",
    params: "550B MoE · 55B active",
    context: "1,024K",
    inPerM: 1,
    outPerM: 3,
    tokPerSec: 523,
    role: "Expensive cognition. Invoked only after the problem is framed and still unresolved.",
  },
};

export const TAVILY = {
  name: "Tavily",
  role: "Epistemic acquisition. Called only when surviving hypotheses cannot be separated on the current packet.",
};

export function price(tier: Tier, tokensIn: number, tokensOut: number): number {
  const t = TIERS[tier];
  return (tokensIn * t.inPerM + tokensOut * t.outPerM) / 1_000_000;
}

export function latencyFor(tier: Tier, tokensOut: number): number {
  return Math.round((tokensOut / TIERS[tier].tokPerSec) * 1000) + 280;
}