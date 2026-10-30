export type Segment = { id: string; text: string };
export type Detection = {
  trigger: string;
  evidence_ids: string[];
  observation: string;
  executor: string;
};
export function evidenceSegments(input: string): Segment[];
export function detectDeterministic(
  input: string,
  initial: string,
  segments: Segment[],
): Detection | null;