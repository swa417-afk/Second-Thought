export const MODEL: string;
export const REQUEST_CONFIGURATION: Readonly<{
  temperature: number;
  response_format: { type: string };
  chat_template_kwargs: { enable_thinking: boolean };
}>;
export const RUN_CONFIGURATION: Readonly<Record<string, number>>;
export const CONTROL_TOOLS: readonly string[];
export type Judgment = {
  answer: string;
  confidence: number;
  evidence_summary: string;
  uncertainty: string | null;
};
export type CallUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  reasoning_tokens: number | null;
};
export type UsageTotals = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  calls: number;
  usage_complete: boolean;
};
export type PublicCall = {
  phase: string;
  call_id: string | null;
  model: string | null;
  usage: CallUsage | null;
  finish_reason: string | null;
  latency_ms: number | null;
  shared?: boolean;
  status?: string;
};
export type TemporalEvidenceCandidate = {
  evidence_id: string;
  text: string;
  date_label: string;
  date_value: number;
  precision: string;
  inferred_year?: boolean;
};
export type TemporalAdvisory = {
  applied: boolean;
  policy: string;
  mode?: string;
  rationale?: string;
  target_label?: string | null;
  candidates: TemporalEvidenceCandidate[];
  primary: TemporalEvidenceCandidate | null;
  alternates: TemporalEvidenceCandidate[];
  suggestion_card: null | {
    kind: string;
    title: string;
    message: string;
    action_label: string;
    primary_date: string;
    alternate_dates: string[];
  };
};
export type PressureReceipt = {
  ok: boolean;
  schema: string;
  arm: string;
  started_at: string;
  completed_at: string;
  initial_answer: Judgment | null;
  temporal_advisory: TemporalAdvisory;
  final_answer?: Judgment;
  detector_event?: {
    trigger: string;
    evidence: { id: string; text: string }[];
    evidenceValid: boolean;
    executor: string;
    observation: string | null;
  };
  policy_before?: string;
  policy_after?: string;
  ccg?: number;
  control_action?: string | null;
  judgment_delta?: { answer_changed: boolean; confidence_before: number; confidence_after: number };
  event_trace: { seq: number; t: string; kind: string; verified?: string[] }[];
  usage: PublicCall[];
  inference_usage_totals: UsageTotals;
  tool_execution: {
    action: string;
    executed: boolean;
    elapsed_ms: number;
    executor: string | null;
  }[];
  failure?: {
    code: string;
    phase: string | null;
    finish_reason: string | null;
    http_status: number | null;
  };
};
export type Transport = (args: {
  system: string;
  user: string;
  maxTokens: number;
}) => Promise<{
  parsed: Record<string, unknown>;
  usage: CallUsage | null;
  finish_reason: string;
  model: string;
  call_id: string;
  latency_ms: number;
}>;
export function createTransport(apiKey: string): Transport;
export function executePressureTrial(args: {
  input: string;
  currentInput?: string;
  arm?: string;
  transport: Transport;
}): Promise<PressureReceipt>;