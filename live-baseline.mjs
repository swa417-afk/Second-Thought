import {
  TRIALS, requireSecrets, initialEvidence, retrievableEvidence, callNemotron, callTavily,
  scoreAssessment, sealRun, runIdFor, summarizeUsage,
} from './live-core.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 && argv[i+1] ? argv[i+1] : fallback; };
const trialName = arg('--trial','Berth');

export async function runBaselineLive(name = trialName) {
  const trial = TRIALS[name];
  if (!trial) throw new Error(`Unknown trial ${name}. Use Berth, Run440, or Door2.`);
  requireSecrets();
  const runId = runIdFor('BASELINE',trial);
  const events=[], receipts=[];
  const startedAt = new Date().toISOString();
  let visible = [...initialEvidence(trial), ...retrievableEvidence(trial)];

  console.log('');
  console.log('====================================================================');
  console.log(` SECOND THOUGHT // ULTRA-ONLY BASELINE // ${trial.title.toUpperCase()}`);
  console.log('====================================================================');
  console.log(`RUN ID  ${runId}`);
  console.log('MODE    Ultra-only baseline');
  console.log('NOTE    Baseline receives all controlled evidence up front. This favors the baseline on information access.');
  console.log('');

  if (trial.tavilyQuery && process.env.TAVILY_API_KEY) {
    const tav = await callTavily({query:trial.tavilyQuery,events,receipts});
    // Tavily remains contextual and is not converted into synthetic controlled evidence.
    events.push({ t:new Date().toISOString(), kind:'baseline_context', tavilyResults:tav.results.length });
  }
  const r = await callNemotron({
    trial, tier:'ultra', phase:'ultra-only-baseline', visible,
    instruction:'Use all supplied evidence. Give the best-supported answer. If the evidence cannot discriminate, abstain and name the missing observation.',
    events, receipts,
  });
  const scored = scoreAssessment(trial,r.assessment);
  const result = { kind:scored.verdict === 'abstain' ? 'halt' : 'commit', tier:'ultra', verdict:scored.verdict, correct:scored.correct, falseCertainty:scored.falseCertainty, confidence:r.assessment.confidence, answer:r.assessment.conclusion, nextObservation:r.assessment.next_observation };
  const sealed = await sealRun({ schema:'second-thought-live-baseline/v1', runId, trial, mode:'ultra-only-baseline', scientificBoundary:'Single Ultra inference with all controlled evidence supplied up front. Ground truth is used only after the response for scoring.', events, receipts, result, extra:{startedAt} });
  const totals = summarizeUsage(receipts);
  console.log('');
  console.log('--------------------------------------------------------------------');
  console.log(`ACTUAL    ${result.verdict}`);
  console.log(`TRUTH     ${trial.truth}`);
  console.log(`MATCH     ${result.correct ? 'PASS' : 'FAIL'}`);
  console.log(`TOKENS    ${totals.total_tokens}`);
  console.log(`LATENCY   ${totals.latencyMs} ms API time`);
  console.log(`CALLS     Ultra ${totals.calls.ultra} · Tavily ${totals.calls.tavily}`);
  console.log(`COST*     $${totals.estimatedCostUsd.toFixed(6)} estimated from project price table`);
  console.log(`RECEIPT   ${sealed.outDir}\\receipt.json`);
  console.log(`SHA256    ${sealed.sha256}`);
  console.log('--------------------------------------------------------------------');
  return sealed.record;
}

if (process.argv[1]?.endsWith('live-baseline.mjs')) await runBaselineLive(trialName);