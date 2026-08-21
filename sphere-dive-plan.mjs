// sphere-dive-plan.mjs — sphere-dive-manual.mjs が実行するステップ列
//
// 1ステップ = { label, send, waitFor, render }
//   send    : 送るメッセージを返す関数。null を返すとそのステップを飛ばす
//   waitFor : この type が返るまで次へ進まない。**必ず type で待ち合わせること**
//             (entry の直後は processing が先に来る。amber_showcase が割り込むこともある)
//   render  : waitFor に一致した応答の整形表示
//
// ハマりどころ:
//   - return の応答は layerChanged ではなく vestibuleEntered
//   - ghost / fossil は focus できない。拒否されてもエネルギーは満額(10)引かれる
//   - evaluate は即時反映されず、return 時に一括 flush される (上限 10件/セッション)
//   - セッション 180秒 / Vestibule 120秒で強制切断。待ちを入れすぎると途中で切れる
//
// エネルギー (Core 層、初期値100。Sanctuary は半額、Tutorial は無料):
//   scanL1 1 / sense 3 / move 5 / focus 10 / warp 15 / evaluate 3 / emitBus 20 / return 0

export function makePlan(state, flagNames) {
  const brief = n =>
    `  ${n.id?.slice(0, 8)} [${n.kind}] ` +
    `h:${typeof n.heat === 'number' ? n.heat.toFixed(1) : '—'} ` +
    `w:${typeof n.weight === 'number' ? n.weight.toFixed(1) : '—'} ${flagNames(n.flags || 0)}\n` +
    `      tags: ${JSON.stringify(n.tags)}` +
    (n.summary ? `\n      ${JSON.stringify(n.summary.slice(0, 90))}` : '');

  const list = (m, label) => {
    const ns = m.nodes || [];
    console.log(`  ← ${label}: ${ns.length} 件 | energy ${state.energy}`);
    ns.forEach(n => console.log(brief(n)));
    return ns;
  };

  let seen = [];

  return [
    { label: '入場 — クエリは検索語ではなく着地座標になる', waitFor: 'positioned',
      send: () => ({ type: 'entry', request: {
        query: 'what remains of a thing after its content has been stripped away',
        tags: ['trace', 'decay', 'archive', 'erasure'],
        loadout: 'scholar' } }),
      render: m => console.log(`  ← 着地 | query=${JSON.stringify(m.query)} | 残り ${m.remainingTime}s`) },

    { label: 'Sanctuary へ (amber が0件なので実質素通り)', waitFor: 'layerChanged',
      send: () => ({ type: 'enterSanctuary' }),
      render: m => console.log(`  ← ${m.layer} | energy ${m.energy}`) },

    { label: 'Core へ', waitFor: 'layerChanged',
      send: () => ({ type: 'enterCore' }),
      render: m => console.log(`  ← ${m.layer} | ${m.message} | energy ${m.energy}`) },

    { label: 'scanL1 — 広く浅く。fossil / relic もこれなら拾える', waitFor: 'scanResult',
      send: () => ({ type: 'scan' }),
      render: m => { seen = list(m, 'scanL1(core)'); } },

    { label: 'sense — 同じ場所を深く。scanL1 との差を見る', waitFor: 'senseResult',
      send: () => ({ type: 'sense' }),
      render: m => { seen = seen.concat(list(m, 'sense(core)')); } },

    { label: 'warp — 遠方へ行く唯一の手段。move では景色が変わらない', waitFor: 'warpResult',
      send: () => {
        const odd = seen.find(n => n.kind === 'ghost') || seen.find(n => n.kind === 'fossil')
                 || seen.find(n => n.kind === 'relic') || seen.find(n => n.kind !== 'active');
        if (!odd) { console.log('  (非 active ノードなし → warp 断念)'); return null; }
        console.log(`  (warp 先: ${odd.id.slice(0, 8)} kind=${odd.kind} tags=${JSON.stringify(odd.tags)})`);
        return { type: 'warp', nodeId: odd.id };
      },
      render: m => console.log('  ← WARP: ' + JSON.stringify(m).slice(0, 300)) },

    { label: 'warp 先で sense — 近傍が総入れ替わりになっているはず', waitFor: 'senseResult',
      send: () => ({ type: 'sense' }),
      render: m => { seen = list(m, 'sense(warp先)'); } },

    { label: 'focus — active 以外に打つと拒否される (が課金される)', waitFor: 'focusResult',
      send: () => {
        const t = seen.find(n => n.kind === 'active') || seen[0];
        if (!t) return null;
        console.log(`  (focus: ${t.id.slice(0, 8)} kind=${t.kind})`);
        return { type: 'focus', nodeId: t.id };
      },
      render: (m, s) => { const n = m.node || {};
        console.log(`  ← FOCUS ${n.id?.slice(0, 8)} [${n.kind}] h:${n.heat} w:${n.weight} d:${n.decay} ${flagNames(n.flags || 0)}`);
        console.log(`     summary: ${JSON.stringify(n.summary)}`);
        console.log(`     content: ${JSON.stringify(String(n.content ?? '(null)').slice(0, 600))}`);
        s.focused = n; } },

    // ⚠️ RefDB は write-through で本番 Turso に繋がっている。
    //    汚したくない場合はこのステップを消すか、.env の REFDB_BACKEND を map にすること。
    { label: '評価を1件置く — return 時にまとめて精算される', waitFor: 'evaluateResult',
      send: s => s.focused ? ({ type: 'evaluate', nodeId: s.focused.id, h: 6, w: 8, d: 2 }) : null,
      render: m => console.log('  ← EVAL: ' + JSON.stringify(m).slice(0, 400)) },

    { label: '帰還 — 応答は layerChanged ではなく vestibuleEntered', waitFor: 'vestibuleEntered',
      send: () => ({ type: 'return' }),
      render: m => console.log('  ← VESTIBULE | auto: ' + JSON.stringify(m.auto)
        + '\n     使えるコマンド: ' + (m.commands || []).map(c => c.name).join(', ')) },

    { label: '受領書 — 実際に適用された評価', waitFor: 'receipt',
      send: () => ({ type: 'viewReceipt' }),
      render: m => console.log('  ← RECEIPT: ' + JSON.stringify(m, null, 1).slice(0, 900)) },

    { label: '航跡 — 最終位置の384次元ベクトルが生で返る', waitFor: 'trail',
      send: () => ({ type: 'viewTrail' }),
      render: m => console.log('  ← TRAIL: ' + JSON.stringify(m).slice(0, 600) + ' …(384次元ベクトルにつき省略)') },

    { label: '発見物 — 滞在時間と focus 回数', waitFor: 'discoveries',
      send: () => ({ type: 'viewDiscoveries' }),
      render: m => console.log('  ← DISCOVERIES: ' + JSON.stringify(m).slice(0, 700)) },

    { label: '退出', waitFor: 'farewell',
      send: () => ({ type: 'acknowledge' }),
      render: m => console.log('  ← FAREWELL: ' + JSON.stringify(m).slice(0, 600)) },
  ];
}
