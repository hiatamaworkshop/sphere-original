// ghost への focus (mockFocus 捏造フォールバックの置き換え) を直接検証する plan
export function makePlan(state, flagNames) {
  const KNOWN_GHOST = '6938b22b6fadb126';   // /nodes/metrics で確認した現存の ghost
  let ghost = null, active = null;
  return [
    { label: '入場', waitFor: 'positioned',
      send: () => ({ type:'entry', request: { query:'what remains of a thing after its content has been stripped away',
        tags:['trace','decay','archive','erasure'], loadout:'scholar' }}),
      render: () => console.log('  ← 着地') },
    { label: 'Sanctuary', waitFor: 'layerChanged', send: () => ({ type:'enterSanctuary' }),
      render: m => console.log(`  ← ${m.layer} energy=${m.energy}`) },
    { label: 'Core', waitFor: 'layerChanged', send: () => ({ type:'enterCore' }),
      render: m => console.log(`  ← ${m.layer} energy=${m.energy}`) },

    { label: 'scanL1 で ghost を探す', waitFor: 'scanResult', send: () => ({ type:'scan' }),
      render: m => { ghost = (m.nodes||[]).find(n=>n.kind==='ghost')
                          || (m.nodes||[]).find(n=>n.id===KNOWN_GHOST)
                          || (m.nodes||[]).find(n=>n.kind==='fossil');
        console.log(`  ← scan ${(m.nodes||[]).length}件 energy=${state.energy} | ghost=${ghost?ghost.id.slice(0,8):'なし'}`); } },

    { label: 'ghost へ warp (sense 範囲に入れるため)', waitFor: 'warpResult',
      send: () => ghost ? ({ type:'warp', nodeId: ghost.id }) : null,
      render: m => console.log(`  ← warp ${JSON.stringify(m.result)} energy=${state.energy} | -15`) },

    { label: 'warp 先で sense — ghost が sense 結果に入る', waitFor: 'senseResult',
      send: () => ({ type:'sense' }),
      render: m => { const ns = m.nodes||[];
        ghost = ns.find(n=>n.kind==='ghost') || ghost;
        active = ns.find(n=>n.kind==='active');
        console.log(`  ← sense ${ns.length}件 energy=${state.energy} | ghost in sense=${!!ns.find(n=>n.kind==='ghost')}`); } },

    { label: '【本命】sense 済み ghost に focus → 明示的な失敗 + 返金', waitFor: 'focusResult', allowError: true,
      send: () => ghost ? ({ type:'focus', nodeId: ghost.id }) : null,
      render: m => console.log(`  ← !!! focusResult が返った(修正前の挙動): kind=${m.node?.kind} ${JSON.stringify(m.node?.summary)}`) },

    { label: '返金確認のため active に focus (直前と同じ残量から -10 になるはず)', waitFor: 'focusResult',
      send: () => active ? ({ type:'focus', nodeId: active.id }) : null,
      render: m => console.log(`  ← FOCUS ok [${m.node?.kind}] energy=${state.energy}\n     ${JSON.stringify(m.node?.summary)}`) },

    { label: '帰還', waitFor: 'vestibuleEntered', send: () => ({ type:'return' }),
      render: m => console.log(`  ← vestibule auto=${JSON.stringify(m.auto)}`) },
    { label: '退出', waitFor: 'farewell', send: () => ({ type:'acknowledge' }), render: () => console.log('  ← farewell') },
  ];
}
