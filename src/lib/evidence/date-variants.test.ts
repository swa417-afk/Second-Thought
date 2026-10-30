import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inferDateIntent,
  selectRelevantDate,
  shouldOfferDateCard,
  type DateVariantRecord,
} from "./date-variants.ts";

const pubmed: DateVariantRecord = {
  sourceId: "PMID:42892707",
  sourceTitle: "Example PubMed article",
  sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/42892707/",
  preferredDate: "2026-10-17",
  preferredDateBasis: "electronic publication",
  dateDiscrepancyFlag: true,
  dates: [
    { label: "electronic publication", value: "2026-10-17", kind: "electronic_publication" },
    { label: "journal issue publication", value: "2027-12-31", kind: "issue_publication" },
    { label: "record revised", value: "2026-10-18", kind: "record_revised" },
  ],
};

const trial: DateVariantRecord = {
  sourceId: "NCT:NCT01834001",
  sourceTitle: "Example trial",
  sourceUrl: "https://clinicaltrials.gov/study/NCT01834001",
  preferredDate: "2026-10-16",
  preferredDateBasis: "last update posted",
  dateDiscrepancyFlag: true,
  dates: [
    { label: "last update posted", value: "2026-10-16", kind: "last_update_posted" },
    { label: "last update submitted", value: "2026-10-15", kind: "last_update_submitted" },
    { label: "first posted", value: "2013-04-17", kind: "first_posted" },
  ],
};

describe("date intent", () => {
  it("recognizes publication timing", () => {
    assert.equal(inferDateIntent("When was this paper published?"), "publication_timing");
  });
  it("recognizes currentness", () => {
    assert.equal(inferDateIntent("How current is this trial record?"), "record_currentness");
  });
});

describe("relevance-first date selection", () => {
  it("uses electronic publication first for publication timing", () => {
    const selected = selectRelevantDate(pubmed, "When was this paper published?");
    assert.equal(selected?.primary.value, "2026-10-17");
    assert.equal(selected?.primary.kind, "electronic_publication");
    assert.equal(selected?.cardRequired, true);
    assert.ok(selected?.secondary.some((date) => date.value === "2027-12-31"));
  });
  it("uses latest public registry update for currentness", () => {
    const selected = selectRelevantDate(trial, "How current is this trial record?");
    assert.equal(selected?.primary.value, "2026-10-16");
    assert.equal(selected?.primary.kind, "last_update_posted");
    assert.ok(selected?.secondary.some((date) => date.value === "2013-04-17"));
  });
  it("uses first posted for first-appearance questions", () => {
    const selected = selectRelevantDate(trial, "When did this trial first appear?");
    assert.equal(selected?.primary.value, "2013-04-17");
    assert.equal(selected?.primary.kind, "first_posted");
  });
  it("falls back to preferred_date when intent is ambiguous", () => {
    const selected = selectRelevantDate(pubmed, "Tell me about this source.");
    assert.equal(selected?.primary.value, "2026-10-17");
  });
  it("does not offer a card when there is no real value discrepancy", () => {
    const record: DateVariantRecord = {
      ...pubmed,
      dates: [
        { label: "electronic publication", value: "2026-10-17", kind: "electronic_publication" },
        { label: "record revised", value: "2026-10-17", kind: "record_revised" },
      ],
    };
    assert.equal(shouldOfferDateCard(record, "When was it published?"), false);
  });
  it("never labels a date variant as wrong", () => {
    const selected = selectRelevantDate(pubmed, "When was this paper published?");
    assert.doesNotMatch(selected?.cardBody ?? "", /wrong date|incorrect date/i);
  });
});