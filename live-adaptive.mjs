import {
  TRIALS, requireSecrets, initialEvidence, retrievableEvidence, synthesisReady,
  callNemotron, callTavily, computeLiveSignals, cognitiveCalibrationGap, rankPosterior,
  evidencePosterior, fusePosteriors,
  scoreAssessment, sealRun, runIdFor, mrlEvent, signalEvent, summarizeUsage,
} from './live-core.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 && argv[i+1] ? argv[i+1] : fallback; };
const trialName = arg('--trial','Berth');
const trial = TRIALS[trialName];
if (!trial) throw new Error(`Unknown trial ${trialName}. Use Berth, Run440, or Door2.`);
requireSecrets({ tavily:false });

export async function runAdaptive(name = trialName) {
  const t = TRIALS[name];
  if (!t) throw new Error(`Unknown trial ${name}`);
  const runId = runIdFor('ADAPTIVE', t);
  const events = [], receipts = [];
  const startedAt = new Date().toISOString();
  let visible = initialEvidence(t);
  let acquired = false;
  let framingCleared = !t.framedAssumption;
  let prevPosterior = null;
  let tier = 'lightning';
  let escalated = false, deescalated = false, challenged = false;
  let terminal = null;
  let lastReceipt = null;

  console.log('');
  console.log('====================================================================');
  console.log(` SECOND THOUGHT // LIVE ADAPTIVE NMM // ${t.title.toUpperCase()}`);
  console.log('====================================================================');
  console.log(`RUN ID  ${runId}`);
  console.log('MODE    live adaptive NMM');
  console.log('BOUNDARY  Nemotron responses drive the live posterior. Observable evidence metadata + live posterior drive CCG/MRL.');
  console.log('          Ground truth is used only after termination for scoring.');
  console.log('');

  for (let step=0; step<9 && !terminal; step++) {
    const instruction = tier === 'lightning'
      ? 'Assess the evidence packet. Preserve uncertainty. Identify contradictions and the most useful missing observation if the hypotheses are not separable.'
      : tier === 'super'
        ? 'Reassess the evidence at greater depth. Test the leading hypothesis against contradictory observations. Preserve unresolved alternatives.'
        : 'Perform a deep discrimination pass over all supplied evidence. Try to falsify the leading hypothesis. Commit only if the packet supports discrimination; otherwise abstain.';

    lastReceipt = await callNemotron({ trial:t, tier, phase:`adaptive-step-${step+1}`, visible, instruction, events, receipts });
    const assessment = lastReceipt.assessment;
    const modelPosterior = assessment.posterior;
    const observablePosterior = evidencePosterior(t, visible);
    const posterior = fusePosteriors(t, modelPosterior, observablePosterior, assessment);
    const ranked = rankPosterior(posterior);
    const signals = computeLiveSignals({ trial:t, visible, posterior, framingCleared, prevPosterior, assessment });
    const ccg = cognitiveCalibrationGap(signals);
    const fmtPosterior = (p) => t.hypotheses.map(h => `${h.id} ${(p[h.id] ?? 0).toFixed(2)}`).join(' · ');
    console.log(`[${new Date().toISOString().slice(11,23)}] POSTERIOR  model [${fmtPosterior(modelPosterior)}]`);
    console.log(`[${new Date().toISOString().slice(11,23)}] EVIDENCE   packet [${fmtPosterior(observablePosterior)}]`);
    const fusion = posterior.__fusion ?? { modelWeight:0.45, evidenceWeight:0.55 };
    console.log(`[${new Date().toISOString().slice(11,23)}] FUSED      [${fmtPosterior(posterior)}] · margin ${ranked.margin.toFixed(3)} · model-weight ${fusion.modelWeight.toFixed(2)}`);
    events.push({ t:new Date().toISOString(), kind:'posterior_fusion', modelPosterior, observablePosterior, fusedPosterior:posterior, margin:ranked.margin, fusion });
    signalEvent(events, ccg, signals, ranked);

    const unused = retrievableEvidence(t);
    const canRetrieve = unused.length > 0 && !acquired;
    const unresolvedHigh = assessment.unresolved.length > 0 || !!assessment.next_observation;
    const joint = synthesisReady(t, visible);

    // Low-complexity problems should remain cheap when the live posterior is already decisive.
    if (t.complexity === 'low' && ccg < 0.28 && ranked.margin > 0.42 && signals.verificationFail < 0.5 && assessment.conclusion_id !== 'abstain') {
      mrlEvent(events,'COMMIT',`Lightning is sufficient; fused margin ${ranked.margin.toFixed(2)}, CCG ${ccg.toFixed(2)}.`);
      terminal = { kind:'commit', assessment:{ ...assessment, posterior }, tier, ccg };
      break;
    }

    // Challenge only when the live leader is riding the framed assumption or verification has failed.
    if (!challenged && !framingCleared && t.framedAssumption && (ranked.leader === t.framedAssumption || signals.verificationFail >= 0.5 || signals.assumptions >= 0.5)) {
      challenged = true;
      framingCleared = true;
      mrlEvent(events,'CHALLENGE', t.failIfLeader?.because ?? 'The leading account is entangled with a framed assumption.');
      prevPosterior = posterior;
      continue;
    }

    // Acquire only if the current packet cannot adequately discriminate and retrievable evidence exists.
    if (canRetrieve && (ccg >= 0.20 || ranked.margin < 0.48 || signals.coverageGap >= 0.25 || signals.competition >= 0.42 || signals.verificationFail >= 0.5 || unresolvedHigh)) {
      mrlEvent(events,'ACQUIRE','Current packet is not sufficient to discriminate the surviving hypotheses.');
      if (t.tavilyQuery && process.env.TAVILY_API_KEY) await callTavily({ query:t.tavilyQuery, events, receipts });
      visible = [...visible, ...unused];
      acquired = true;
      prevPosterior = posterior;
      continue;
    }

    // If no additional observation is available and the live assessment still cannot separate candidates, halt.
    const noMoreEvidence = !canRetrieve;
    const genuinelyOpen = ranked.margin < 0.28 || (unresolvedHigh && assessment.confidence < 0.78) || assessment.conclusion_id === 'abstain';
    if (noMoreEvidence && genuinelyOpen && !joint) {
      mrlEvent(events,'HALT', assessment.next_observation || t.missingObservation || 'A discriminating observation is required.');
      terminal = { kind:'halt', assessment:{ ...assessment, conclusion_id:'abstain' }, tier, ccg };
      break;
    }

    // High-risk cross-source synthesis earns deeper cognition. The threshold is evaluated from the live posterior.
    const highRiskSynthesis = joint && t.taskRisk >= 0.70;
    if (tier === 'lightning' && noMoreEvidence && (ccg >= 0.18 || ranked.margin < 0.72 || highRiskSynthesis)) {
      mrlEvent(events,'ESCALATE',`Lightning → Super; CCG ${ccg.toFixed(2)}, margin ${ranked.margin.toFixed(2)}.`);
      tier = 'super'; escalated = true; prevPosterior = posterior; continue;
    }

    // For a high-risk synthesis case, Super must clear a stronger evidence bar before it is allowed to commit.
    if (tier === 'super' && noMoreEvidence && (ccg >= 0.14 || ranked.margin < 0.82 || highRiskSynthesis)) {
      mrlEvent(events,'ESCALATE',`Super → Ultra; deep falsification justified by residual calibration gap.`);
      tier = 'ultra'; escalated = true; prevPosterior = posterior; continue;
    }

    // At Ultra, either the case is separable or additional thinking has lost epistemic value.
    if (tier === 'ultra') {
      const separable = ranked.margin >= 0.25 && assessment.confidence >= 0.68 && signals.verificationFail < 0.5 && ccg < 0.48 && assessment.conclusion_id !== 'abstain';
      if (separable) {
        mrlEvent(events,'DEESCALATE',`Ultra settled ${assessment.conclusion_id}; Lightning will articulate the verified conclusion.`);
        deescalated = true;
        const final = await callNemotron({
          trial:t, tier:'lightning', phase:'final-articulation', visible,
          verifiedCandidate:`${assessment.conclusion_id}: ${assessment.conclusion}`,
          instruction:'State the verified candidate compactly. Reopen it only if the supplied evidence directly contradicts it.',
          events, receipts,
        });
        if (final.assessment.conclusion_id === assessment.conclusion_id) {
          terminal = { kind:'commit', assessment:final.assessment, tier:'lightning', ccg };
        } else {
          mrlEvent(events,'ARTICULATION_GUARD',`Lightning articulation drifted to ${final.assessment.conclusion_id || 'unclassified'}; preserving Ultra-verified ${assessment.conclusion_id}.`);
          terminal = { kind:'commit', assessment:{ ...assessment, reasoning_summary:`Ultra-verified conclusion preserved after articulation drift. ${assessment.reasoning_summary ?? ''}` }, tier:'ultra', ccg };
        }
        break;
      }
      mrlEvent(events,'HALT', assessment.next_observation || 'Deep reasoning did not close the calibration gap; further tokens are not justified.');
      terminal = { kind:'halt', assessment:{ ...assessment, conclusion_id:'abstain' }, tier, ccg };
      break;
    }

    // Moderate-risk separable cases may commit at Lightning/Super without forcing Ultra.
    const separable = ranked.margin >= 0.32 && assessment.confidence >= 0.70 && signals.verificationFail < 0.5 && ccg < 0.40 && !unresolvedHigh;
    if (separable) {
      mrlEvent(events,'COMMIT',`${tier} evidence is sufficient; no larger model justified.`);
      terminal = { kind:'commit', assessment, tier, ccg };
      break;
    }

    // Remaining unresolved medium/high cases escalate one tier rather than looping without information gain.
    if (tier === 'lightning') {
      mrlEvent(events,'ESCALATE','Residual uncertainty remains after available evidence; Lightning → Super.');
      tier = 'super'; escalated = true; prevPosterior = posterior; continue;
    }
    if (tier === 'super') {
      mrlEvent(events,'ESCALATE','Residual uncertainty remains after Super; Super → Ultra.');
      tier = 'ultra'; escalated = true; prevPosterior = posterior; continue;
    }
  }

  if (!terminal) {
    const assessment = lastReceipt?.assessment ?? { conclusion_id:'abstain', confidence:0, conclusion:'No terminal decision.', posterior:{}, unresolved:['step limit'], next_observation:'Inspect trace.' };
    mrlEvent(events,'HALT','Adaptive step limit reached.');
    terminal = { kind:'halt', assessment:{...assessment, conclusion_id:'abstain'}, tier, ccg:1 };
  }

  const scored = scoreAssessment(t, terminal.assessment);
  const result = { kind:terminal.kind, tier:terminal.tier, ccg:terminal.ccg, verdict:scored.verdict, correct:scored.correct, falseCertainty:scored.falseCertainty, confidence:terminal.assessment.confidence, answer:terminal.assessment.conclusion, nextObservation:terminal.assessment.next_observation, escalated, deescalated, acquired, challenged };
  const sealed = await sealRun({
    schema:'second-thought-live-adaptive/v1', runId, trial:t, mode:'live-adaptive-nmm',
    scientificBoundary:'Nemotron output determines the live hypothesis posterior. CCG is computed from that posterior plus observable evidence metadata. MRL transitions are selected at runtime without consulting ground truth. Ground truth is used only after termination for scoring.',
    events, receipts, result, extra:{startedAt}
  });
  const totals = summarizeUsage(receipts);
  console.log('');
  console.log('--------------------------------------------------------------------');
  console.log(`ACTUAL    ${result.verdict}`);
  console.log(`TRUTH     ${t.truth}`);
  console.log(`MATCH     ${result.correct ? 'PASS' : 'FAIL'}`);
  console.log(`TOKENS    ${totals.total_tokens}`);
  console.log(`LATENCY   ${totals.latencyMs} ms API time`);
  console.log(`CALLS     Lightning ${totals.calls.lightning} · Super ${totals.calls.super} · Ultra ${totals.calls.ultra} · Tavily ${totals.calls.tavily}`);
  console.log(`COST*     $${totals.estimatedCostUsd.toFixed(6)} estimated from project price table`);
  console.log(`RECEIPT   ${sealed.outDir}\\receipt.json`);
  console.log(`SHA256    ${sealed.sha256}`);
  console.log('--------------------------------------------------------------------');
  return sealed.record;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g,'/')}` || process.argv[1]?.endsWith('live-adaptive.mjs')) {
  await runAdaptive(trialName);
}