import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, Pause, Play } from "lucide-react";
import { TIERS } from "@/lib/nmm/models";
import { ccg } from "@/lib/nmm/format";
import type { TraceEvent, TrialRun } from "@/lib/nmm/types";

type BenchHeroProps = {
  run: TrialRun;
  events: TraceEvent[];
  progress: number;
  complete: boolean;
  playing: boolean;
  onRun: () => void;
  onPause: () => void;
  onResume: () => void;
};

function currentDecision(events: TraceEvent[]): { label: string; detail: string } {
  const latest = [...events]
    .reverse()
    .find((event) => ["action", "commit", "halt", "read"].includes(event.type));
  if (!latest) {
    return { label: "Awaiting evidence", detail: "The regulatory trace begins on the first read." };
  }
  if (latest.type === "read") {
    return {
      label: "Calibration read",
      detail: "CCG " + ccg(latest.ccg) + " · " + TIERS[latest.tier].short,
    };
  }
  if (latest.type === "action") {
    const labels = {
      challenge: "Challenge the hypothesis",
      acquire: "Acquire missing evidence",
      escalate: "Escalate cognition",
      deescalate: "Reduce model capacity",
    } as const;
    return { label: labels[latest.action] ?? "Regulatory intervention", detail: latest.title };
  }
  if (latest.type === "halt") {
    return { label: "Stop, do not guess", detail: "The available evidence cannot discriminate." };
  }
  if (latest.type === "commit") {
    return { label: "Commit supported answer", detail: latest.label };
  }
  return { label: "Reading", detail: "A trace event has been recorded." };
}

export function BenchHero({
  run,
  events,
  progress,
  complete,
  playing,
  onRun,
  onPause,
  onResume,
}: BenchHeroProps) {
  const latestTierEvent = [...events]
    .reverse()
    .find(
      (event) =>
        event.type === "read" ||
        event.type === "action" ||
        event.type === "commit" ||
        event.type === "halt",
    );
  const lastRead = [...events].reverse().find((event) => event.type === "read");
  const currentTier = latestTierEvent ? TIERS[latestTierEvent.tier].short : "LIGHTNING";
  const currentCcg = lastRead && lastRead.type === "read" ? ccg(lastRead.ccg) : "—";
  const decision = currentDecision(events);
  const firstRead = events.find((event) => event.type === "read");
  const latestRead = [...events].reverse().find((event) => event.type === "read");
  const latestAction = [...events].reverse().find((event) => event.type === "action");
  const interventionCount = events.filter((event) => event.type === "action").length;
  const clampedProgress = Math.max(0, Math.min(100, progress * 100));
  const runPhase = complete
    ? "COMPLETE"
    : playing
      ? "RUNNING"
      : clampedProgress > 0
        ? "PAUSED"
        : "READY";
  const caseTitle =
    run.trial.id === "berth-7"
      ? "Why did cargo dwell time increase 41% at Berth 7?"
      : run.trial.id === "yield-440"
        ? "What if the evidence cannot tell two causes apart?"
        : "When is a smaller model already enough?";
  const caseExplanation =
    run.trial.id === "berth-7"
      ? "Berth 7 is a shipping terminal. Cargo is moving more slowly, and the obvious explanation may be wrong. See how the system examines competing causes instead of simply agreeing with the first report."
      : run.trial.id === "yield-440"
        ? "Two explanations fit the available observations. Watch NMM identify the missing evidence and decide whether it should stop instead of guess."
        : "The evidence already supports an answer. Watch NMM decide whether expensive, deeper inference would add anything useful.";
  const stage = complete
    ? "TRACE COMPLETE"
    : events.length
      ? "TRACE IN PROGRESS"
      : "AWAITING FIRST READ";

  return (
    <section className="bench-hero" aria-labelledby="bench-heading">
      <div className="bench-hero-atmosphere" aria-hidden="true">
        <div className="bench-hero-aura" />
        <div className="bench-hero-grain" />
      </div>
      <div className="bench-hero-inner">
        <div className="bench-hero-copy">
          <p className="bench-kicker">
            <span className="bench-signal-dot" />
            SECOND THOUGHT <span className="bench-kicker-slash">/</span> NMM REGULATORY RUNTIME
          </p>
          <h1 id="bench-heading">
            Reasoning is not
            <span className="bench-hero-serif">the verdict.</span>
          </h1>
          <p className="bench-hero-lead">
            The moment before a model commits is where intelligence needs a second thought.
          </p>
          <p className="bench-hero-body">
            Watch NMM observe the evidence, measure the Cognitive Calibration Gap, and let the
            Metacognitive Regulatory Layer decide whether to challenge, acquire, escalate, commit,
            or stop.
          </p>
          <div
            className={playing && !complete ? "bench-run-card is-running" : "bench-run-card"}
            aria-labelledby="bench-case-title"
          >
            <div className="bench-run-card-top">
              <span className="bench-run-eyebrow">CASE STUDY / {run.trial.kicker}</span>
              <span className="bench-run-phase" data-phase={runPhase}>
                <span className="bench-run-phase-dot" aria-hidden="true" /> {runPhase}
              </span>
            </div>
            <h2 id="bench-case-title">{caseTitle}</h2>
            <p className="bench-run-explanation" id="bench-case-intro">
              {caseExplanation}
            </p>
            <div className="bench-hero-actions">
              <button
                type="button"
                className="bench-hero-primary"
                onClick={onRun}
                aria-describedby="bench-case-intro"
              >
                <Play size={15} fill="currentColor" aria-hidden="true" />
                {complete
                  ? "Replay this case"
                  : playing || clampedProgress > 0
                    ? "Restart this case"
                    : "Run this case"}
              </button>
              {playing && !complete ? (
                <button type="button" className="bench-hero-outline" onClick={onPause}>
                  <Pause size={15} aria-hidden="true" /> Pause
                </button>
              ) : !complete && clampedProgress > 0 ? (
                <button type="button" className="bench-hero-outline" onClick={onResume}>
                  <Play size={15} aria-hidden="true" /> Resume
                </button>
              ) : null}
              <a href="#live-witness" className="bench-run-detail-link">
                Try real NVIDIA inference <ArrowUpRight size={16} aria-hidden="true" />
              </a>
              <a href="#bench-workbench" className="bench-run-detail-link">
                Inspect full trace <ArrowDownRight size={16} aria-hidden="true" />
              </a>
            </div>
            <div className="bench-run-monitor">
              <div className="bench-run-monitor-top">
                <span id="bench-run-status" role="status" aria-live="polite">
                  {complete
                    ? "Investigation finished. Review the verdict below."
                    : playing
                      ? "Investigating: " + decision.label
                      : clampedProgress > 0
                        ? "Paused: " + decision.label
                        : "Ready to examine the evidence"}
                </span>
                <strong>{Math.round(clampedProgress)}%</strong>
              </div>
              <div
                id="bench-run-progress"
                className="bench-run-progress"
                role="progressbar"
                aria-label="Investigation replay progress"
                aria-valuenow={Math.round(clampedProgress)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: clampedProgress + "%" }} />
              </div>
              <p className="bench-run-monitor-detail">
                {complete
                  ? decision.detail
                  : playing && events.length
                    ? decision.detail
                    : "The 15-second replay shows the controller's decisions as they happen."}
              </p>
            </div>
            <section className="bench-decision-shift" aria-label="How NMM changed the decision">
              <div className="bench-decision-shift-head">
                <span>THE DECISION SHIFT</span>
                <strong>{complete ? "CAUGHT BEFORE COMMIT" : events.length ? "INTERVENING" : "WAITING"}</strong>
              </div>
              <div className="bench-decision-shift-grid">
                <div>
                  <span>First read</span>
                  <p>{firstRead && firstRead.type === "read" ? firstRead.text : "No hypothesis formed yet."}</p>
                </div>
                <div>
                  <span>What NMM noticed</span>
                  <p>{latestRead && latestRead.type === "read" ? latestRead.text : "Waiting for observable evidence signals."}</p>
                </div>
                <div>
                  <span>What changed</span>
                  <p>{latestAction && latestAction.type === "action" ? latestAction.detail : "No regulatory intervention yet."}</p>
                </div>
                <div>
                  <span>Final judgment</span>
                  <p>{complete ? run.regulated.answerLabel : "Not committed."}</p>
                </div>
              </div>
            </section>
          </div>
          <p className="bench-hero-disclosure">
            <span className="bench-disclosure-line" />A deterministic, closed-world replay. Provider
            connections are checked separately.
          </p>
        </div>

        <div className="bench-stage" aria-label="NMM regulatory state from the current trial">
          <div className="bench-stage-top">
            <span>
              COGNITIVE PASS <span className="bench-stage-index">/ 001</span>
            </span>
            <span className="bench-stage-state">
              <i aria-hidden="true" /> {stage}
            </span>
          </div>
          <div className="bench-stage-orbit">
            <div className="bench-stage-grid" aria-hidden="true" />
            <svg className="bench-stage-rings" viewBox="0 0 440 440" aria-hidden="true">
              <circle cx="220" cy="220" r="164" className="bench-ring-outer" />
              <circle cx="220" cy="220" r="135" className="bench-ring-inner" />
              <circle cx="220" cy="220" r="108" className="bench-ring-guide" />
              <circle
                cx="220"
                cy="220"
                r="135"
                className="bench-ring-progress"
                strokeDasharray={String((clampedProgress / 100) * 848.23) + " 848.23"}
                transform="rotate(-90 220 220)"
              />
              <path d="M220 38V80M220 360v42M38 220h42M360 220h42" className="bench-ring-ticks" />
              <path d="M151 151l138 138M289 151L151 289" className="bench-ring-diagonals" />
            </svg>
            <div className="bench-stage-core">
              <span>METACOGNITIVE</span>
              <strong>MRL</strong>
              <small>Regulatory layer</small>
            </div>
            <div className="bench-orbit-node bench-orbit-node-a" aria-hidden="true" />
            <div className="bench-orbit-node bench-orbit-node-b" aria-hidden="true" />
            <span className="bench-stage-coordinate bench-stage-coordinate-top">NMM // 01</span>
            <span className="bench-stage-coordinate bench-stage-coordinate-bottom">
              {run.trial.kicker}
            </span>
          </div>
          <div className="bench-stage-route" aria-label="Regulatory stages">
            <span>01 / OBSERVE</span>
            <i aria-hidden="true" />
            <span>02 / CALIBRATE</span>
            <i aria-hidden="true" />
            <span>03 / REGULATE</span>
          </div>
          <div className="bench-stage-measures">
            <div>
              <span>{complete ? "FINAL MODEL" : "ALLOCATED MODEL"}</span>
              <strong>{currentTier}</strong>
            </div>
            <div>
              <span>CCG READING</span>
              <strong>{currentCcg}</strong>
            </div>
            <div>
              <span>INTERVENTIONS</span>
              <strong>{String(interventionCount).padStart(2, "0")}</strong>
            </div>
          </div>
          <div className="bench-stage-decision" aria-live="polite" aria-atomic="true">
            <div>
              <span>LATEST REGULATORY STATE</span>
              <strong>{decision.label}</strong>
              <p>{decision.detail}</p>
            </div>
            <ArrowUpRight size={20} aria-hidden="true" />
          </div>
          <div className="bench-stage-footer">
            <span>SECOND THOUGHT / {run.trial.id.toUpperCase()}</span>
            <span>{Math.round(clampedProgress)}% OF REPLAY</span>
          </div>
        </div>
      </div>
      <div className="bench-hero-bottom">
        <span>SOFTWARE SYSTEM FIRST. MODEL SECOND.</span>
        <Link to="/substrate">
          Explore the substrate <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}