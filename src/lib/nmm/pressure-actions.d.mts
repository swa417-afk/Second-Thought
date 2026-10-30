export type Verification = {
  answer: string;
  confidence: number;
  verification: string[];
  executor: string;
};
export function recomputeWithUnits(input: string): Verification | null;
export function normalizeTimestamps(input: string): Verification | null;
export function traceEntityBindings(input: string): Verification | null;
export function checkCausalOrder(input: string): Verification | null;
export function branchAndVerify(input: string): Verification | null;
export function abstainOrClarify(input: string): Verification | null;
export function verifySource(input: string): Verification | null;
export function executeDeterministicAction(action: string, input: string): Verification | null;