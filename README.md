# Second Thought

Second Thought is an evidence-first pre-commit control layer for AI agents. It makes visible when an agent should acquire more evidence, increase reasoning effort, preserve uncertainty, or hold a tool action before dispatch.

Built for the **Nebius x NVIDIA Global AI Hackathon**, the live runtime uses NVIDIA Nemotron models through Nebius Token Factory. A separate judge-facing experience preserves preloaded evaluation reports and sealed receipts so reviewers can inspect the demonstrated behavior without needing the project owner's API credentials.

## What it does

Second Thought inserts an observable control step between a candidate judgment and final commitment:

```text
candidate judgment
  -> reliability signal / detector event
  -> policy decision
  -> bounded intervention
  -> final judgment or deferral
  -> receipt
```

The goal is not to expose hidden chain-of-thought. The system records bounded execution telemetry: detector events, evidence references, policy before and after intervention, control action, final judgment, judgment delta, provider usage/latency, and receipt hashes.

## Nebius + NVIDIA implementation

The provider-backed path calls Nebius Token Factory's OpenAI-compatible chat-completions API and uses:

- `nvidia/Nemotron-3_5-Lightning` for fast assessment and routine passes.
- `nvidia/nemotron-3-super-120b-a12b` for deeper intermediate evaluation.
- `nvidia/Nemotron-3-Ultra-550b-a55b` for the highest-effort bounded reasoning pass.

The adaptive controller can escalate or de-escalate model effort based on observable evidence and reliability signals. Tavily is an optional runtime retrieval path; retrieved web context remains separate from controlled evaluation evidence and does not silently increase controlled-evidence coverage.

Key implementation files:

- `live-core.mjs` — provider calls, evidence scoring, signal computation, receipt primitives.
- `live-adaptive.mjs` — adaptive policy/controller.
- `live-baseline.mjs` — baseline comparison path.
- `compare-live.mjs` — adaptive-versus-baseline comparisons.
- `src/lib/nmm/` — policy, detector, probe, pressure, and temporal-control logic.
- `scripts/nmm-pressure-runner.mjs` — frozen pressure-suite execution.

## Working demo

Hosted judge-facing application:

https://second-thought-eta.vercel.app

The Bench is a deterministic reference experience used to make the intervention sequence inspectable. It is not represented as live provider-performance evidence. Live Nemotron execution and sealed provider receipts are documented separately.

Controlled examples include:

- **Berth 7** — operational diagnosis under conflicting and incomplete evidence.
- **Run 440** — experimental-control review where the available evidence may not discriminate between competing causes.
- **Door 2** — low-risk access-device diagnosis.
- **Synthetic refund boundary** — tool-dispatch control with argument binding and backend eligibility checks.

## Evaluation boundary

A fixed 12-case pilot compared direct answering, generic self-critique, and Second Thought with two repeats per case. The latest detector revision completed 71 of 72 planned cells. Final passes were:

- Direct answering: **13/24**
- Generic self-critique: **19/24**
- Second Thought: **18/24**

This pilot does **not** establish general reasoning superiority. Overall answer accuracy did not improve over generic self-critique. The demonstrated contribution is narrower: typed reliability detection can produce an observable policy intervention before commitment, and the resulting execution can be preserved as an auditable receipt.

A separate frozen 20-case NMM pressure suite is included as an evaluation asset, not a fine-tuning dataset.

## Evidence-bank boundary

The repository also contains an evidence-bank research path. A 300-row catalog exists, but only ten primary sources were individually opened and inspected. The additional 290 entries are metadata-verified discovery candidates and are not presented as independently validated research findings or compliance determinations.

See `docs/research/EVIDENCE_BANK_STATUS.md`.

## Requirements

- Node.js 24.x recommended
- npm
- Git
- PowerShell for the provided Windows launcher
- Nebius Token Factory API key for live inference
- Tavily API key only for runtime paths that use Tavily retrieval

No API keys should be committed to the repository.

## Install

```powershell
git clone https://github.com/swa417-afk/Second-Thought.git
Set-Location Second-Thought
npm install
```

Set provider credentials in the current session:

```powershell
$env:NEBIUS_API_KEY = Read-Host "NEBIUS_API_KEY"
$env:TAVILY_API_KEY = Read-Host "TAVILY_API_KEY"
```

The Tavily key is optional unless the selected live path requires retrieval.

### Judge quick check

The frozen deterministic pressure suite does not require provider credentials or a dependency install:

```powershell
npm run pressure:test
npm run pressure:dry
```

The current submission working tree passed the focused pressure suite with **22 tests passed and 0 failed** on October 29, 2026.

## Preflight and local demo

```powershell
.\SecondThought.ps1 -Mode Preflight
.\SecondThought.ps1 -Mode Demo -Trial Berth
```

Other seeded trials:

```powershell
.\SecondThought.ps1 -Mode Demo -Trial Run440
.\SecondThought.ps1 -Mode Demo -Trial Door2
```

The local reference experience runs on port `8080`.

## Live provider path

With `NEBIUS_API_KEY` configured:

```powershell
.\SecondThought.ps1 -Mode Live -Trial Door2
```

For an adaptive-versus-baseline comparison:

```powershell
.\SecondThought.ps1 -Mode Compare -Trial Door2
```

These modes make live provider calls and consume provider usage.

## Validation

Focused project checks:

```powershell
npm run typecheck
npm run pressure:test
npm run evidence:test
npm run pressure:v2:test
```

Additional browser and provider-backed scripts are available under `scripts/`. Historical receipts and evaluation artifacts are preserved separately from source changes so later fixes do not rewrite earlier evidence.

## Significant work during the hackathon

Second Thought was developed during the hackathon submission period. Work during this period includes the provider-backed Nemotron controller, adaptive model-tier routing, Tavily evidence acquisition, sealed execution receipts, the Bench and Live Witness interfaces, a frozen NMM pressure suite, pre-commit tool-action controls, temporal/date-conflict handling, evidence-bank/relational-evidence experiments, and judge-facing evaluation artifacts.

## Safety and claims

Second Thought is a bounded research prototype. It does not claim:

- production non-bypassability;
- universal detector reliability;
- general reasoning superiority;
- that metadata-only evidence records have been individually validated;
- that preloaded Bench traces are live inference.

The project is designed to make bounded control interventions and their evidence inspectable.

## License

MIT License. See `LICENSE`.

Copyright (c) 2026 Sierra Warren.

## Research authorship and public record

Second Thought was created and developed by **Sierra N. Warren** as an implemented, bounded agent-control research prototype. It is one part of a wider but distinct body of research; it does **not** establish the full human-state-dependent NMM architecture.

- [Dated public research and evidence record (31 October 2026)](docs/research/SIERRA_WARREN_RESEARCH_PUBLIC_RECORD_2026-10-31.md)
- [Sierra Warren Research: public identity and research areas](docs/research/SIERRA_WARREN_RESEARCH_BRAND.md)
- [NMM original archival record (Zenodo, 18 May 2026)](https://doi.org/10.5281/zenodo.20263924)

The record distinguishes author claims, independently available archives, local engineering evidence, and work still requiring empirical validation or external replication.
