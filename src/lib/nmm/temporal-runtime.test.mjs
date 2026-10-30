import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { executePressureTrial, MODEL } from "./pressure-runtime.mjs";

function fakeTransport(observed) {
  return async (request) => {
    observed.push(request);
    return {
      parsed: {
        answer: "60",
        confidence: 0.9,
        evidence_summary: "The requested timeframe is 2024.",
        uncertainty: null,
        tool_request: null,
      },
      usage: {
        prompt_tokens: 120,
        completion_tokens: 30,
        total_tokens: 150,
        reasoning_tokens: null,
      },
      finish_reason: "stop",
      model: MODEL,
      call_id: "temporal-test-call",
      latency_ms: 12,
    };
  };
}

describe("pressure runtime temporal advisory", () => {
  it("uses the requested date first and emits a separate alternate-date suggestion", async () => {
    const calls = [];
    const input =
      "A 2024 report says the limit was 60. A 2026 report says the limit is 75. What was the limit in 2024?";
    const receipt = await executePressureTrial({
      input,
      arm: "C0",
      transport: fakeTransport(calls),
    });

    assert.equal(receipt.ok, true);
    assert.equal(receipt.temporal_advisory.applied, true);
    assert.equal(receipt.temporal_advisory.primary.date_label, "2024");
    assert.equal(receipt.temporal_advisory.suggestion_card.primary_date, "2024");
    assert.deepEqual(receipt.temporal_advisory.suggestion_card.alternate_dates, ["2026"]);
    assert.match(calls[0].user, /Use the 2024 evidence first/);
    assert.match(calls[0].user, /2026/);
    assert.equal(receipt.event_trace.some((event) => event.kind === "temporal_priority"), true);
    assert.equal(
      receipt.event_trace.some((event) => event.kind === "suggestion_card_offered"),
      true,
    );
  });
});