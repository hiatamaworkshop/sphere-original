// Analyze eval-log.jsonl data quality
const fs = require('fs');
const path = process.argv[2] || '/tmp/eval-log-snapshot.jsonl';
const lines = fs.readFileSync(path, 'utf8').trim().split('\n');
const entries = lines.map(l => JSON.parse(l));
const mini = entries.filter(e => e.model === 'phi3:mini');
const oneB = entries.filter(e => e.model === 'llama3.2:1b');
const legacy = entries.filter(e => !e.model);

function summarize(group, label) {
  const byLoadout = {};
  for (const e of group) {
    if (!byLoadout[e.loadout]) byLoadout[e.loadout] = { sessions: 0, evals: 0, hSum: 0, wSum: 0, dSum: 0, busEmit: 0, busRecv: 0 };
    const b = byLoadout[e.loadout];
    b.sessions++;
    for (const ev of e.evaluations) {
      b.evals++;
      b.hSum += ev.h;
      b.wSum += ev.w;
      if (ev.d != null) b.dSum += ev.d;
    }
    b.busEmit += e.busEmits || 0;
    b.busRecv += e.busRecvs || 0;
  }
  console.log(`\n=== ${label} (${group.length} sessions) ===`);
  console.log('Loadout      | Sess | Evals | h avg | w avg | d avg | Bus E/R');
  console.log('-------------|------|-------|-------|-------|-------|--------');
  const sorted = Object.entries(byLoadout).sort((a, b) => b[1].hSum / b[1].evals - a[1].hSum / a[1].evals);
  for (const [name, b] of sorted) {
    const n = b.evals;
    console.log(
      name.padEnd(13) + '| ' +
      String(b.sessions).padStart(4) + ' | ' +
      String(n).padStart(5) + ' | ' +
      (b.hSum / n).toFixed(1).padStart(5) + ' | ' +
      (b.wSum / n).toFixed(1).padStart(5) + ' | ' +
      (b.dSum / n).toFixed(1).padStart(5) + ' | ' +
      b.busEmit + '/' + b.busRecv
    );
  }
}

summarize(mini, 'phi3:mini');
summarize(oneB, 'llama3.2:1b');
if (legacy.length > 0) summarize(legacy, 'Legacy (no model tag)');

console.log('\n=== Overall ===');
console.log(`Total entries: ${entries.length}`);
console.log(`phi3:mini: ${mini.length}, 1b: ${oneB.length}, legacy: ${legacy.length}`);
console.log(`Total evaluations: ${entries.reduce((s, e) => s + e.evaluations.length, 0)}`);
