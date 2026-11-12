// Capsule 差分評価 (C1) を検証する plan
//
// 期待 (A = focus + evaluate した node, B = sense しただけの node):
//   seeds       total=2 withSource=2 unvisitedSource=1   (B を source に挙げた seed が降格される)
//   evaluations claimed=3 recorded=1 matched=1 altered=1 unwitnessed=1
//   demoted=1 dropped=0, consistency=0.4
//
// 注意: evaluate / submitCapsule は RefDB に書く。`.env.test` (REFDB_BACKEND=map) で起動してから走らせること。
export function makePlan(state) {
  let A = null, B = null, start = null;
  const seed = (summary, sourceNodeId) => ({
    tags: ['capsule', 'divergence'], summary, flags: 0, ...(sourceNodeId && { sourceNodeId }),
  });
  return [
    { label: '入場', waitFor: 'positioned',
      send: () => ({ type: 'entry', request: { query: 'how a system compares what it saw with what it is told',
        tags: ['audit', 'trust', 'logs'], loadout: 'scholar' } }),
      render: () => console.log('  ← 着地') },
    { label: 'Sanctuary', waitFor: 'layerChanged', send: () => ({ type: 'enterSanctuary' }),
      render: m => console.log(`  ← ${m.layer} energy=${m.energy}`) },
    { label: 'Core', waitFor: 'layerChanged', send: () => ({ type: 'enterCore' }),
      render: m => console.log(`  ← ${m.layer} energy=${m.energy}`) },

    { label: 'scanL1 で active を探す', waitFor: 'scanResult', send: () => ({ type: 'scan' }),
      render: m => { start = (m.nodes || []).find(n => n.kind === 'active');
        console.log(`  ← scan ${(m.nodes || []).length}件 | start=${start?.id?.slice(0, 8)}`); } },

    { label: 'active へ warp (sense 範囲に入れるため)', waitFor: 'warpResult',
      send: () => start ? ({ type: 'warp', nodeId: start.id }) : null,
      render: m => console.log(`  ← warp ${JSON.stringify(m.result)} energy=${state.energy}`) },

    { label: 'sense — A (focus する) と B (見るだけ) を選ぶ', waitFor: 'senseResult', send: () => ({ type: 'sense' }),
      render: m => {
        const act = (m.nodes || []).filter(n => n.kind === 'active');
        [A, B] = [act[0], act[1]];
        console.log(`  ← sense ${(m.nodes || []).length}件 active=${act.length} | A=${A?.id?.slice(0, 8)} B=${B?.id?.slice(0, 8)}`);
      } },

    { label: 'A に focus', waitFor: 'focusResult', allowError: true,
      send: () => A ? ({ type: 'focus', nodeId: A.id }) : null,
      render: m => console.log(`  ← FOCUS ok [${m.node?.kind}] energy=${state.energy}`) },

    { label: 'A を評価 (h=7 w=6 d=5)', waitFor: 'evaluateResult',
      send: () => A ? ({ type: 'evaluate', nodeId: A.id, h: 7, w: 6, d: 5 }) : null,
      render: m => console.log(`  ← evaluate success=${m.success} energy=${state.energy}`) },

    { label: '帰還', waitFor: 'vestibuleEntered', send: () => ({ type: 'return' }),
      render: m => console.log(`  ← vestibule auto=${JSON.stringify(m.auto)}`) },

    { label: '【本命】食い違いのある capsule を提出', waitFor: 'submitCapsuleResult',
      send: () => (A && B) ? ({ type: 'submitCapsule', capsule: {
        schemaVersion: 4,
        topTier: [seed('divergence test: derived from a visited node', A.id)],
        normalNodes: [seed('divergence test: claims an unvisited source', B.id)],
        ghostNodes: [],
        evaluations: [
          { nodeId: A.id, h: 7, w: 6, d: 5 },   // matched
          { nodeId: A.id, h: 9, w: 9, d: 9 },   // altered
          { nodeId: B.id, h: 5, w: 5, d: 5 },   // unwitnessed
        ],
        timestamp: Date.now(),
      } }) : null,
      render: m => {
        console.log(`  ← submitCapsuleResult success=${m.success} nodes=${m.nodeCount} errors=${JSON.stringify(m.errors)}`);
        console.log(`     divergence=${JSON.stringify(m.divergence)}`);
        console.log(`     demoted=${m.demoted} dropped=${m.dropped}`);
        const d = m.divergence, e = d?.evaluations, s = d?.seeds;
        const ok = s?.total === 2 && s?.withSource === 2 && s?.unvisitedSource === 1
          && e?.claimed === 3 && e?.recorded === 1 && e?.matched === 1 && e?.altered === 1 && e?.unwitnessed === 1
          && m.demoted === 1 && m.dropped === 0 && Math.abs(d.consistency - 0.4) < 1e-9;
        console.log(ok ? '     PASS' : '     !!! FAIL — 期待と違う');
      } },

    { label: '退出', waitFor: 'farewell', send: () => ({ type: 'acknowledge' }), render: () => console.log('  ← farewell') },
  ];
}
