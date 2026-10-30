import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Copy, LoaderCircle, Play, ShieldAlert } from "lucide-react";
import { executeLiveWitness } from "@/lib/nmm/live-witness";
import "./live-witness.css";

type Response = Awaited<ReturnType<typeof executeLiveWitness>>;
type Success = Extract<Response, { ok: true }>;
const STORAGE = "second-thought-live-receipts-v1";
const LABELS: Record<string, string> = {
  labor: "Labor stoppage",
  crane: "Crane 3 still down",
  exam: "Targeted exam on HS 8507",
  abstain: "Insufficient evidence",
  unreadable: "Unparseable model response",
};

export function LiveWitness({ providerReady }: { providerReady: boolean | null }) {
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<Response | null>(null);
  const [saved, setSaved] = useState(0);
  const [copied, setCopied] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    try {
      const receipts = JSON.parse(localStorage.getItem(STORAGE) ?? "[]") as unknown[];
      if (Array.isArray(receipts)) setSaved(receipts.length);
    } catch {
      /* local storage is optional */
    }
    return () => {
      mounted.current = false;
    };
  }, []);

  function reviewLastReceipt() {
    try {
      const receipts = JSON.parse(localStorage.getItem(STORAGE) ?? "[]") as Response[];
      if (Array.isArray(receipts) && receipts[0]?.ok) setResponse(receipts[0]);
    } catch {
      /* The current page remains available. */
    }
  }

  async function runLive() {
    if (busy) return;
    setBusy(true);
    setResponse(null);
    setCopied(false);
    try {
      const result = await executeLiveWitness();
      if (!mounted.current) return;
      setResponse(result);
      if (result.ok) {
        try {
          const old = JSON.parse(localStorage.getItem(STORAGE) ?? "[]") as unknown[];
          const next = [result, ...(Array.isArray(old) ? old : [])].slice(0, 5);
          localStorage.setItem(STORAGE, JSON.stringify(next));
          setSaved(next.length);
        } catch {
          /* receipt remains visible even if storage is disabled */
        }
      }
    } catch (error) {
      if (mounted.current)
        setResponse({
          ok: false,
          reason: error instanceof Error ? error.message : "The live request did not complete.",
        });
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function copyReceipt(receipt: Success) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(receipt, null, 2));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  const receipt = response?.ok ? response : null;
  return (
    <section
      className="live-witness"
      id="live-witness"
      aria-labelledby="live-witness-title"
      aria-busy={busy}
    >
      <div className="live-witness-header">
        <div>
          <p className="live-witness-kicker">THE LIVE TEST / REAL NVIDIA INFERENCE</p>
          <h2 id="live-witness-title">
            Will it change its answer <em>before it commits?</em>
          </h2>
          <p className="live-witness-intro">
            Start with an incomplete Berth 7 evidence packet. The same NVIDIA model answers before
            and after the controller checks the evidence and supplies missing observations. Follow
            the initial judgment, intervention, and revised answer below.
          </p>
        </div>
        <div className="live-witness-control">
          <span className="live-witness-indicator" data-ready={String(providerReady)} role="status">
            {providerReady === null
              ? "CHECKING CONFIGURATION"
              : providerReady
                ? "KEY CONFIGURED"
                : "NEBIUS KEY NEEDED"}
          </span>
          <button
            type="button"
            className="live-witness-launch"
            onClick={runLive}
            disabled={busy || providerReady === false}
          >
            {busy ? (
              <LoaderCircle className="live-witness-spinner" size={18} aria-hidden="true" />
            ) : (
              <Play size={17} fill="currentColor" aria-hidden="true" />
            )}
            {busy ? "Executing NVIDIA inference…" : "Run the live challenge"}
          </button>
          <small>
            2 bounded model calls per run. Up to 5 receipts stored locally in this browser: {saved}{" "}
            saved.
          </small>
          {saved > 0 ? (
            <button type="button" className="live-witness-restore" onClick={reviewLastReceipt}>
              Review most recent receipt
            </button>
          ) : null}
        </div>
      </div>
      <div className="live-witness-stages">
        <div className="live-witness-stage">
          <span className="live-stage-num">01 / FIRST INFERENCE</span>
          <strong>
            {receipt
              ? LABELS[receipt.first.choice]
              : busy
                ? "Calling Lightning…"
                : "Initial answer not yet observed"}
          </strong>
          <p>
            {receipt
              ? receipt.first.summary
              : "A model sees the original Berth 7 packet, including a persuasive but stale labor warning."}
          </p>
          {receipt ? (
            <small>
              {receipt.first.model} · {receipt.first.latencyMs} ms · cited:{" "}
              {receipt.first.evidenceIds.join(", ") || "none"}
            </small>
          ) : null}
        </div>
        <div className="live-witness-arrow" aria-hidden="true">
          <ArrowRight size={21} />
        </div>
        <div className="live-witness-stage live-witness-intervention">
          <span className="live-stage-num">02 / EVIDENCE CHECK</span>
          <strong>
            {receipt
              ? receipt.first.choice === "abstain"
                ? "Abstention respected. Evidence acquired."
                : "Unsupported commitment held"
              : "Controller decision pending"}
          </strong>
          <p>
            {receipt
              ? receipt.intervention.why
              : "The controller checks stale evidence, conflicts, and missing discriminating observations without relying on the model's hidden reasoning."}
          </p>
          {receipt ? (
            <small>
              MRL {receipt.intervention.action.toUpperCase()} · CCG{" "}
              {receipt.intervention.ccg.toFixed(3)} ·{" "}
              {receipt.intervention.acquiredEvidence.map((e) => e.id).join(" + ")} disclosed
            </small>
          ) : null}
        </div>
        <div className="live-witness-arrow" aria-hidden="true">
          <ArrowRight size={21} />
        </div>
        <div className="live-witness-stage">
          <span className="live-stage-num">03 / REVISED INFERENCE</span>
          <strong>
            {receipt ? LABELS[receipt.revised.choice] : "New evidence, new evaluation"}
          </strong>
          <p>
            {receipt
              ? receipt.revised.summary
              : "The same live model reevaluates the full packet, after a controller-triggered evidence change."}
          </p>
          {receipt ? (
            <small>
              {receipt.revised.model} · {receipt.revised.latencyMs} ms · cited:{" "}
              {receipt.revised.evidenceIds.join(", ") || "none"}
            </small>
          ) : null}
        </div>
      </div>
      {receipt ? (
        <div className="live-witness-verdict" role="status">
          <div className="live-witness-verdict-mark">
            {receipt.verdict.state === "committed" ? (
              <Check size={23} />
            ) : (
              <ShieldAlert size={23} />
            )}
          </div>
          <div>
            <span className="live-stage-num">
              {receipt.verdict.state === "committed"
                ? "CONTROLLER AUTHORIZED COMMITMENT"
                : "CONTROLLER WITHHELD COMMITMENT"}
            </span>
            <h3>{receipt.verdict.answer}</h3>
            <p>{receipt.verdict.explanation}</p>
            <small>
              Receipt {receipt.receiptId} · {receipt.providerCalls} live provider requests ·{" "}
              {new Date(receipt.executedAt).toLocaleString()}
            </small>
          </div>
          <button type="button" className="live-witness-copy" onClick={() => copyReceipt(receipt)}>
            <Copy size={15} /> {copied ? "Copied" : "Copy evidence receipt"}
          </button>
        </div>
      ) : response && !response.ok ? (
        <p className="live-witness-failure" role="alert">
          Live provider execution not verified: {response.reason}
        </p>
      ) : null}
      <p className="live-witness-disclosure">
        The observations are fixed and synthetic. Model answers, request latencies, and returned
        token usage come from actual provider calls. CCG is computed from externally observable
        scenario signals, not from hidden model thoughts. This is a live controller demonstration,
        not measured field accuracy or a live Tavily search.
      </p>
    </section>
  );
}