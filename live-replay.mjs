import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const trialName = arg('--trial', 'Berth');
const nebiusKey = process.env.NEBIUS_API_KEY;
const tavilyKey = process.env.TAVILY_API_KEY;
if (!nebiusKey) throw new Error('NEBIUS_API_KEY is not set in this PowerShell session.');
if (!tavilyKey) throw new Error('TAVILY_API_KEY is not set in this PowerShell session.');

const MODELS = {
  lightning: 'nvidia/Nemotron-3_5-Lightning',
  super: 'nvidia/nemotron-3-super-120b-a12b',
  ultra: 'nvidia/Nemotron-3-Ultra-550b-a55b',
};

const trials = {
  Berth: {
    id: 'berth-7',
    title: 'Berth 7',
    question: 'What explains the 41% dwell-time increase at Berth 7 over the last 11 days?',
    initial: [
      ['ILWU bulletin', 'Staffing talks may lead to job action if the local gets no reply. No date. No berth.'],
      ['Gate tally', 'Inbound moves at Berth 7 are 6% above the trailing baseline.'],
      ['Ops memo', 'Crane 3 reported offline after a hydraulic fault. No closeout in the packet.'],
      ['Customer cluster', 'Complaints in this window say holds. They do not say gangs, and they do not say crane.'],
    ],
    acquired: [
      ['Customs commodity list', 'HS 8507 is on a targeted-exam list for this window. No terminal is named.'],
      ['Terminal order 19-B', 'Berth 7 is assigned an extra exam lane for the same window. No commodity is named.'],
    ],
    tavilyQuery: 'HS 8507 customs targeted examination battery shipments port exam lane',
    expected: 'Targeted exam on HS 8507',
    policy: ['lightning','tavily','super','ultra','lightning'],
  },
  Run440: {
    id: 'yield-440',
    title: 'Run 440',
    question: 'Which change caused the yield drop in run 440 — lot A impurity, or the lot B solvent swap?',
    initial: [
      ['Bench note A', 'Lot A assayed above the impurity spec. Nothing shows the impurity reaches the yield step.'],
      ['Bench note B', 'Lot B solvent was swapped that morning. No paired run uses the previous solvent.'],
      ['HPLC trace', 'An unassigned peak sits between the two candidate retention times.'],
    ],
    acquired: [],
    tavilyQuery: 'HPLC distinguish impurity effect solvent swap controlled experiment causal attribution',
    expected: 'Abstain; request a discriminating control.',
    policy: ['lightning','halt'],
  },
  Door2: {
    id: 'door-2',
    title: 'Door 2',
    question: 'Is the badge reader on door 2 failing closed, or failing open?',
    initial: [
      ['Access log', 'Three valid badges denied in nine minutes. The strike never released.'],
      ['Latch sensor', 'The door stayed latched. No unsolicited open.'],
      ['Camera 2', 'No tailgating and no door motion during the denies.'],
    ],
    acquired: [],
    tavilyQuery: 'access control fail closed badge reader strike remains latched definition',
    expected: 'Failing closed',
    policy: ['lightning','commit'],
  },
};

const trial = trials[trialName];
if (!trial) throw new Error(`Unknown trial ${trialName}. Use Berth, Run440, or Door2.`);

const runId = `ST-${trial.id.toUpperCase()}-${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}`;
const events = [];
const receipts = [];
const startedAt = new Date().toISOString();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toISOString();
function emit(kind, detail, extra={}) {
  const ev = { t: ts(), kind, detail, ...extra };
  events.push(ev);
  const tag = kind.padEnd(10).slice(0,10);
  console.log(`[${ev.t.slice(11,23)}] ${tag} ${detail}`);
}

function evidenceText(items) {
  return items.map(([source,text],i) => `${i+1}. ${source}: ${text}`).join('\n');
}

async function callNemotron(tier, phase, evidence, instruction) {
  const model = MODELS[tier];
  emit('MODEL', `${tier.toUpperCase()} request`, { model, phase });
  const before = Date.now();
  const response = await fetch('https://api.tokenfactory.nebius.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${nebiusKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: tier === 'ultra' ? 700 : tier === 'super' ? 520 : 360,
      messages: [
        {
          role: 'system',
          content: 'You are participating in a controlled epistemic calibration trial. Do not reveal chain-of-thought. Return only a compact JSON object with keys conclusion, confidence (0-1), evidence_for, evidence_against, unresolved, next_observation. Use null when no next observation is needed.'
        },
        {
          role: 'user',
          content: `TRIAL: ${trial.title}\nQUESTION: ${trial.question}\n\nOBSERVABLE EVIDENCE:\n${evidenceText(evidence)}\n\nINSTRUCTION: ${instruction}`
        }
      ]
    }),
    signal: AbortSignal.timeout(tier === 'ultra' ? 90000 : 45000),
  });
  const body = await response.text();
  const latencyMs = Date.now() - before;
  if (!response.ok) throw new Error(`Token Factory ${response.status}: ${body.slice(0,500)}`);
  const json = JSON.parse(body);
  const content = json.choices?.[0]?.message?.content ?? '';
  const receipt = {
    type: 'nemotron', phase, tier, model: json.model ?? model,
    latencyMs, usage: json.usage ?? null, response: content,
  };
  receipts.push(receipt);
  emit('RESPONSE', `${tier.toUpperCase()} ${latencyMs} ms`, { usage: json.usage ?? null });
  return receipt;
}

async function callTavily(query) {
  emit('TAVILY', `live search: ${query}`);
  const before = Date.now();
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: tavilyKey, query, max_results: 3, search_depth: 'basic', include_answer: false }),
    signal: AbortSignal.timeout(30000),
  });
  const body = await response.text();
  const latencyMs = Date.now() - before;
  if (!response.ok) throw new Error(`Tavily ${response.status}: ${body.slice(0,500)}`);
  const json = JSON.parse(body);
  const results = (json.results ?? []).slice(0,3).map(x => ({ title: x.title ?? '', url: x.url ?? '', content: x.content ?? '' }));
  const receipt = { type: 'tavily', query, latencyMs, results };
  receipts.push(receipt);
  emit('EVIDENCE', `${results.length} live Tavily results`, { latencyMs });
  return receipt;
}

console.log('');
console.log('====================================================================');
console.log(` SECOND THOUGHT // LIVE SUBSTRATE REPLAY // ${trial.title.toUpperCase()}`);
console.log('====================================================================');
console.log(`RUN ID  ${runId}`);
console.log('MODE    live substrate replay');
console.log('NOTE    NMM transition policy comes from the deterministic reference engine.');
console.log('        Model outputs, usage, latency, and Tavily retrieval below are live.');
console.log('');

if (trialName === 'Berth') {
  await callNemotron('lightning', 'initial-read', trial.initial,
    'Assess the competing explanations. Treat the old labor bulletin as a hypothesis, not ground truth. State what remains unresolved.');
  emit('MRL', 'reference policy: CHALLENGE primary assumption');
  const tavily = await callTavily(trial.tavilyQuery);
  emit('MRL', 'reference policy: ACQUIRE controlled trial evidence');
  const packet = [...trial.initial, ...trial.acquired,
    ...tavily.results.map((r,i) => [`Tavily live result ${i+1}`, `${r.title}. ${r.content}`])];
  await callNemotron('super', 'post-acquisition', packet,
    'Reassess after acquisition. The two controlled trial observations are authoritative for this synthetic case; Tavily results are external context only. Identify whether the hypotheses are now separable.');
  emit('MRL', 'reference policy: ESCALATE to Ultra');
  await callNemotron('ultra', 'deep-discrimination', packet,
    'Resolve the case using only the observable packet. Explicitly test labor stoppage, crane outage, and targeted examination against all observations. Return the best-supported conclusion or abstain.');
  emit('MRL', 'reference policy: DE-ESCALATE to Lightning');
  await callNemotron('lightning', 'final-statement', packet,
    'State the final answer in the requested JSON format. Do not add unsupported facts.');
} else if (trialName === 'Run440') {
  await callNemotron('lightning', 'discrimination-test', trial.initial,
    'Determine whether the evidence can distinguish lot A impurity from the lot B solvent swap. If it cannot, abstain and name the single most useful discriminating control.');
  emit('MRL', 'reference policy: HALT; no Super or Ultra call justified');
} else if (trialName === 'Door2') {
  await callNemotron('lightning', 'low-complexity-read', trial.initial,
    'Classify the failure as fail-closed or fail-open. Use the fresh evidence only.');
  emit('MRL', 'reference policy: COMMIT on Lightning; zero Super/Ultra calls');
}

const completedAt = new Date().toISOString();
const totals = receipts.filter(r => r.type === 'nemotron').reduce((acc,r) => {
  const u = r.usage ?? {};
  acc.prompt_tokens += u.prompt_tokens ?? 0;
  acc.completion_tokens += u.completion_tokens ?? 0;
  acc.total_tokens += u.total_tokens ?? ((u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0));
  return acc;
}, { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });

const record = {
  schema: 'second-thought-live-replay/v1', runId, startedAt, completedAt,
  trial: { id: trial.id, title: trial.title, question: trial.question, expected: trial.expected },
  mode: 'live-substrate-replay',
  scientificBoundary: 'NMM transition sequence is replayed from the deterministic reference engine. Nemotron outputs, token usage, latency, and Tavily retrieval are live. This run is not yet a fully adaptive live CCG/MRL loop.',
  policy: trial.policy,
  totals,
  events,
  receipts,
};
const canonical = JSON.stringify(record, null, 2);
const sha256 = createHash('sha256').update(canonical).digest('hex');
const outDir = resolve('.secondthought','runs',runId);
await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir,'receipt.json'), canonical, 'utf8');
await writeFile(resolve(outDir,'SHA256.txt'), `${sha256}  receipt.json\n`, 'utf8');

console.log('');
console.log('--------------------------------------------------------------------');
console.log(`EXPECTED  ${trial.expected}`);
console.log(`TOKENS    ${totals.total_tokens}`);
console.log(`RECEIPT   ${outDir}\\receipt.json`);
console.log(`SHA256    ${sha256}`);
console.log('--------------------------------------------------------------------');