import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assessTemporalRelevance, temporalPrompt } from "./temporal-relevance.mjs";

function segments(...items) {
  return items.map((text, index) => ({ id: `E${index + 1}`, text }));
}

const NOW = new Date("2026-10-18T20:28:00-04:00");

describe("temporal relevance policy", () => {
  it("uses the explicit requested timeframe even when a newer source exists", () => {
    const input =
      "The 2024 report says capacity was 60. The 2026 report says capacity is 75. What was the limit in 2024?";
    const advisory = assessTemporalRelevance(
      input,
      segments(
        "The 2024 report says capacity was 60.",
        "The 2026 report says capacity is 75.",
        "What was the limit in 2024?",
      ),
      NOW,
    );
    assert.equal(advisory.applied, true);
    assert.equal(advisory.primary.date_label, "2024");
    assert.equal(advisory.mode, "explicit_timeframe");
    assert.equal(advisory.suggestion_card.alternate_dates.includes("2026"), true);
  });

  it("uses the newest dated evidence first for an explicitly current request", () => {
    const input =
      "A June 2025 memo lists 60. An October 2026 memo lists 75. What is the current limit?";
    const advisory = assessTemporalRelevance(
      input,
      segments("A June 2025 memo lists 60.", "An October 2026 memo lists 75.", "What is the current limit?"),
      NOW,
    );
    assert.equal(advisory.primary.date_label, "October 2026");
    assert.equal(advisory.mode, "current_context");
  });

  it("keeps alternative dated evidence in a suggestion card", () => {
    const advisory = assessTemporalRelevance(
      "Record A is dated 2025. Record B is dated 2026. Which record should I inspect?",
      segments("Record A is dated 2025.", "Record B is dated 2026."),
      NOW,
    );
    assert.equal(advisory.applied, true);
    assert.equal(advisory.suggestion_card.kind, "dated_alternative");
    assert.match(advisory.suggestion_card.message, /There is also evidence dated/);
  });

  it("does not create a suggestion when all evidence has one date", () => {
    const advisory = assessTemporalRelevance(
      "The 2026 record says A. Another 2026 record says B.",
      segments("The 2026 record says A.", "Another 2026 record says B."),
      NOW,
    );
    assert.equal(advisory.applied, false);
    assert.equal(advisory.suggestion_card, null);
  });

  it("produces bounded model guidance without discarding alternatives", () => {
    const advisory = assessTemporalRelevance(
      "The 2025 memo says A. The 2026 memo says B. What is current?",
      segments("The 2025 memo says A.", "The 2026 memo says B."),
      NOW,
    );
    const prompt = temporalPrompt(advisory);
    assert.match(prompt, /Use the 2026 evidence first/);
    assert.match(prompt, /Do not discard these alternate dated contexts/);
    assert.match(prompt, /not automatically more truthful/i);
  });
});