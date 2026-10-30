import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TRIALS } from './live-core.mjs';
import { runBaselineLive } from './live-baseline.mjs';
import { runAdaptive } from './live-adaptive.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 && argv[i+1] ? argv[i+1] : fallback; };
const trialName = arg('--trial','Berth');
const trial = TRIALS[trialName];
if (!trial) throw new Error(`Unknown trial ${trialName}`);

console.log('');
console.log('####################################################################');
console.log(` SECOND THOUGHT // LIVE COMPARISON // ${trial.title.toUpperCase()}`);
console.log('####################################################################');

const baseline = await runBaselineLive(trialName);
const adaptive = await runAdaptive(trialName);
const bt = baseline.totals, at = adaptive.totals;
const comparison = {
  schema:'second-thought-live-comparison/v1',
  trial:{id:trial.id,title:trial.title,truth:trial.truth},
  createdAt:new Date().toISOString(),
  baseline:{runId:baseline.runId,result:baseline.result,totals:bt},
  adaptive:{runId:adaptive.runId,result:adaptive.result,totals:at},
  delta:{
    tokens:at.total_tokens-bt.total_tokens,
    latencyMs:at.latencyMs-bt.latencyMs,
    estimatedCostUsd:Math.round((at.estimatedCostUsd-bt.estimatedCostUsd)*1e6)/1e6,
    correct:(adaptive.result.correct?1:0)-(baseline.result.correct?1:0),
    falseCertainty:(adaptive.result.falseCertainty?1:0)-(baseline.result.falseCertainty?1:0),
  }
};
const canonical=JSON.stringify(comparison,null,2);
const sha256=createHash('sha256').update(canonical).digest('hex');
const outDir=resolve('.secondthought','comparisons',`${trial.id}-${Date.now()}`);
await mkdir(outDir,{recursive:true});
await writeFile(resolve(outDir,'comparison.json'),canonical,'utf8');
await writeFile(resolve(outDir,'SHA256.txt'),`${sha256}  comparison.json\n`,'utf8');

const fmt=(n)=>String(n).padStart(10);
console.log('');
console.log('====================================================================');
console.log(' LIVE RESULT                 ULTRA-ONLY       NMM ADAPTIVE');
console.log('====================================================================');
console.log(`Correct                     ${fmt(baseline.result.correct?'YES':'NO')}       ${fmt(adaptive.result.correct?'YES':'NO')}`);
console.log(`Verdict                     ${String(baseline.result.verdict).padStart(10)}       ${String(adaptive.result.verdict).padStart(10)}`);
console.log(`Tokens                      ${fmt(bt.total_tokens)}       ${fmt(at.total_tokens)}`);
console.log(`API latency ms              ${fmt(bt.latencyMs)}       ${fmt(at.latencyMs)}`);
console.log(`Est. model cost USD         ${fmt(bt.estimatedCostUsd.toFixed(6))}       ${fmt(at.estimatedCostUsd.toFixed(6))}`);
console.log(`False certainty             ${fmt(baseline.result.falseCertainty?'YES':'NO')}       ${fmt(adaptive.result.falseCertainty?'YES':'NO')}`);
console.log('--------------------------------------------------------------------');
console.log(`COMPARISON  ${outDir}\\comparison.json`);
console.log(`SHA256      ${sha256}`);
console.log('====================================================================');