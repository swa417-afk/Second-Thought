import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  LoaderCircle,
  Plus,
  Search,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { WEIGHTS } from "@/lib/nmm/signals";
import { TIERS } from "@/lib/nmm/models";
import { probeLightning, probeTavily, substrateStatus } from "@/lib/nmm/probe";
import type { Tier } from "@/lib/nmm/types";

type Status = Awaited<ReturnType<typeof substrateStatus>>;
type LightningProbe = Awaited<ReturnType<typeof probeLightning>>;
type TavilyProbe = Awaited<ReturnType<typeof probeTavily>>;
const MODEL_TIERS: Tier[] = ["lightning", "super", "ultra"];
const MODEL_ROLES: Record<Tier, { label: string; description: string }> = {
  lightning: {
    label: "Start here",
    description:
      "Everyday cognition. Stay light when the evidence is clear and the problem is settled.",
  },
  super: {
    label: "Go deeper",
    description:
      "Stronger reasoning when the calibration gap opens, before a larger model is justified.",
  },
  ultra: {
    label: "Only when needed",
    description: "More capacity for a well-framed problem that still needs deeper inference.",
  },
};

const RUNTIME_STEPS = [
  {
    id: "evidence",
    label: "Evidence",
    heading: "Read what is actually known.",
    explanation:
      "The controller starts with the supplied observations and tracks what is missing. A persuasive report is not automatically sufficient evidence.",
    example: "Berth 7",
    trial: "berth-7",
  },
  {
    id: "calibration",
    label: "Calibration",
    heading: "Measure the gap before answering.",
    explanation:
      "NMM computes CCG from observable signals such as contradictions, coverage gaps, and competing hypotheses. It does not claim to inspect a model's hidden mental state.",
    example: "Run 440",
    trial: "yield-440",
  },
  {
    id: "allocation",
    label: "Allocation",
    heading: "Choose the cognition the evidence warrants.",
    explanation:
      "MRL can keep Nemotron on Lightning, move to Super or Ultra, or request another observation. More inference is a decision, not the default.",
    example: "Door 2",
    trial: "door-2",
  },
  {
    id: "judgment",
    label: "Judgment",
    heading: "Commit only when the case is supported.",
    explanation:
      "The runtime can commit a supported answer or stop and name the evidence still needed. A fluent unsupported conclusion does not count as resolution.",
    example: "Run 440",
    trial: "yield-440",
  },
] as const;

export function SubstrateView() {
  const [selectedRuntimeStep, setSelectedRuntimeStep] = useState(0);
  const selectedStep = RUNTIME_STEPS[selectedRuntimeStep]!;
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [statusRevision, setStatusRevision] = useState(0);
  const [lightning, setLightning] = useState<LightningProbe | null>(null);
  const [tavily, setTavily] = useState<TavilyProbe | null>(null);
  const [busy, setBusy] = useState<"lightning" | "tavily" | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let ignore = false;
    substrateStatus()
      .then((value) => {
        if (!ignore) setStatus(value);
      })
      .catch(() => {
        if (!ignore) setStatusError(true);
      });
    return () => {
      ignore = true;
    };
  }, [statusRevision]);
  async function callLightning() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy("lightning");
    setLightning(null);
    try {
      const result = await probeLightning();
      if (mounted.current) setLightning(result);
    } catch (error: unknown) {
      if (mounted.current)
        setLightning({
          ok: false,
          reason: error instanceof Error ? error.message : "Connection failed. Try again.",
        });
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(null);
    }
  }
  async function callTavily() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy("tavily");
    setTavily(null);
    try {
      const result = await probeTavily();
      if (mounted.current) setTavily(result);
    } catch (error: unknown) {
      if (mounted.current)
        setTavily({
          ok: false,
          reason: error instanceof Error ? error.message : "Search connection failed. Try again.",
        });
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(null);
    }
  }
  return (
    <div className="substrate-page">
      <section className="substrate-hero" aria-labelledby="substrate-heading">
        <div className="substrate-hero-copy">
          <p className="substrate-eyebrow">
            <span className="substrate-signal-dot" /> Beneath the reasoning
          </p>
          <h1 id="substrate-heading">
            Intelligence,
            <br />
            <em>on purpose.</em>
          </h1>
          <p className="substrate-hero-summary">NMM underneath. Nemotron, on demand.</p>
          <p className="substrate-hero-description">
            The right model is a resource, not a default. Second Thought observes the evidence,
            measures the calibration gap, and changes the strategy before an unreliable answer takes
            shape.
          </p>
          <div className="substrate-hero-actions">
            <a className="substrate-button substrate-button-primary" href="#model-family">
              Explore the substrate <ArrowDown size={16} aria-hidden="true" />
            </a>
            <Link className="substrate-text-link" to="/">
              See it reason <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          </div>
          <p className="substrate-hero-note">One model family. Deliberate cognitive allocation.</p>
        </div>
        <div className="substrate-pass-wrap">
          <div className="substrate-orbit" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <section className="substrate-pass" aria-label="Runtime overview">
            <div className="substrate-pass-header">
              <span className="substrate-eyebrow">Cognitive runtime</span>
              <ArrowUpRight className="substrate-pass-mark" size={22} aria-hidden="true" />
            </div>
            <div className="substrate-pass-route">
              <span>Evidence</span>
              <ArrowRight size={24} aria-hidden="true" />
              <span>Judgment</span>
            </div>
            <div className="substrate-pass-caption">
              <span>INPUT</span>
              <span>ALLOCATION, NOT AUTOPILOT</span>
            </div>
            <div
              className="substrate-runtime-tabs"
              role="group"
              aria-label="Explore the four stages of NMM"
            >
              {RUNTIME_STEPS.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  className={
                    index === selectedRuntimeStep
                      ? "substrate-runtime-tab is-selected"
                      : "substrate-runtime-tab"
                  }
                  aria-pressed={index === selectedRuntimeStep}
                  onClick={() => setSelectedRuntimeStep(index)}
                >
                  <span>0{index + 1}</span> {step.label}
                </button>
              ))}
            </div>
            <div className="substrate-runtime-inspect" aria-live="polite" aria-atomic="true">
              <span className="substrate-micro-label">
                SELECTED STAGE / 0{selectedRuntimeStep + 1}
              </span>
              <h3>{selectedStep.heading}</h3>
              <p>{selectedStep.explanation}</p>
              <a className="substrate-runtime-example" href={"/?trial=" + selectedStep.trial}>
                Watch {selectedStep.example} demonstrate this{" "}
                <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            </div>
            <div className="substrate-controller">
              <div>
                <span className="substrate-micro-label">Regulatory layer</span>
                <h2>NMM</h2>
                <p>Observe. Calibrate. Allocate.</p>
              </div>
              <div className="substrate-controller-glyph" aria-hidden="true">
                <span />
                <span />
                <span />
                <i />
              </div>
            </div>
            <dl className="substrate-pass-details">
              <div>
                <dt>Model family</dt>
                <dd>NVIDIA Nemotron</dd>
              </div>
              <div>
                <dt>Inference provider</dt>
                <dd>Nebius Token Factory</dd>
              </div>
              <div>
                <dt>Evidence acquisition</dt>
                <dd>Tavily</dd>
              </div>
            </dl>
            <div className="substrate-pass-tear" aria-hidden="true" />
            <div className="substrate-pass-status" aria-live="polite">
              <div>
                <span className="substrate-micro-label">Inference API credential</span>
                <span className="substrate-status-value">
                  <span className="substrate-connection-dot" />
                  {statusError
                    ? "Status unavailable"
                    : status
                      ? status.tokenFactory
                        ? "Key configured"
                        : "Key needed"
                      : "Checking configuration"}
                </span>
              </div>
              <a className="substrate-pass-test-link" href="#connections">
                Test providers <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </div>
            <p className="substrate-pass-footnote">
              Key presence is not a connectivity test. The closed-world replay works without API
              credentials.
            </p>
          </section>
          <p className="substrate-pass-coordinate">
            <Plus size={12} aria-hidden="true" /> NMM / NEMOTRON / SECOND THOUGHT
          </p>
        </div>
      </section>
      <div className="substrate-principle-band">
        <span className="substrate-eyebrow">The allocation principle</span>
        <p>
          More cognition <span>only when the gap calls for it.</span>
        </p>
        <ArrowDown size={20} aria-hidden="true" />
      </div>
      <section
        id="model-family"
        className="substrate-section substrate-paper"
        aria-labelledby="models-heading"
      >
        <div className="substrate-section-inner">
          <div className="substrate-section-heading">
            <div>
              <p className="substrate-eyebrow">One family. Three levels of reasoning.</p>
              <h2 id="models-heading" className="substrate-editorial-heading">
                A model for the moment.
              </h2>
            </div>
            <p>
              Start with Lightning.
              <br />
              Earn the escalation.
            </p>
          </div>
          <div className="substrate-model-grid">
            {MODEL_TIERS.map((tier, index) => {
              const model = TIERS[tier];
              return (
                <article className="substrate-model" key={tier}>
                  <div className="substrate-model-top">
                    <span className="substrate-micro-label">{MODEL_ROLES[tier].label}</span>
                    <span className="substrate-model-index">
                      TIER {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3>{model.short}</h3>
                  <p className="substrate-model-name">{model.name}</p>
                  <p className="substrate-model-description">{MODEL_ROLES[tier].description}</p>
                  <p className="substrate-model-params">{model.params}</p>
                  <dl className="substrate-model-metrics">
                    <div>
                      <dt>Context window</dt>
                      <dd>
                        {model.context}
                        <span> tokens</span>
                      </dd>
                    </div>
                    <div>
                      <dt>Listed throughput</dt>
                      <dd>
                        {model.tokPerSec}
                        <span> tok/s</span>
                      </dd>
                    </div>
                  </dl>
                  <div className="substrate-model-price">
                    <span className="substrate-micro-label">Per 1M tokens</span>
                    <span>
                      {"$"}
                      {model.inPerM.toFixed(2)} <span>in</span>
                      <span className="substrate-price-separator">/</span>
                      {"$"}
                      {model.outPerM.toFixed(2)} <span>out</span>
                    </span>
                  </div>
                  <details className="substrate-model-endpoint">
                    <summary>
                      Model endpoint <Plus size={13} aria-hidden="true" />
                    </summary>
                    <code>{model.id}</code>
                  </details>
                </article>
              );
            })}
          </div>
          <p className="substrate-section-note">
            Published Token Factory list prices and endpoint throughput. The controller can
            escalate, de-escalate, acquire evidence, or stop.
          </p>
          <section className="substrate-evidence" aria-labelledby="evidence-heading">
            <Search size={29} strokeWidth={1} aria-hidden="true" />
            <div>
              <p className="substrate-eyebrow">When reasoning needs the world</p>
              <h3 id="evidence-heading">Another model isn’t always the answer.</h3>
              <p>
                Tavily brings in new evidence only when surviving hypotheses cannot be separated by
                the current packet. Search is a regulatory action, not an automatic detour.
              </p>
            </div>
            <a className="substrate-text-link" href="#connections">
              Test evidence acquisition <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </section>
        </div>
      </section>
      <section className="substrate-section substrate-signals" aria-labelledby="signals-heading">
        <div className="substrate-section-inner">
          <div className="substrate-section-heading">
            <div>
              <p className="substrate-eyebrow">Observable evidence. Nothing private.</p>
              <h2 id="signals-heading" className="substrate-stamp">
                Read the signal
              </h2>
            </div>
            <p>
              Nine inputs.
              <br />
              One calibration gap.
            </p>
          </div>
          <div className="substrate-signals-body">
            <div className="substrate-signals-copy">
              <h3>
                What the gap
                <br />
                is allowed to see.
              </h3>
              <p>
                Contradiction, incomplete coverage, unstable answers, old evidence. The gap comes
                from the packet and the trace, never a model’s private state.
              </p>
              <p>
                If a signal cannot be observed,
                <br />
                it is not in the gap.
              </p>
              <span className="substrate-micro-label">CONTROLLER WEIGHTS / SUM 1.00</span>
            </div>
            <dl className="substrate-signal-list">
              {WEIGHTS.map((item) => (
                <div key={item.key}>
                  <dt>{item.label}</dt>
                  <dd>
                    <span className="substrate-weight-track" aria-hidden="true">
                      <span style={{ width: String((item.w / 0.2) * 100) + "%" }} />
                    </span>
                    <span>{item.w.toFixed(2)}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>
      <section
        id="connections"
        className="substrate-section substrate-paper substrate-connections"
        aria-labelledby="connections-heading"
      >
        <div className="substrate-section-inner">
          <div className="substrate-section-heading">
            <div>
              <p className="substrate-eyebrow">From local harness to live inference</p>
              <h2 id="connections-heading" className="substrate-editorial-heading">
                Make contact.
              </h2>
            </div>
            <p>
              Check the connection.
              <br />
              Keep the judgment.
            </p>
          </div>
          {statusError && (
            <div className="substrate-status-error" role="status">
              <p>
                Connection status could not be checked. You can retry the status check or test
                either service below.
              </p>
              <button
                type="button"
                className="substrate-button substrate-button-outline"
                onClick={() => {
                  setStatus(null);
                  setStatusError(false);
                  setStatusRevision((value) => value + 1);
                }}
              >
                Retry status <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          )}
          <div className="substrate-connection-grid">
            <article className="substrate-connection">
              <div className="substrate-connection-heading">
                <Zap size={23} strokeWidth={1.4} aria-hidden="true" />
                <ConnectionStatus ready={status?.tokenFactory} error={statusError} />
              </div>
              <h3>Token Factory</h3>
              <p className="substrate-connection-description">
                Live inference from the Nemotron family. A short Lightning call checks that your
                connection is ready.
              </p>
              <p className="substrate-connection-endpoint">api.tokenfactory.nebius.com</p>
              <button
                type="button"
                className="substrate-button substrate-button-outline"
                disabled={busy !== null}
                aria-busy={busy === "lightning"}
                aria-controls="lightning-result"
                onClick={callLightning}
              >
                {busy === "lightning" ? (
                  <LoaderCircle className="substrate-loader" size={16} aria-hidden="true" />
                ) : (
                  <ArrowUpRight size={16} aria-hidden="true" />
                )}
                <span>{busy === "lightning" ? "Calling Lightning" : "Call Lightning"}</span>
              </button>
              <ProbeResult id="lightning-result" pending={busy === "lightning"} ok={lightning?.ok}>
                {lightning ? (
                  lightning.ok ? (
                    <>
                      <p>{lightning.text || "The connection responded without message text."}</p>
                      <p className="substrate-result-meta">{lightning.model}</p>
                      {lightning.usage && (
                        <p className="substrate-result-meta">
                          {lightning.usage.prompt_tokens ?? 0} input /{" "}
                          {lightning.usage.completion_tokens ?? 0} output tokens
                        </p>
                      )}
                    </>
                  ) : (
                    <p>{lightning.reason}</p>
                  )
                ) : (
                  <p>A key enables live calls. The closed-world harness works without one.</p>
                )}
              </ProbeResult>
            </article>
            <article className="substrate-connection">
              <div className="substrate-connection-heading">
                <Search size={23} strokeWidth={1.4} aria-hidden="true" />
                <ConnectionStatus ready={status?.tavily} error={statusError} />
              </div>
              <h3>Tavily</h3>
              <p className="substrate-connection-description">
                New evidence when the packet cannot settle the question. Check the search connection
                before a live trial.
              </p>
              <p className="substrate-connection-endpoint">api.tavily.com</p>
              <button
                type="button"
                className="substrate-button substrate-button-outline"
                disabled={busy !== null}
                aria-busy={busy === "tavily"}
                aria-controls="tavily-result"
                onClick={callTavily}
              >
                {busy === "tavily" ? (
                  <LoaderCircle className="substrate-loader" size={16} aria-hidden="true" />
                ) : (
                  <ArrowUpRight size={16} aria-hidden="true" />
                )}
                <span>{busy === "tavily" ? "Calling Tavily" : "Call Tavily"}</span>
              </button>
              <ProbeResult id="tavily-result" pending={busy === "tavily"} ok={tavily?.ok}>
                {tavily ? (
                  tavily.ok ? (
                    tavily.results.length ? (
                      <ul className="substrate-search-results">
                        {tavily.results.map((item, index) => (
                          <li key={item.url + index}>
                            <span>{item.title}</span>
                            <span className="substrate-result-meta">{item.url}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>The connection is ready. No results were returned for this test query.</p>
                    )
                  ) : (
                    <p>{tavily.reason}</p>
                  )
                ) : (
                  <p>
                    A key enables evidence acquisition. Search runs only when the controller calls
                    for it.
                  </p>
                )}
              </ProbeResult>
            </article>
          </div>
        </div>
      </section>
      <section className="substrate-job" aria-labelledby="jobs-heading">
        <div>
          <p className="substrate-eyebrow">Beyond the request path</p>
          <h2 id="jobs-heading">
            Same battery.
            <br />
            <em>Bigger questions.</em>
          </h2>
        </div>
        <div>
          <p>
            The evaluation lab is the job: the same controlled trials, the same metrics. Move the
            workload off the request path when trial counts or live inference outgrow a browser
            session.
          </p>
          <Link className="substrate-text-link" to="/lab">
            Open the evaluation lab <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>
      <footer className="substrate-footer">
        <div>
          <Plus size={17} strokeWidth={1} aria-hidden="true" />
          <span>Second Thought</span>
          <span className="substrate-footer-muted">Powered by NMM</span>
        </div>
        <span className="substrate-micro-label">OBSERVE → CALIBRATE → ALLOCATE</span>
      </footer>
    </div>
  );
}
function ConnectionStatus({ ready, error }: { ready?: boolean; error: boolean }) {
  return (
    <span className="substrate-connection-status">
      <span className="substrate-connection-dot" />
      {error
        ? "Status unavailable"
        : ready === undefined
          ? "Checking"
          : ready
            ? "Key present"
            : "Key needed"}
    </span>
  );
}
function ProbeResult({
  id,
  pending,
  ok,
  children,
}: {
  id: string;
  pending: boolean;
  ok?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      className="substrate-probe-result"
      tabIndex={0}
      aria-label={id === "lightning-result" ? "Token Factory response" : "Tavily response"}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="substrate-probe-result-heading">
        {pending ? (
          <>
            <LoaderCircle className="substrate-loader" size={13} aria-hidden="true" /> Waiting for
            response
          </>
        ) : ok === true ? (
          <>
            <Check size={13} aria-hidden="true" /> Connection verified
          </>
        ) : ok === false ? (
          <>Connection unavailable</>
        ) : (
          <>Before you call</>
        )}
      </div>
      {!pending && children}
    </div>
  );
}