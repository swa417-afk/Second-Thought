# Second Thought pressure controller v2: engineering validation

Declared 2026-10-15 before any v2 inference. Sierra Warren remains the author of the NMM research and frozen protocol. This document records implementation changes and limits; it does not revise the research claims, ground truth, frozen cases, or earlier receipts.

## Diagnosed defects

The earlier legacy timezone scorer rejected B,C,A when dates were interspersed and could accept an alphabetical wrong answer by filtering all letters down to a,b,c. The local application runner concatenated later turns into initial input. Its detector executed a solver before recording the policy selection. A microliter classification used a misleading startsWith("m") test. These observations are reproducible implementation defects, not newly observed model results.

The frozen legacy six-case run remains unchanged. Its reported PT-02 N1 outcome is an evaluator false negative, but the recorded action/trigger still fails the frozen mechanism requirements. PT-02 C1 returned a non-JSON response at its 360-token ceiling. The old envelope did not preserve finish_reason, so truncation is a hypothesis rather than a confirmed cause. Reasoning-token usage in the stored pilot is zero; private reasoning is not an established cause of that failure.

## Controller boundary

The CLI and unit pressure witness call src/lib/nmm/pressure-runtime.mjs::executePressureTrial. They share detector structure checks, CCG signals/weights, action mapping, tool execution, provider parser, and event sequencing. No case ID, expected trigger, ground truth, or pass condition enters that function. Generic controls receive the same neutral verification tool catalog; C1 receives only the paired N1 numeric token total.

The original Berth 7 adapter remains a different evidence acquisition profile. It shares the CCG function and acquisition gate, retains its 0.3 threshold, and is not represented as equivalent to the typed pressure profile (threshold 0.1). The first seven recognizable task structures are deterministic checks, including an explicit existing-subject guard for contradictory universal premises. Other detections use a bounded model detector. These checks were developed with knowledge of this synthetic suite. This is development validation, not a blinded generalization study or proof of human-state coupling.

## Declared run profile

Model: nvidia/Nemotron-3_5-Lightning. Temperature 0; JSON output; chat_template_kwargs.enable_thinking=false. Token ceilings: initial 640, detector 320, regulated final 480, generic critique 320, generic review 480, model evaluator 240. Generic review minimum 96; at most eight passes. No automatic failed-response retries.

One genuine initial response is shared across the four arms for a case. Only the first turn is sent before that response; later evidence is admitted afterwards. N1 precedes C1 to establish its numeric budget. Order is not randomized. Inference tokens count actual prompt plus completion tokens including failed calls when reported. A shared first call is counted per arm for allocation but deduplicated for observed billing. Post-hoc evaluation is excluded from compute matching and included in unique observed total usage. Token matching is within ten percent, not FLOP matching; unmatched pairs are retained and reported.

Every live run writes a declaration with source and frozen-suite SHA-256 before its first call. Receipts and summaries use exclusive creation and individual SHA-256 files. HTTP/auth/transport/schema/truncation failures remain recorded; authentication rejection blocks remaining calls. Provider response bodies, secrets, and private reasoning are not relayed. Unknown or duplicated evidence IDs fail before commitment. Empty or invalid envelopes never become successful answers.

Deterministic outcome checks are limited to PT-01, PT-02, PT-06, and PT-19. Other cases use an explicitly labeled model post-hoc evaluator. This evaluator is not independent adjudication. Ground truth is introduced only after the final commitment, with no feedback to the controller. Initial correctness is reported only where a deterministic evaluator exists; an unchanged string is not automatically a semantically confirmed answer.

## Validation and publication boundary

Run the six-case pilot once to validate execution, then all twenty cases once with a separate run ID. Preserve both results and all failures. Report execution completion, final outcomes, trigger/action mechanism credit, false positives, changed/unchanged answers, and C1 match coverage separately. A full outcome score cannot replace mechanism evidence or a matched-control comparison. The live witness presents bounded public evidence, real event order, and an answer change indicator without simulating a wrong first answer.

The source and live evidence are a deployment candidate until build/type checks and development/production browser checks pass. No publication or production deployment is implied by this addendum.