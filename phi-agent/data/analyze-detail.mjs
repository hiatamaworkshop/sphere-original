import { readFileSync } from 'node:fs';

const path = process.argv[2] || 'eval-log-test-progress.jsonl';
const lines = readFileSync(path, 'utf-8').split('\n').filter(l => l.trim());
const data = lines.map(l => JSON.parse(l));

// Species stats
const species = {};
for (const d of data) {
  if (!species[d.loadout]) species[d.loadout] = { n:0, evals:0, h:[], w:[], d_:[], busE:0, busR:0, dur:[] };
  const s = species[d.loadout];
  s.n++;
  s.dur.push(d.duration || 0);
  for (const e of d.evaluations) {
    s.evals++;
    s.h.push(e.h);
    s.w.push(e.w);
    s.d_.push(e.d);
  }
  s.busE += d.busEmits || 0;
  s.busR += d.busRecvs || 0;
}

const avg = arr => arr.reduce((a,b)=>a+b,0)/arr.length;
const std = arr => { const m = avg(arr); return Math.sqrt(arr.reduce((s,x)=>s+(x-m)**2,0)/arr.length); };

console.log('=== qwen2.5:0.5b Daemon Mode Test Results ===');
console.log(`Total: ${data.length} sessions, ${data.reduce((s,d)=>s+d.evaluations.length,0)} evaluations`);
console.log(`Duration: ~${Math.round((data[data.length-1].timestamp - data[0].timestamp)/60000)} min\n`);

console.log(`${'Loadout'.padEnd(12)} ${'Sess'.padStart(4)} ${'Evals'.padStart(5)} ${'avgH'.padStart(6)} ${'stdH'.padStart(5)} ${'avgW'.padStart(6)} ${'stdW'.padStart(5)} ${'avgD'.padStart(6)} ${'stdD'.padStart(5)} ${'BusE'.padStart(4)} ${'BusR'.padStart(4)} ${'avgMs'.padStart(6)}`);
console.log('-'.repeat(80));
for (const [name, s] of Object.entries(species).sort()) {
  if (s.evals === 0) continue;
  console.log(`${name.padEnd(12)} ${String(s.n).padStart(4)} ${String(s.evals).padStart(5)} ${avg(s.h).toFixed(1).padStart(6)} ${std(s.h).toFixed(1).padStart(5)} ${avg(s.w).toFixed(1).padStart(6)} ${std(s.w).toFixed(1).padStart(5)} ${avg(s.d_).toFixed(1).padStart(6)} ${std(s.d_).toFixed(1).padStart(5)} ${String(s.busE).padStart(4)} ${String(s.busR).padStart(4)} ${(avg(s.dur)/1000).toFixed(0).padStart(5)}s`);
}

// Score distributions
console.log('\n=== Score Distribution ===');
for (const [name, s] of Object.entries(species).sort()) {
  const hHist = new Array(11).fill(0);
  const wHist = new Array(11).fill(0);
  for (const v of s.h) hHist[Math.min(10, Math.max(0, Math.round(v)))]++;
  for (const v of s.w) wHist[Math.min(10, Math.max(0, Math.round(v)))]++;
  console.log(`\n${name}:`);
  console.log(`  h: ${hHist.map((c,i) => c > 0 ? `${i}:${c}` : '').filter(Boolean).join(' ')}`);
  console.log(`  w: ${wHist.map((c,i) => c > 0 ? `${i}:${c}` : '').filter(Boolean).join(' ')}`);
}

// Comparison with baseline
console.log('\n=== Comparison with phi3:mini Baseline ===');
console.log(`${'Loadout'.padEnd(12)} ${'0.5B h'.padStart(7)} ${'3B h'.padStart(7)} ${'Δh'.padStart(6)} ${'0.5B w'.padStart(7)} ${'3B w'.padStart(7)} ${'Δw'.padStart(6)}`);
console.log('-'.repeat(55));
const baseline = { balanced: {h:5.3,w:4.5}, wanderer: {h:7.0,w:4.9}, moth: {h:6.7,w:3.5}, hermit: {h:5.3,w:3.9} };
for (const [name, s] of Object.entries(species).sort()) {
  const bName = name === 'balanced' ? 'wanderer' : name;
  const b = baseline[bName] || baseline[name];
  if (!b) continue;
  const h05 = avg(s.h);
  const w05 = avg(s.w);
  console.log(`${name.padEnd(12)} ${h05.toFixed(1).padStart(7)} ${b.h.toFixed(1).padStart(7)} ${(h05-b.h) > 0 ? '+' : ''}${(h05-b.h).toFixed(1).padStart(5)} ${w05.toFixed(1).padStart(7)} ${b.w.toFixed(1).padStart(7)} ${(w05-b.w) > 0 ? '+' : ''}${(w05-b.w).toFixed(1).padStart(5)}`);
}
