import { useEffect, useMemo, useState } from "react";
import { ExternalLink, GitBranch, X } from "lucide-react";
import {
  RELATIONAL_EVIDENCE_EVENT,
  type RelationalEvidenceResult,
} from "@/lib/evidence/relational-evidence";
import { buildRelationalEvidenceCardModel } from "@/lib/evidence/relational-evidence-card-model";
import "./temporal-suggestion-card.css";

export function RelationalEvidenceSuggestionHost() {
  const [result, setResult] = useState<RelationalEvidenceResult | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onEvidence = (event: Event) => {
      const detail = (event as CustomEvent<RelationalEvidenceResult>).detail;
      if (!detail?.shouldOffer) return;
      setResult(detail);
      setDismissed(false);
    };
    window.addEventListener(RELATIONAL_EVIDENCE_EVENT, onEvidence);
    return () => window.removeEventListener(RELATIONAL_EVIDENCE_EVENT, onEvidence);
  }, []);

  const model = useMemo(
    () => (result ? buildRelationalEvidenceCardModel(result) : null),
    [result],
  );

  if (!model || dismissed) return null;

  return (
    <aside
      className="temporal-suggestion-card relational-evidence-card"
      role="status"
      aria-live="polite"
      aria-label="Related evidence suggestion"
      data-testid="relational-evidence-card"
    >
      <div className="temporal-suggestion-topline">
        <span>
          <GitBranch size={15} aria-hidden="true" />
          Cross-source evidence
        </span>
        <button
          type="button"
          className="temporal-suggestion-dismiss"
          aria-label="Dismiss related evidence suggestion"
          onClick={() => setDismissed(true)}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <h3>{model.title}</h3>
      <p>{model.summary}</p>

      <div className="relational-evidence-list">
        {model.items.map((item) => (
          <article key={item.sourceId + "-" + item.relationshipPath}>
            <div className="relational-evidence-badges">
              <span>{item.relationType.replaceAll("_", " ")}</span>
              <span>{item.sourceStatus.replaceAll("_", " ")}</span>
            </div>
            <strong>{item.sourceTitle}</strong>
            <p>{item.rationale}</p>
            <code>{item.relationshipPath}</code>
            <p className="relational-evidence-caveat">{item.caveat}</p>
            {item.sourceUrl && (
              <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                Review source <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
          </article>
        ))}
      </div>

      <div className="temporal-date-foot">
        <span>
          Related evidence is context, not direct proof. Second Thought keeps that distinction visible.
        </span>
      </div>
    </aside>
  );
}