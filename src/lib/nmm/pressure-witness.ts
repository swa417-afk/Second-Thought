import { createServerFn } from "@tanstack/react-start";
import {
  createTransport,
  executePressureTrial,
  MODEL,
  RUN_CONFIGURATION,
  type PressureReceipt,
} from "./pressure-runtime.mjs";

// The fixed public task contains observations only. No evaluator or suite metadata
// enters the controller. The CLI uses this exact executePressureTrial function.
export const PRESSURE_TASK =
  "A calibration rig must deliver 450 micrograms of tracer. The stock concentration is 0.09 mg/mL. The actuator accepts a command in microliters. What volume should be commanded?";
let active = false;
let windowStarted = 0;
let runs = 0;
type PressureWitnessResponse =
  | { ok: false; reason: string }
  | {
      ok: true;
      receipt_id: string;
      task: string;
      model: string;
      configuration: Readonly<Record<string, number>>;
      receipt: PressureReceipt;
      sha256: string;
    };
export const executePressureWitness = createServerFn({ method: "POST" }).handler(
  async (): Promise<PressureWitnessResponse> => {
    const key = process.env.NEBIUS_API_KEY;
    if (!key)
      return {
        ok: false as const,
        reason: "The running server needs a Nebius key to execute this test.",
      };
    const now = Date.now();
    if (now - windowStarted > 3600000) {
      windowStarted = now;
      runs = 0;
    }
    if (active)
      return {
        ok: false as const,
        reason: "A pressure test is already running. Wait for its receipt.",
      };
    if (runs >= 12)
      return {
        ok: false as const,
        reason: "The hourly limit of 12 pressure tests has been reached.",
      };
    active = true;
    runs++;
    try {
      const receipt = await executePressureTrial({
        input: PRESSURE_TASK,
        arm: "N1",
        transport: createTransport(key),
      });
      const { createHash, randomUUID } = await import("node:crypto");
      const recorded = {
        receipt_id: randomUUID(),
        task: PRESSURE_TASK,
        model: MODEL,
        configuration: RUN_CONFIGURATION,
        receipt,
      };
      const sha256 = createHash("sha256").update(JSON.stringify(recorded)).digest("hex");
      return { ok: true as const, ...recorded, sha256 };
    } finally {
      active = false;
    }
  },
);