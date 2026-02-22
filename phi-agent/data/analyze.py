import json, sys
from collections import defaultdict

path = sys.argv[1] if len(sys.argv) > 1 else "eval-log-test-progress.jsonl"
with open(path) as f:
    data = [json.loads(l) for l in f if l.strip()]

species = defaultdict(lambda: {'n':0, 'evals':0, 'h':0, 'w':0, 'd':0, 'busE':0, 'busR':0})
for d in data:
    s = species[d['loadout']]
    s['n'] += 1
    for e in d['evaluations']:
        s['evals'] += 1
        s['h'] += e['h']
        s['w'] += e['w']
        s['d'] += e['d']
    s['busE'] += d.get('busEmits', 0)
    s['busR'] += d.get('busRecvs', 0)

print(f"Total: {len(data)} sessions")
print(f"{'Loadout':12s} {'Sess':>4s} {'Evals':>5s} {'avgH':>5s} {'avgW':>5s} {'avgD':>5s} {'BusE':>4s} {'BusR':>4s}")
print("-" * 55)
for name, s in sorted(species.items()):
    n = s['evals']
    if n == 0: continue
    print(f"{name:12s} {s['n']:4d} {n:5d} {s['h']/n:5.1f} {s['w']/n:5.1f} {s['d']/n:5.1f} {s['busE']:4d} {s['busR']:4d}")
