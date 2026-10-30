import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const MODELS = {
  lightning: { id: 'nvidia/Nemotron-3_5-Lightning', inPerM: 0.06, outPerM: 0.24 },
  super: { id: 'nvidia/nemotron-3-super-120b-a12b', inPerM: 0.30, outPerM: 0.90 },
  ultra: { id: 'nvidia/Nemotron-3-Ultra-550b-a55b', inPerM: 1.00, outPerM: 3.00 },
};

const ev = (x) => ({ availability: 'initial', ...x });

export const TRIALS = {
  Berth: {
    id: 'berth-7', title: 'Berth 7', truth: 'exam', complexity: 'high', taskRisk: 0.80,
    question: 'What explains the 41% dwell-time increase at Berth 7 over the last 11 days?',
    hypotheses: [
      { id: 'labor', label: 'Labor stoppage' },
      { id: 'crane', label: 'Crane 3 still down' },
      { id: 'exam', label: 'Targeted exam on HS 8507' },
    ],
    framedAssumption: 'labor',
    failIfLeader: { hypothesis: 'labor', because: 'A stoppage of this scale would cut gate moves, but gate moves are up 6%.' },
    synthesis: { ids: ['hs-list', 'berth-order'], favors: 'exam' },
    tavilyQuery: 'HS 8507 customs targeted examination battery shipments port exam lane',
    evidence: [
      ev({ id:'bulletin', source:'ILWU bulletin', text:'Staffing talks may lead to job action if the local gets no reply. No date. No berth.', ageDays:42, salience:0.97, support:{labor:0.90,crane:0.05,exam:0.04} }),
      ev({ id:'gates', source:'Gate tally', text:'Inbound moves at Berth 7 are 6% above the trailing baseline.', ageDays:1, salience:0.26, support:{labor:0.08,crane:0.34,exam:0.22} }),
      ev({ id:'memo-down', source:'Ops memo', text:'Crane 3 reported offline after a hydraulic fault. No closeout in the packet.', ageDays:8, salience:0.70, support:{labor:0.06,crane:0.82,exam:0.08} }),
      ev({ id:'holds', source:'Customer cluster', text:'Complaints in this window say holds. They do not say gangs, and they do not say crane.', ageDays:2, salience:0.33, support:{labor:0.12,crane:0.18,exam:0.36} }),
      ev({ id:'hs-list', source:'Customs commodity list', text:'HS 8507 is on a targeted-exam list for this window. No terminal is named.', ageDays:1, salience:0.18, support:{labor:0.04,crane:0.10,exam:0.30}, availability:'retrievable' }),
      ev({ id:'berth-order', source:'Terminal order 19-B', text:'Berth 7 is assigned an extra exam lane for the same window. No commodity is named.', ageDays:1, salience:0.20, support:{labor:0.05,crane:0.16,exam:0.30}, availability:'retrievable' }),
    ],
  },
  Run440: {
    id: 'yield-440', title: 'Run 440', truth: 'abstain', complexity: 'high', taskRisk: 0.72,
    question: 'Which change caused the yield drop in run 440 — lot A impurity, or the lot B solvent swap?',
    hypotheses: [
      { id:'lot-a', label:'Lot A impurity' },
      { id:'lot-b', label:'Lot B solvent swap' },
    ],
    missingObservation: "A spiked control that reruns 440's feedstock with lot A's impurity in clean lot B solvent, or the reverse.",
    evidence: [
      ev({ id:'note-a', source:'Bench note A', text:'Lot A assayed above the impurity spec. Nothing shows the impurity reaches the yield step.', ageDays:1, salience:0.74, support:{'lot-a':0.61,'lot-b':0.30} }),
      ev({ id:'note-b', source:'Bench note B', text:'Lot B solvent was swapped that morning. No paired run uses the previous solvent.', ageDays:1, salience:0.68, support:{'lot-a':0.30,'lot-b':0.61} }),
      ev({ id:'hplc', source:'HPLC trace', text:'An unassigned peak sits between the two candidate retention times.', ageDays:0, salience:0.42, support:{'lot-a':0.50,'lot-b':0.50} }),
    ],
  },
  Door2: {
    id: 'door-2', title: 'Door 2', truth: 'closed', complexity: 'low', taskRisk: 0.12,
    question: 'Is the badge reader on door 2 failing closed, or failing open?',
    hypotheses: [
      { id:'closed', label:'Failing closed' },
      { id:'open', label:'Failing open' },
    ],
    evidence: [
      ev({ id:'denies', source:'Access log', text:'Three valid badges denied in nine minutes. The strike never released.', ageDays:0, salience:0.58, support:{closed:0.95,open:0.04} }),
      ev({ id:'latch', source:'Latch sensor', text:'The door stayed latched. No unsolicited open.', ageDays:0, salience:0.40, support:{closed:0.90,open:0.06} }),
      ev({ id:'camera', source:'Camera 2', text:'No tailgating and no door motion during the denies.', ageDays:0, salience:0.28, support:{closed:0.82,open:0.08} }),
    ],
  },
};

export function requireSecrets({ tavily = false } = {}) {
  if (!process.env.NEBIUS_API_KEY) throw new Error('NEBIUS_API_KEY is not set in this PowerShell session.');
  if (tavily && !process.env.TAVILY_API_KEY) throw new Error('TAVILY_API_KEY is not set in this PowerShell session.');
}

export const clamp01 = (n) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const argmax = (obj) => Object.entries(obj).sort((a,b) => b[1]-a[1])[0]?.[0] ?? '';
const recency = (ageDays) => Math.exp(-ageDays / 18);
const favorite = (support) => argmax(support);

function normalizePosterior(raw, trial, conclusionId, confidence) {
  const scores = {};
  for (const h of trial.hypotheses) scores[h.id] = 0.001;
  if (Array.isArray(raw)) {
    for (const row of raw) {
      const id = String(row?.id ?? '').trim();
      if (id in scores) scores[id] = Math.max(0.001, Number(row?.support ?? 0));
    }
  } else if (raw && typeof raw === 'object') {
    for (const [id, value] of Object.entries(raw)) if (id in scores) scores[id] = Math.max(0.001, Number(value ?? 0));
  }
  const hasSignal = Object.values(scores).some(v => v > 0.01);
  if (!hasSignal && conclusionId in scores) {
    const c = clamp01(confidence || 0.5);
    scores[conclusionId] = Math.max(0.34, c);
    const rest = Math.max(0.01, (1 - scores[conclusionId]) / Math.max(1, trial.hypotheses.length - 1));
    for (const id of Object.keys(scores)) if (id !== conclusionId) scores[id] = rest;
  }
  const total = Object.values(scores).reduce((a,b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(scores).map(([k,v]) => [k, v / total]));
}

export function rankPosterior(posterior) {
  const ranked = Object.entries(posterior).sort((a,b) => b[1]-a[1]);
  const p1 = ranked[0]?.[1] ?? 0;
  const p2 = ranked[1]?.[1] ?? 0;
  return { leader: ranked[0]?.[0] ?? '', second: ranked[1]?.[0] ?? '', confidence:p1, margin:p1-p2 };
}

export function evidencePosterior(trial, visible) {
  const scores = Object.fromEntries(trial.hypotheses.map(h => [h.id, 0.001]));
  for (const e of visible) {
    // Evidence support is trial metadata observable to the regulator, not ground truth.
    // Recency discounts stale observations. Salience changes influence only modestly so
    // a vivid but stale item cannot dominate a consistent packet by itself.
    const weight = recency(e.ageDays) * (0.75 + 0.25 * clamp01(e.salience ?? 0.5));
    for (const h of trial.hypotheses) scores[h.id] += weight * clamp01(e.support?.[h.id] ?? 0);
  }
  const total = Object.values(scores).reduce((a,b) => a+b,0) || 1;
  return Object.fromEntries(Object.entries(scores).map(([k,v]) => [k, v/total]));
}

export function fusePosteriors(trial, modelPosterior, observablePosterior, assessment) {
  const scores = {};
  const rankedModel = rankPosterior(modelPosterior);

  // Adaptive fusion rule:
  // - When the model is tied/indecisive, anchor strongly to observable evidence.
  // - When the model is only moderately decisive, keep a balanced evidence anchor.
  // - When a deeper pass is both confident and comparatively decisive, allow that live update
  //   to outweigh the packet prior. This prevents stale/legacy evidence from vetoing a valid
  //   high-information update while preserving Door 2 and Run 440 behavior.
  let modelWeight;
  if (rankedModel.margin < 0.05) modelWeight = 0.35;
  else if ((assessment?.confidence ?? 0) >= 0.70 && rankedModel.margin >= 0.15) {
    modelWeight = Math.min(0.78, 0.55 + 0.22 * clamp01(assessment.confidence));
  } else modelWeight = 0.45;

  const evidenceWeight = 1 - modelWeight;
  for (const h of trial.hypotheses) {
    scores[h.id] = modelWeight * (modelPosterior[h.id] ?? 0) + evidenceWeight * (observablePosterior[h.id] ?? 0);
  }

  // A categorical conclusion paired with an exact tie is internally inconsistent.
  // Add only a very small consistency nudge; this is not enough to overcome contradictory evidence.
  if (assessment?.conclusion_id in scores && rankedModel.margin < 0.02) {
    scores[assessment.conclusion_id] += 0.04;
  }

  const total = Object.values(scores).reduce((a,b) => a+b,0) || 1;
  const posterior = Object.fromEntries(Object.entries(scores).map(([k,v]) => [k, v/total]));
  Object.defineProperty(posterior, '__fusion', { value:{ modelWeight, evidenceWeight, modelMargin:rankedModel.margin }, enumerable:false });
  return posterior;
}

function pairConflict(a,b) {
  const fa = favorite(a.support), fb = favorite(b.support);
  if (!fa || !fb || fa === fb) return 0;
  return Math.min(a.support[fa] ?? 0, b.support[fb] ?? 0);
}

export function computeLiveSignals({ trial, visible, posterior, framingCleared, prevPosterior, assessment }) {
  const { leader, margin } = rankPosterior(posterior);
  let conflictSum = 0, pairs = 0;
  for (let i=0;i<visible.length;i++) for (let j=i+1;j<visible.length;j++) { conflictSum += pairConflict(visible[i],visible[j]); pairs++; }
  const contradiction = clamp01(pairs ? (conflictSum / pairs) * 1.35 : 0);

  const have = visible.reduce((s,e) => s + recency(e.ageDays) * (e.support[leader] ?? 0), 0);
  const coverageGapBySupport = clamp01(1 - have / 0.82);
  const cited = new Set([...(assessment.evidence_for ?? []), ...(assessment.evidence_against ?? [])].map(String));
  const coverageGapByCitation = visible.length ? clamp01(1 - cited.size / visible.length) : 1;
  const coverageGap = clamp01(0.65 * coverageGapBySupport + 0.35 * coverageGapByCitation);

  let assumptionCount = 0;
  if (!framingCleared && trial.framedAssumption && trial.framedAssumption === leader) assumptionCount++;
  for (const e of visible) if (e.salience >= 0.8 && e.ageDays > 20 && favorite(e.support) === leader) assumptionCount++;
  const assumptions = clamp01(assumptionCount / 2);

  let instability = 0;
  if (prevPosterior) {
    const prevLeader = argmax(prevPosterior);
    if (prevLeader && prevLeader !== leader) instability = 1;
    else {
      let drift = 0;
      for (const h of trial.hypotheses) drift += Math.abs((posterior[h.id] ?? 0) - (prevPosterior[h.id] ?? 0));
      instability = clamp01(drift / 2);
    }
  }

  const supporting = visible.filter(e => (e.support[leader] ?? 0) >= 0.25);
  const meanAge = supporting.length ? supporting.reduce((s,e) => s + e.ageDays,0)/supporting.length : 0;
  const evidenceAge = clamp01(meanAge / 40);
  const competition = clamp01(1 - margin);
  const verificationFail = trial.failIfLeader?.hypothesis === leader ? 1 : (assessment.verification === 'fail' ? 1 : 0);

  let infoStall = 0;
  if (prevPosterior) {
    let kl = 0;
    for (const h of trial.hypotheses) {
      const p = Math.max(posterior[h.id] ?? 0, 1e-6), q = Math.max(prevPosterior[h.id] ?? 0, 1e-6);
      kl += p * Math.log(p/q);
    }
    infoStall = kl < 0.015 ? 1 : 0;
  }

  return { contradiction, coverageGap, assumptions, instability, evidenceAge, competition, taskRisk:clamp01(trial.taskRisk), verificationFail, infoStall };
}

const WEIGHTS = { contradiction:0.20, coverageGap:0.16, assumptions:0.10, instability:0.10, evidenceAge:0.08, competition:0.16, taskRisk:0.08, verificationFail:0.06, infoStall:0.06 };
export function cognitiveCalibrationGap(signals) {
  return clamp01(Object.entries(WEIGHTS).reduce((s,[k,w]) => s + w * (signals[k] ?? 0), 0));
}

function extractJson(text) {
  const raw = String(text ?? '').trim();
  const unfenced = raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  try { return JSON.parse(unfenced); } catch {}
  const start = unfenced.indexOf('{'), end = unfenced.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(unfenced.slice(start,end+1)); } catch {}
  }
  return null;
}

function guessConclusionId(text, trial) {
  const s = String(text ?? '').toLowerCase();
  if (/abstain|cannot discriminate|insufficient evidence|not enough information|underdetermined/.test(s)) return 'abstain';
  for (const h of trial.hypotheses) {
    if (s.includes(h.id.toLowerCase()) || s.includes(h.label.toLowerCase())) return h.id;
  }
  if (trial.id === 'berth-7') {
    if (/targeted|exam|8507/.test(s)) return 'exam';
    if (/crane/.test(s)) return 'crane';
    if (/labor|stoppage|strike/.test(s)) return 'labor';
  }
  if (trial.id === 'yield-440') {
    if (/lot a|impurit/.test(s)) return 'lot-a';
    if (/lot b|solvent/.test(s)) return 'lot-b';
  }
  if (trial.id === 'door-2') {
    if (/fail(?:ing)?[- ]?closed|closed/.test(s)) return 'closed';
    if (/fail(?:ing)?[- ]?open|open/.test(s)) return 'open';
  }
  return '';
}

export function parseAssessment(content, trial) {
  const j = extractJson(content) ?? {};
  const conclusion_id = String(j.conclusion_id ?? guessConclusionId(j.conclusion ?? content, trial) ?? '').trim();
  const confidence = clamp01(Number(j.confidence ?? 0.5));
  const posterior = normalizePosterior(j.hypotheses, trial, conclusion_id, confidence);
  return {
    conclusion_id,
    conclusion: String(j.conclusion ?? content ?? '').slice(0,1200),
    confidence,
    posterior,
    evidence_for: Array.isArray(j.evidence_for) ? j.evidence_for.map(String) : [],
    evidence_against: Array.isArray(j.evidence_against) ? j.evidence_against.map(String) : [],
    unresolved: Array.isArray(j.unresolved) ? j.unresolved.map(String) : [],
    next_observation: j.next_observation == null ? null : String(j.next_observation),
    verification: ['pass','fail','unknown'].includes(j.verification) ? j.verification : 'unknown',
    reasoning_summary: String(j.reasoning_summary ?? '').slice(0,1200),
    raw: content,
  };
}

function evidenceText(items) {
  return items.map((e,i) => `${i+1}. [${e.id}] ${e.source} (age ${e.ageDays}d): ${e.text}`).join('\n');
}

export async function callNemotron({ trial, tier, phase, visible, instruction, events, receipts, verifiedCandidate = null }) {
  requireSecrets();
  const model = MODELS[tier];
  const started = Date.now();
  const at = new Date().toISOString();
  events?.push({ t:at, kind:'model_request', tier, model:model.id, phase });
  console.log(`[${at.slice(11,23)}] MODEL      ${tier.toUpperCase()} request · ${phase}`);
  const response = await fetch('https://api.tokenfactory.nebius.com/v1/chat/completions', {
    method:'POST',
    headers:{ Authorization:`Bearer ${process.env.NEBIUS_API_KEY}`, 'Content-Type':'application/json' },
    body: JSON.stringify({
      model:model.id,
      temperature:0,
      max_tokens: tier === 'ultra' ? 900 : tier === 'super' ? 650 : 450,
      messages:[
        { role:'system', content:`You are an inference engine inside a controlled epistemic calibration experiment. Do not reveal chain-of-thought. Return ONLY valid JSON with this schema: {"conclusion_id":"one supplied hypothesis id or abstain","conclusion":"short answer","confidence":0.0,"hypotheses":[{"id":"supplied hypothesis id","support":0.0}],"evidence_for":["evidence ids"],"evidence_against":["evidence ids"],"unresolved":["short unresolved issues"],"next_observation":"single most useful missing observation or null","verification":"pass|fail|unknown","reasoning_summary":"brief evidence-level summary, no hidden reasoning"}. Support values are comparative evidence support, not probabilities. Never invent evidence IDs.` },
        { role:'user', content:`TRIAL: ${trial.title}\nQUESTION: ${trial.question}\nHYPOTHESES:\n${trial.hypotheses.map(h => `- ${h.id}: ${h.label}`).join('\n')}\n\nOBSERVABLE EVIDENCE:\n${evidenceText(visible)}\n${verifiedCandidate ? `\nVERIFIED CANDIDATE FROM DEEP PASS: ${verifiedCandidate}\n` : ''}\nINSTRUCTION: ${instruction}` }
      ]
    }),
    signal:AbortSignal.timeout(tier === 'ultra' ? 90000 : 45000),
  });
  const body = await response.text();
  const latencyMs = Date.now() - started;
  if (!response.ok) throw new Error(`Token Factory ${response.status}: ${body.slice(0,800)}`);
  const json = JSON.parse(body);
  const content = json.choices?.[0]?.message?.content ?? '';
  const assessment = parseAssessment(content, trial);
  const receipt = { type:'nemotron', phase, tier, model:json.model ?? model.id, latencyMs, usage:json.usage ?? null, assessment, response:content };
  receipts?.push(receipt);
  const done = new Date().toISOString();
  events?.push({ t:done, kind:'model_response', tier, phase, latencyMs, usage:json.usage ?? null, conclusion_id:assessment.conclusion_id, confidence:assessment.confidence });
  console.log(`[${done.slice(11,23)}] RESPONSE   ${tier.toUpperCase()} ${latencyMs} ms · ${assessment.conclusion_id || 'unclassified'} · conf ${assessment.confidence.toFixed(2)}`);
  return receipt;
}

export async function callTavily({ query, events, receipts }) {
  requireSecrets({ tavily:true });
  const at = new Date().toISOString();
  console.log(`[${at.slice(11,23)}] TAVILY     live search: ${query}`);
  events?.push({ t:at, kind:'tavily_request', query });
  const started = Date.now();
  const response = await fetch('https://api.tavily.com/search', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ api_key:process.env.TAVILY_API_KEY, query, max_results:3, search_depth:'basic', include_answer:false }),
    signal:AbortSignal.timeout(30000),
  });
  const body = await response.text();
  const latencyMs = Date.now() - started;
  if (!response.ok) throw new Error(`Tavily ${response.status}: ${body.slice(0,800)}`);
  const json = JSON.parse(body);
  const results = (json.results ?? []).slice(0,3).map(x => ({ title:x.title ?? '', url:x.url ?? '', content:x.content ?? '' }));
  const receipt = { type:'tavily', query, latencyMs, results };
  receipts?.push(receipt);
  const done = new Date().toISOString();
  events?.push({ t:done, kind:'tavily_response', latencyMs, count:results.length });
  console.log(`[${done.slice(11,23)}] EVIDENCE   ${results.length} live Tavily results · ${latencyMs} ms`);
  return receipt;
}

export function initialEvidence(trial) { return trial.evidence.filter(e => e.availability === 'initial'); }
export function retrievableEvidence(trial) { return trial.evidence.filter(e => e.availability === 'retrievable'); }
export function synthesisReady(trial, visible) { return !!trial.synthesis && trial.synthesis.ids.every(id => visible.some(e => e.id === id)); }

export function scoreAssessment(trial, assessment) {
  const id = assessment?.conclusion_id || guessConclusionId(assessment?.conclusion ?? assessment?.raw ?? '', trial);
  const correct = trial.truth === 'abstain' ? id === 'abstain' : id === trial.truth;
  return { verdict:id || 'unclassified', correct, falseCertainty:!correct && (assessment?.confidence ?? 0) >= 0.8 };
}

export function summarizeUsage(receipts) {
  const totals = { prompt_tokens:0, completion_tokens:0, total_tokens:0, latencyMs:0, estimatedCostUsd:0, calls:{lightning:0,super:0,ultra:0,tavily:0} };
  for (const r of receipts) {
    totals.latencyMs += r.latencyMs ?? 0;
    if (r.type === 'tavily') { totals.calls.tavily++; continue; }
    if (r.type !== 'nemotron') continue;
    totals.calls[r.tier]++;
    const u = r.usage ?? {};
    const inn = u.prompt_tokens ?? 0, out = u.completion_tokens ?? 0;
    totals.prompt_tokens += inn; totals.completion_tokens += out; totals.total_tokens += u.total_tokens ?? (inn+out);
    const m = MODELS[r.tier]; totals.estimatedCostUsd += (inn*m.inPerM + out*m.outPerM)/1_000_000;
  }
  totals.estimatedCostUsd = Math.round(totals.estimatedCostUsd * 1e6) / 1e6;
  return totals;
}

export async function sealRun({ schema, runId, trial, mode, scientificBoundary, events, receipts, result, extra = {} }) {
  const record = { schema, runId, startedAt:extra.startedAt ?? null, completedAt:new Date().toISOString(), trial:{id:trial.id,title:trial.title,question:trial.question,truth:trial.truth}, mode, scientificBoundary, totals:summarizeUsage(receipts), result, events, receipts, ...extra };
  const canonical = JSON.stringify(record,null,2);
  const sha256 = createHash('sha256').update(canonical).digest('hex');
  const outDir = resolve('.secondthought','runs',runId);
  await mkdir(outDir,{recursive:true});
  await writeFile(resolve(outDir,'receipt.json'),canonical,'utf8');
  await writeFile(resolve(outDir,'SHA256.txt'),`${sha256}  receipt.json\n`,'utf8');
  return { outDir, sha256, record };
}

export function runIdFor(prefix, trial) {
  return `ST-${prefix}-${trial.id.toUpperCase()}-${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}`;
}

export function mrlEvent(events, action, detail, extra={}) {
  const t = new Date().toISOString();
  events.push({ t, kind:'mrl', action, detail, ...extra });
  console.log(`[${t.slice(11,23)}] MRL        ${action}${detail ? ` · ${detail}` : ''}`);
}

export function signalEvent(events, ccg, signals, ranked) {
  const t = new Date().toISOString();
  events.push({ t, kind:'signals', ccg, signals, ranked });
  console.log(`[${t.slice(11,23)}] CCG        ${ccg.toFixed(3)} · margin ${ranked.margin.toFixed(3)} · competition ${signals.competition.toFixed(3)} · coverage-gap ${signals.coverageGap.toFixed(3)}`);
}