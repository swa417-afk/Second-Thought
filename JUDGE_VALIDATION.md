# Judge validation

Prepared for the Nebius x NVIDIA Global AI Hackathon.

## Fresh local check

On October 29, 2026, the current Second Thought submission working tree completed:

```text
npm run pressure:test
tests 22
pass 22
fail 0
```

The focused suite covers deterministic typed control actions, runner argument parsing, trigger-to-policy routing, semantic outcome scoring, mechanism verdicts, and deterministic detector behavior.

## TypeScript compiler note

A full `tsc --noEmit` attempt on the submission laptop did not produce TypeScript diagnostics; the Node process terminated with a V8 allocation/out-of-memory error, including after a 4 GB heap allowance. This is recorded as an environment/runtime limitation, not reported as a successful typecheck.

## Evidence boundaries

- The Bench is a deterministic reference experience, not live provider inference.
- Live provider paths use NVIDIA Nemotron models through Nebius Token Factory.
- Tavily retrieval remains distinct from controlled evaluation evidence.
- The 12-case comparison does not show general reasoning superiority; generic self-critique scored 19/24 while Second Thought scored 18/24.
- The 300-row evidence catalog contains ten individually inspected primary sources and 290 metadata-verified discovery candidates.

The project claim is narrower: typed reliability detection can produce an observable pre-commit policy intervention and a bounded receipt of what changed.
