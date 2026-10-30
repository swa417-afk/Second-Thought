export type Tier = "lightning" | "super" | "ultra";

export type Complexity = "low" | "medium" | "high";

export type Condition =
  | "canonical"
  | "easy"
  | "stale"
  | "external"
  | "underdetermined";

export type Hypothesis = {
  id: string;
  label: string;
};

export type Evidence = {
  id: string;
  source: string;
  text: string;
  ageDays: number;
  /** Narrative pull. Baseline anchors on this. Regulated scoring does not. */
  salience: number;
  support: Record<string, number>;
  availability: "initial" | "retrievable";
};

export type Trial = {
  id: string;
  title: string;
  kicker: string;
  question: string;
  brief: string;
  hypotheses: Hypothesis[];
  evidence: Evidence[];
  /** Hypothesis id, or "abstain" when the packet cannot discriminate. */
  truth: string;
  complexity: Complexity;
  taskRisk: number;
  /** Untested cause smuggled in by the way the task is worded. */
  framedAssumption?: string;
  failIfLeader?: { hypothesis: string; because: string };
  /** Two observations that entail `favors` only when read jointly. */
  synthesis?: { ids: [string, string]; favors: string; note: string };
  missingObservation?: string;
  condition: Condition;
};

export type Signals = {
  contradiction: number;
  coverageGap: number;
  assumptions: number;
  instability: number;
  evidenceAge: number;
  competition: number;
  taskRisk: number;
  verificationFail: number;
  infoStall: number;
};

export type TraceEvent =
  | {
      type: "read";
      t: number;
      tier: Tier;
      text: string;
      ccg: number;
      signals: Signals;
      leader: string;
      confidence: number;
      posterior: Record<string, number>;
      gaps: number;
    }
  | {
      type: "action";
      t: number;
      action: "challenge" | "acquire" | "escalate" | "deescalate";
      title: string;
      detail: string;
      tier: Tier;
      from?: Tier;
    }
  | {
      type: "monologue";
      t: number;
      text: string;
      confidence: number;
      tokens: number;
      ccg: number;
    }
  | {
      type: "commit";
      t: number;
      tier: Tier;
      hypothesis: string;
      label: string;
      confidence: number;
      correct: boolean;
      text: string;
    }
  | {
      type: "halt";
      t: number;
      tier: Tier;
      text: string;
      missing: string;
      correct: boolean;
      ccg: number;
    };

export type ArmResult = {
  arm: "baseline" | "regulated";
  events: TraceEvent[];
  outcome: "correct" | "wrong" | "abstained";
  correct: boolean;
  tokensIn: number;
  tokensOut: number;
  tokens: number;
  cost: number;
  latencyMs: number;
  confidence: number | null;
  gaps: number;
  interventions: number;
  finalCcg: number;
  finalTier: Tier;
  escalated: boolean;
  deescalated: boolean;
  acquired: boolean;
  falseCertainty: boolean;
  answerLabel: string;
};

export type TrialRun = {
  trial: Trial;
  baseline: ArmResult;
  regulated: ArmResult;
};