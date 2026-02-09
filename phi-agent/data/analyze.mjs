import { readFileSync } from 'node:fs';

const path = process.argv[2] || 'eval-log-test-progress.jsonl';
const lines = readFileSync(path, 'utf-8').split('\n').filter(l => l.trim());
const data = lines.map(l => JSON.parse(l));

const species = {};
for (const d of data) {
  if (!species[d.loadout]) species[d.loadout] = { n:0, evals:0, h:0, w:0, d:0, busE:0, busR:0 };
  const s = species[d.loadout];
  s.n++;
  for (const e of d.evaluations) {
    s.evals++;
    s.h += e.h;
    s.w += e.w;
    s.d += e.d;
  }
  s.busE += d.busEmits || 0;
  s.busR += d.busRecvs || 0;
}

console.log(`Total: ${data.length} sessions`);
console.log(`${'Loadout'.padEnd(12)} ${'Sess'.padStart(4)} ${'Evals'.padStart(5)} ${'avgH'.padStart(5)} ${'avgW'.padStart(5)} ${'avgD'.padStart(5)} ${'BusE'.padStart(4)} ${'BusR'.padStart(4)}`);
console.log('-'.repeat(55));
for (const [name, s] of Object.entries(species).sort()) {
  if (s.evals === 0) continue;
  console.log(`${name.padEnd(12)} ${String(s.n).padStart(4)} ${String(s.evals).padStart(5)} ${(s.h/s.evals).toFixed(1).padStart(5)} ${(s.w/s.evals).toFixed(1).padStart(5)} ${(s.d/s.evals).toFixed(1).padStart(5)} ${String(s.busE).padStart(4)} ${String(s.busR).padStart(4)}`);
}
