export const CONTROLLER_VERSION: string;
export const TRIGGER_TO_ACTION: Record<string, string>;
export const DETECTOR_VOCABULARY: string[];
export const ACTION_INSTRUCTIONS: Record<string, string>;
export const CCG_WEIGHTS: Readonly<Record<string, number>>;
export function ccgFromSignals(signals: object): number;
export function decideEvidenceAcquisition(args: {
  ccg: number;
  retrievableCount: number;
  modelChoice: string;
  unseenCitations: boolean;
}): "acquire" | "halt";
export function actionForTrigger(trigger: string): string;
export function decidePressurePolicy(
  detector: { trigger: string; evidenceValid: boolean },
  initial: { confidence: number; uncertainty: string | null },
): {
  profile: string;
  ccg: number;
  threshold: number;
  signals: Record<string, number>;
  intervene: boolean;
  policyBefore: string;
  policyAfter: string;
};