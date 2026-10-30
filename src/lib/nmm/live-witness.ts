import { createServerFn } from "@tanstack/react-start";
import { BERTH } from "./trials";
import { TIERS } from "./models";
import {
  adjudicateLive,
  inspectInitialEvidence,
  scenarioPacket,
  type Choice,
  type PublicModelRead,
} from "./live-controller";

type Completion = {
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
};
let active = false;
let hourStart = 0;
let hourlyCalls = 0;
const HOURLY_LIMIT = 12;

function parseRead(payload: Completion, elapsed: number): PublicModelRead {
  const raw = payload.choices?.[0]?.message?.content;
  const content =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
        ? raw
            .filter((part) => part.type === "text")
            .map((part) => part.text ?? "")
            .join("")
        : "";
  // Never relay raw provider output: some models include private reasoning in separate fields.
  let obj: Record<string, unknown> = {};
  try {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start)
      obj = JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    // Fail closed below, not by guessing a hypothesis.
  }
  const valid: Choice[] = ["labor", "crane", "exam", "abstain"];
  const choice = valid.includes(obj.choice as Choice) ? (obj.choice as Choice) : "unreadable";
  const summary =
    typeof obj.summary === "string" &&
    choice !== "unreadable" &&
    !/<think|thinking process/i.test(obj.summary)
      ? obj.summary.slice(0, 380)
      : "No usable concise evidence justification was returned.";
  const evidenceIds = Array.isArray(obj.evidence_ids)
    ? obj.evidence_ids.filter((value): value is string => typeof value === "string").slice(0, 8)
    : [];
  return {
    choice,
    summary,
    evidenceIds,
    model: payload.model ?? TIERS.lightning.id,
    latencyMs: elapsed,
    usage: payload.usage
      ? { input: payload.usage.prompt_tokens ?? 0, output: payload.usage.completion_tokens ?? 0 }
      : null,
  };
}

async function modelRead(key: string, stage: "first" | "revised"): Promise<PublicModelRead> {
  const packet = scenarioPacket(stage);
  const available = packet.map((e) => ({
    id: e.id,
    source: e.source,
    observation: e.text,
    age_days: e.ageDays,
  }));
  const system = [
    "You are an evidence assessor in a synthetic engineering exercise, not a live port operator.",
    "Respond with exactly one JSON object, no markdown, no private reasoning.",
    "Keys: choice (labor, crane, exam, or abstain), summary (one concise externally verifiable sentence), evidence_ids (array of cited supplied ids).",
    "Choose only from the four permitted choices; do not invent evidence or source identifiers.",
    "If insufficient evidence discriminates the causes, choose abstain.",
  ].join(" ");
  const prompt =
    stage === "first"
      ? "A dispatch team inherited a labor-stoppage explanation for a 41% berth dwell-time increase. Evaluate whether the evidence supports committing now. Current packet: "
      : "The evidence controller withheld an unsupported commitment and released additional observations. Reassess the original question using the full packet. Evaluate each explanation independently and cite the specific supplied evidence that supports your choice. Complete packet: ";
  const started = Date.now();
  const response = await fetch("https://api.tokenfactory.nebius.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TIERS.lightning.id,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt + JSON.stringify(available) },
      ],
      max_tokens: 360,
      temperature: 0,
      response_format: { type: "json_object" },
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) {
    // Do not surface upstream bodies: those might echo request headers or user details.
    throw new Error(
      `Nebius Token Factory returned HTTP ${response.status} during ${stage} inference.`,
    );
  }
  const json = (await response.json()) as Completion;
  return parseRead(json, Date.now() - started);
}

/**
 * Two bounded, genuine NVIDIA inference requests. The NMM controller is local,
 * inspectable, deterministic, and cannot quietly convert failure to success.
 */
export const executeLiveWitness = createServerFn({ method: "POST" }).handler(async () => {
  if (!process.env.NEBIUS_API_KEY) {
    return {
      ok: false as const,
      reason: "NEBIUS_API_KEY is not configured in the running server.",
    };
  }
  const now = Date.now();
  if (now - hourStart > 3600000) {
    hourStart = now;
    hourlyCalls = 0;
  }
  if (active)
    return { ok: false as const, reason: "A live witness is already running on this instance." };
  if (hourlyCalls >= HOURLY_LIMIT) {
    return { ok: false as const, reason: "The live witness hourly request cap has been reached." };
  }
  active = true;
  hourlyCalls += 1;
  try {
    const first = await modelRead(process.env.NEBIUS_API_KEY, "first");
    const intervention = inspectInitialEvidence(first);
    if (intervention.action !== "acquire") {
      return {
        ok: false as const,
        reason:
          "MRL halted after the initial provider response; no second model request was authorized.",
      };
    }
    const revised = await modelRead(process.env.NEBIUS_API_KEY, "revised");
    const verdict = adjudicateLive(revised);
    return {
      ok: true as const,
      receiptId: crypto.randomUUID(),
      executedAt: new Date().toISOString(),
      source: "Nebius Token Factory / NVIDIA Nemotron 3.5 Lightning",
      scenario: BERTH.id,
      evidenceMode: "FIXED SYNTHETIC SCENARIO / NO LIVE EXTERNAL RETRIEVAL",
      first,
      intervention,
      revised,
      verdict,
      providerCalls: 2,
    };
  } catch (error) {
    return {
      ok: false as const,
      reason: error instanceof Error ? error.message : "Live execution failed.",
    };
  } finally {
    active = false;
  }
});