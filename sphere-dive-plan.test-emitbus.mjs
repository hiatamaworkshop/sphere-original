// emitBus の課金 (rulebook 公表値 20) を検証する plan
export function makePlan(state) {
  return [
    { label: '入場', waitFor: 'positioned',
      send: () => ({ type:'entry', request: { query:'signals between agents in a shared space',
        tags:['communication','swarm'], loadout:'wanderer' }}),
      render: () => console.log('  ← 着地') },
    { label: 'Sanctuary', waitFor: 'layerChanged', send: () => ({ type:'enterSanctuary' }),
      render: m => console.log(`  ← ${m.layer} energy=${m.energy}`) },
    { label: 'Core', waitFor: 'layerChanged', send: () => ({ type:'enterCore' }),
      render: m => console.log(`  ← ${m.layer} energy=${m.energy}`) },
    { label: 'emitBus — 修正前は無料だった。-20 になるはず', waitFor: 'emitResult',
      send: () => ({ type:'emit', payload: Buffer.from('hello from a manual dive').toString('base64') }),
      render: m => console.log(`  ← emit success=${m.success} energy=${m.energy} | 100 → 80 のはず`) },
    { label: 'もう一度 emitBus', waitFor: 'emitResult',
      send: () => ({ type:'emit', payload: Buffer.from('second broadcast').toString('base64') }),
      render: m => console.log(`  ← emit success=${m.success} energy=${m.energy} | 60 のはず`) },
    { label: '帰還', waitFor: 'vestibuleEntered', send: () => ({ type:'return' }),
      render: m => console.log(`  ← vestibule`) },
    { label: '退出', waitFor: 'farewell', send: () => ({ type:'acknowledge' }), render: () => console.log('  ← farewell') },
  ];
}
