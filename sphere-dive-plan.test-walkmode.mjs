// WalkMode の勾配が d=1000 張り付きでも壊れないことを検証する plan
//
// 旧実装:
//   fresh = h × (d/1000)          → d=1000 で h と同じ = hot と同一
//   deep  = w × max(0,1-d/1000)   → d=1000 で全ノード 0 → totalWeight 0 → random
// 期待:
//   "No valid nodes for field direction" が出ない
//   deep / fresh / hot が別々の方向を向く (θ が一致しない)
export function makePlan(state) {
  const senseThenMove = (mode) => ([
    { label: `sense (${mode} 用)`, waitFor: 'senseResult', send: () => ({ type:'sense' }),
      render: m => {
        const n = m.nodes || [];
        const ds = [...new Set(n.map(x => x.decay))].sort((a,b)=>a-b);
        console.log(`  ← ${n.length} nodes | decay の種類: ${JSON.stringify(ds)}`);
      } },
    { label: `move mode=${mode}`, waitFor: 'moveResult', send: () => ({ type:'move', mode, steps:1 }),
      render: m => console.log(`  ← energy=${m.energy}`) },
  ]);

  return [
    { label: '入場', waitFor: 'positioned',
      send: () => ({ type:'entry', request: { query:'stable well-established knowledge',
        tags:['foundation'], loadout:'wanderer' }}),
      render: () => console.log('  ← 着地') },
    { label: 'Sanctuary', waitFor: 'layerChanged', send: () => ({ type:'enterSanctuary' }), render: () => {} },
    { label: 'Core', waitFor: 'layerChanged', send: () => ({ type:'enterCore' }),
      render: m => console.log(`  ← ${m.layer} energy=${m.energy}`) },
    ...senseThenMove('deep'),
    ...senseThenMove('fresh'),
    ...senseThenMove('hot'),
    { label: '帰還', waitFor: 'vestibuleEntered', send: () => ({ type:'return' }), render: () => {} },
    { label: '退出', waitFor: 'farewell', send: () => ({ type:'acknowledge' }), render: () => {} },
  ];
}
