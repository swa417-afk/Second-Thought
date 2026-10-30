import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, ChartNoAxesCombined, ShieldCheck } from "lucide-react";
import { useMemo } from "react";

import { runBattery } from "@/lib/nmm/battery";
import { money, pct, seconds, tokens } from "@/lib/nmm/format";
import { summarize } from "@/lib/nmm/metrics";
import { TIERS } from "@/lib/nmm/models";

const CONDITION_LABEL: Record<string, string> = {
  easy: "Low complexity",
  stale: "Stale salient anchor",
  external: "Needs external evidence",
  underdetermined: "Nothing can discriminate",
};

export function LabView() {
  const report = useMemo(() => summarize(runBattery()), []);
  const chart = [
    {
      name: "Accuracy",
      baseline: Math.round(report.baseline.accuracy * 100),
      regulated: Math.round(report.regulated.accuracy * 100),
    },
    {
      name: "False certainty",
      baseline: Math.round(report.baseline.falseCertainty * 100),
      regulated: Math.round(report.regulated.falseCertainty * 100),
    },
    {
      name: "Calibration error",
      baseline: Math.round(report.baseline.ece * 100),
      regulated: Math.round(report.regulated.ece * 100),
    },
  ];
  const rows = [
    ["Task accuracy", pct(report.baseline.accuracy), pct(report.regulated.accuracy)],
    ["False certainty", pct(report.baseline.falseCertainty), pct(report.regulated.falseCertainty)],
    ["Calibration error", report.baseline.ece.toFixed(2), report.regulated.ece.toFixed(2)],
    [
      "Evidence acquisition",
      String(report.baseline.acquisitions),
      String(report.regulated.acquisitions),
    ],
    [
      "Escalated off Lightning",
      String(report.baseline.escalations),
      String(report.regulated.escalations),
    ],
    [
      "De-escalated to Lightning",
      String(report.baseline.deescalations),
      String(report.regulated.deescalations),
    ],
    ["Abstained", String(report.baseline.abstentions), String(report.regulated.abstentions)],
    ["Mean tokens", tokens(report.baseline.meanTokens), tokens(report.regulated.meanTokens)],
    ["Mean latency", seconds(report.baseline.meanLatency), seconds(report.regulated.meanLatency)],
    ["Mean cost", money(report.baseline.meanCost), money(report.regulated.meanCost)],
  ];

  return (
    <div className="lab-experience">
      <header className="lab-hero">
        <div className="lab-hero-glow" aria-hidden="true" />
        <div className="lab-container lab-hero-layout">
          <div className="lab-hero-copy">
            <p className="lab-eyebrow">
              <span className="lab-dot" /> SECOND THOUGHT / EVALUATION LAB
            </p>
            <h1>
              Intelligence deserves <em>an audit.</em>
            </h1>
            <p className="lab-hero-lead">
              Model size is not a cognitive policy. The evidence should decide when deeper reasoning
              is worth it.
            </p>
            <p className="lab-hero-detail">
              Compare an unregulated Nemotron Ultra baseline against the NMM controller on the same
              seeded, closed-world trials. Inspect accuracy, false certainty, calibration, and
              resource allocation without mistaking a simulation for live inference.
            </p>
            <div className="lab-hero-actions">
              <a href="#lab-results" className="lab-main-action">
                Explore the results <ArrowDownRight size={17} aria-hidden="true" />
              </a>
              <Link to="/" className="lab-secondary-action">
                Watch one decision <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div
            className="lab-hero-graphic"
            aria-label="Evaluation design: matched baseline and regulated comparisons"
          >
            <div className="lab-graphic-head">
              <span>CONTROLLED EVALUATION</span>
              <span>BATTERY / 01</span>
            </div>
            <div className="lab-graphic-core">
              <div className="lab-graphic-ring lab-graphic-ring-outer" aria-hidden="true" />
              <div className="lab-graphic-ring lab-graphic-ring-inner" aria-hidden="true" />
              <span className="lab-graphic-small">MATCHED CONDITIONS</span>
              <strong>{report.n}</strong>
              <span className="lab-graphic-caption">SEEDED TRIALS</span>
              <span className="lab-graphic-axis lab-graphic-axis-x" aria-hidden="true" />
              <span className="lab-graphic-axis lab-graphic-axis-y" aria-hidden="true" />
            </div>
            <div className="lab-graphic-foot">
              <span>BASELINE / ULTRA</span>
              <span>VS</span>
              <span>NMM / REGULATED</span>
            </div>
          </div>
        </div>
      </header>

      <div className="lab-container lab-body">
        <section className="lab-intro" aria-labelledby="lab-overview">
          <div>
            <p className="lab-eyebrow">01 / EXPERIMENTAL RESULTS</p>
            <h2 id="lab-overview">
              What regulation <em>changes.</em>
            </h2>
          </div>
          <p>
            Four controlled failure conditions with sixteen seeded trials each. The unregulated
            baseline stays on {TIERS.ultra.short}. NMM begins on {TIERS.lightning.short} and changes
            cognitive allocation only when its calibration rules call for it.
          </p>
        </section>

        <div className="lab-metric-grid">
          <Metric
            label="Closed-world intervention success"
            value={pct(report.interventionSuccess)}
            detail="Share of baseline failures the controller corrected, including warranted abstention."
            index="01"
          />
          <Metric
            label="Modeled cost reduction"
            value={pct(1 - report.costRatio)}
            detail="Estimated savings against unregulated Ultra on matched cases."
            index="02"
          />
          <Metric
            label="Modeled token reduction"
            value={pct(1 - report.tokenRatio)}
            detail="Estimated change in token usage across the same seeded trials."
            index="03"
          />
        </div>

        <section className="lab-chart-panel" id="lab-results" aria-labelledby="lab-chart-heading">
          <div className="lab-panel-top">
            <div>
              <p className="lab-eyebrow">02 / SIDE-BY-SIDE EVIDENCE</p>
              <h2 id="lab-chart-heading">Where the arms diverge.</h2>
            </div>
            <div className="lab-chart-legend" aria-label="Chart legend">
              <span>
                <i className="lab-swatch lab-swatch-baseline" /> Baseline Ultra
              </span>
              <span>
                <i className="lab-swatch lab-swatch-regulated" /> Second Thought
              </span>
            </div>
          </div>
          <p className="lab-chart-note">
            Outcome percentages generated by the closed-world evaluation harness, not observed
            live-model benchmarks.
          </p>
          <div
            className="lab-comparison-bars"
            role="img"
            aria-label="Comparison of baseline Ultra and Second Thought percentages for accuracy, false certainty, and calibration error. Values are also in the following table."
          >
            {chart.map((metric, index) => (
              <div className="lab-bar-group" key={metric.name}>
                <div className="lab-bar-group-heading">
                  <span>
                    {String(index + 1).padStart(2, "0")} / {metric.name}
                  </span>
                </div>
                <div className="lab-bar-row">
                  <span className="lab-bar-series">Baseline Ultra</span>
                  <div className="lab-bar-track">
                    <div
                      className="lab-bar-fill baseline"
                      style={{ width: metric.baseline + "%" }}
                    />
                  </div>
                  <strong>{metric.baseline}%</strong>
                </div>
                <div className="lab-bar-row">
                  <span className="lab-bar-series">Second Thought</span>
                  <div className="lab-bar-track">
                    <div
                      className="lab-bar-fill regulated"
                      style={{ width: metric.regulated + "%" }}
                    />
                  </div>
                  <strong>{metric.regulated}%</strong>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="lab-table-section" aria-labelledby="lab-table-heading">
          <div className="lab-panel-top">
            <div>
              <p className="lab-eyebrow">03 / REPRODUCIBLE COMPARISON</p>
              <h2 id="lab-table-heading">Every metric. Both paths.</h2>
            </div>
            <p>Same seeded tasks. Different regulatory decisions.</p>
          </div>
          <div className="lab-table-scroll">
            <table className="lab-metrics-table">
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  <th scope="col">Baseline Ultra</th>
                  <th scope="col">Second Thought / NMM</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row[0]}>
                    <th scope="row">{row[0]}</th>
                    <td>{row[1]}</td>
                    <td>{row[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="lab-detail-grid" aria-label="Evaluation breakdown">
          <div className="lab-detail-panel">
            <p className="lab-eyebrow">04 / FAILURE CONDITIONS</p>
            <h2>Where intervention matters.</h2>
            <ul className="lab-condition-list">
              {report.byCondition.map((row) => (
                <li key={row.condition}>
                  <span>{CONDITION_LABEL[row.condition]}</span>
                  <span className="lab-condition-baseline">
                    Ultra {row.baseline}/{row.n}
                  </span>
                  <span className="lab-condition-regulated">
                    NMM {row.regulated}/{row.n}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="lab-detail-panel">
            <p className="lab-eyebrow">05 / COGNITIVE ALLOCATION</p>
            <h2>Highest tier used.</h2>
            <ul className="lab-tier-list">
              {(Object.keys(report.highestTier) as (keyof typeof report.highestTier)[]).map(
                (tier) => (
                  <li key={tier}>
                    <span>{TIERS[tier].short}</span>
                    <strong>{report.highestTier[tier]}</strong>
                  </li>
                ),
              )}
            </ul>
            <p className="lab-small">
              Highest tier touched, including a later de-escalation. The efficient allocation is a
              result, not a fallback.
            </p>
          </div>
        </section>

        <footer className="lab-method-note">
          <div className="lab-method-mark" aria-hidden="true">
            <ShieldCheck size={22} />
          </div>
          <div>
            <p className="lab-eyebrow">METHODOLOGY / PROOF BOUNDARY</p>
            <h2>Know exactly what was tested.</h2>
            <p>
              This is a deterministic, closed-world simulation of observable failures: salience
              anchoring, stale framing, missing evidence, and symmetric hypotheses. It is not a
              claim that these results transfer to open-web tasks or that live Nemotron responses
              were measured. Prices are modeled from Token Factory list rates; token counts, costs,
              and latency are harness estimates. A configured API key alone does not convert this
              replay into a live benchmark.
            </p>
          </div>
          <Link to="/" className="lab-method-link">
            See the controller reason <ChartNoAxesCombined size={18} aria-hidden="true" />
          </Link>
        </footer>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  index,
}: {
  label: string;
  value: string;
  detail: string;
  index: string;
}) {
  return (
    <article className="lab-metric">
      <div className="lab-metric-top">
        <span>{label}</span>
        <span>{index} / 03</span>
      </div>
      <p className="lab-metric-value">{value}</p>
      <p className="lab-metric-desc">{detail}</p>
    </article>
  );
}