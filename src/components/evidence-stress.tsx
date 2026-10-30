import { useState } from "react";
import { ExternalLink, LoaderCircle, Search } from "lucide-react";
import { searchInsForgeEvidence } from "@/lib/evidence/insforge-evidence-client";
import { offerRelationalEvidenceCard } from "@/lib/evidence/relational-evidence";
import type { EvidenceSearchRow } from "@/lib/evidence/insforge-evidence-adapter";

type SearchState =
  | { kind: "idle"; message: string; rows: EvidenceSearchRow[] }
  | { kind: "loading"; message: string; rows: EvidenceSearchRow[] }
  | { kind: "direct"; message: string; rows: EvidenceSearchRow[] }
  | { kind: "related"; message: string; rows: EvidenceSearchRow[] }
  | { kind: "empty"; message: string; rows: EvidenceSearchRow[] }
  | { kind: "error"; message: string; rows: EvidenceSearchRow[] };

const INITIAL: SearchState = {
  kind: "idle",
  message:
    "Submit a claim or question. Second Thought checks the evidence bank for direct candidates first, then looks outward for sourced facts that materially affect the answer.",
  rows: [],
};

function directCandidates(rows: EvidenceSearchRow[]) {
  return rows
    .filter((row) => row.match_kind === "direct" && row.rank_score >= 0.65)
    .sort((a, b) => b.rank_score - a.rank_score)
    .slice(0, 3);
}

function sourceBadge(status: string) {
  if (status === "inspected") return "inspected";
  if (status === "metadata_verified") return "metadata only";
  if (status === "machine_verified") return "machine verified";
  return "unverified";
}

export function EvidenceStress() {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<SearchState>(INITIAL);

  async function checkEvidence() {
    const trimmed = question.trim();
    if (!trimmed) {
      setState({
        kind: "error",
        message: "Enter a claim or question before checking the evidence bank.",
        rows: [],
      });
      return;
    }

    setState({
      kind: "loading",
      message: "Checking direct evidence and material cross-source relationships…",
      rows: [],
    });

    const response = await searchInsForgeEvidence(trimmed, "query:" + trimmed);
    if (response.error) {
      setState({ kind: "error", message: response.error, rows: [] });
      return;
    }

    const direct = directCandidates(response.rows);
    if (direct.length > 0) {
      setState({
        kind: "direct",
        message:
          "Direct candidate sources were found. They are retrieval candidates, not automatic proof of the submitted claim.",
        rows: direct,
      });
      return;
    }

    if (response.relational.shouldOffer) {
      offerRelationalEvidenceCard(response.relational);
      setState({
        kind: "related",
        message:
          "No strong direct source was found. Related evidence was found through a material relationship and offered separately as additional context.",
        rows: response.rows
          .filter((row) => row.match_kind === "related")
          .sort((a, b) => b.rank_score - a.rank_score)
          .slice(0, 3),
      });
      return;
    }

    setState({
      kind: "empty",
      message:
        "No strong direct or materially related source is currently represented in this evidence-bank snapshot.",
      rows: [],
    });
  }

  return (
    <section
      className="mx-auto w-full max-w-5xl border border-line bg-panel p-5 sm:p-6"
      aria-labelledby="evidence-stress-title"
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div>
          <p className="text-xs tracking-[0.2em] text-amber uppercase">
            Evidence bank / live retrieval
          </p>
          <h2 id="evidence-stress-title" className="mt-2 font-display text-3xl text-fg">
            Stress a claim against the source graph.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            Direct evidence stays primary. When a direct source is missing, Second Thought can
            surface a separate, traceable relationship to evidence that may change the answer
            without pretending that indirect evidence proves the claim.
          </p>

          <label
            htmlFor="evidence-stress-question"
            className="mt-5 block text-xs font-semibold tracking-widest text-fg uppercase"
          >
            Claim or question
          </label>
          <textarea
            id="evidence-stress-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={4}
            placeholder="Example: Is NIST AI RMF mandatory?"
            className="mt-2 w-full resize-y border border-line bg-ink px-3 py-3 text-sm leading-6 text-fg outline-none placeholder:text-muted focus:border-amber"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={checkEvidence}
              disabled={state.kind === "loading"}
              className="inline-flex h-11 items-center gap-2 bg-amber px-4 text-sm font-semibold text-ink disabled:cursor-wait disabled:opacity-70"
            >
              {state.kind === "loading" ? (
                <LoaderCircle className="animate-spin" size={16} aria-hidden="true" />
              ) : (
                <Search size={16} aria-hidden="true" />
              )}
              {state.kind === "loading" ? "Checking evidence…" : "Check evidence"}
            </button>
            <p
              data-testid="evidence-stress-status"
              role="status"
              aria-live="polite"
              className="max-w-xl text-xs leading-5 text-muted"
            >
              {state.message}
            </p>
          </div>
        </div>

        <aside className="border-l border-line pl-5 text-xs leading-5 text-muted">
          <p className="font-semibold tracking-widest text-fg uppercase">Retrieval discipline</p>
          <p className="mt-3">
            Inspected sources can support a relationship suggestion. Metadata-only records remain
            discovery candidates until their source text is substantively reviewed.
          </p>
          <p className="mt-3">
            A related-evidence card always shows the relationship path and keeps indirect evidence
            separate from direct support.
          </p>
        </aside>
      </div>

      {state.rows.length > 0 ? (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {state.rows.map((row) => (
            <article key={row.match_kind + "-" + row.source_id} className="border border-line bg-ink p-3">
              <div className="flex flex-wrap gap-2 text-[10px] tracking-wider text-muted uppercase">
                <span>{row.match_kind === "direct" ? "Direct candidate" : "Related candidate"}</span>
                <span aria-hidden="true">·</span>
                <span>{sourceBadge(row.verification_status)}</span>
              </div>
              <p className="mt-2 text-sm font-semibold leading-5 text-fg">{row.source_title}</p>
              {row.relation_type ? (
                <p className="mt-2 text-xs leading-5 text-muted">
                  Relation: {row.relation_type.replaceAll("_", " ")}
                </p>
              ) : null}
              <p className="mt-2 text-xs leading-5 text-muted">{row.rationale}</p>
              {row.source_url ? (
                <a
                  href={row.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs text-amber hover:underline"
                >
                  Open source <ExternalLink size={12} aria-hidden="true" />
                </a>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}