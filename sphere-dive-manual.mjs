#!/usr/bin/env node
// sphere-dive-manual.mjs — 手動操作用 dive クライアント
//
// sphere-dive-run.mjs が行動決め打ちの自動運転なのに対し、こちらは
// sphere-dive-plan.mjs が返すステップ列をそのまま実行する。潜り方を変えたい
// ときは plan 側だけ書き換える。往復するメッセージは全部出す。
//
//   node sphere-dive-manual.mjs > dive.log 2>&1
//   node sphere-dive-manual.mjs ./sphere-dive-plan.test-refund.mjs > refund.log 2>&1
//
// 第1引数で plan を差し替えられる (既定は ./sphere-dive-plan.mjs)。
//
// 注意: node の stdout はパイプ越しだとブロックバッファされる。
//       `| head` だと無出力のまま固まって見えるので必ずファイルへ落とす。

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const WebSocket = require('ws');
import http from 'http';
const planPath = process.argv[2] || './sphere-dive-plan.mjs';
const { makePlan } = await import(new URL(planPath, import.meta.url).href);

const HOST = process.env.SPHERE_HOST || 'localhost';
const PORT = Number(process.env.SPHERE_PORT || 3001);

const post = (path, body) => new Promise((res, rej) => {
  const d = JSON.stringify(body);
  const r = http.request({ hostname: HOST, port: PORT, path, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } },
    x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res(JSON.parse(b))); });
  r.on('error', rej); r.write(d); r.end();
});

export function flagNames(f) {
  const n = [];
  if (f & 0x0001) n.push('TemporalShort'); if (f & 0x0002) n.push('TemporalLong');
  if (f & 0x0010) n.push('Dense');         if (f & 0x0080) n.push('Authority');
  if (f & 0x0100) n.push('Sharp');         if (f & 0x0400) n.push('Tensile');
  if (f & 0x1000) n.push('UserMarked');    if (f & 0x2000) n.push('SystemCore');
  return n.join('+') || 'none';
}

console.log('### plan:', planPath);
const t = await post('/dive/request', {});
if (!t?.ticket?.token) { console.error('チケット取得に失敗:', JSON.stringify(t)); process.exit(1); }
const token = t.ticket.token;
console.log('### ticket:', token.slice(0, 12) + '…');

// WebSocket Gateway は HTTP と同じポートに統合されている (ログの ws://localhost:0 は表示バグ)
const ws = new WebSocket(`ws://${HOST}:${PORT}?token=${token}`);
const state = { energy: null, layer: 'tutorial', last: {} };
let steps = null, i = 0, waiting = null;

function advance() {
  if (i >= steps.length) return;
  const step = steps[i];
  const payload = typeof step.send === 'function' ? step.send(state) : step.send;
  if (payload === null) { i++; return advance(); }   // 条件が揃わなければスキップ
  waiting = step.waitFor;
  if (step.label) console.log('\n>>> ' + step.label);
  console.log('  → send', JSON.stringify(payload).slice(0, 200));
  ws.send(JSON.stringify({ requestId: 'r' + i, ...payload }));
}

ws.on('open', () => console.log(`### WS OPEN ws://${HOST}:${PORT}`));

ws.on('message', raw => {
  const m = JSON.parse(raw.toString());
  if (typeof m.energy === 'number') state.energy = m.energy;
  if (m.layer) state.layer = m.layer;

  // 待っている type だけ整形表示。processing / amber_showcase などの割り込みは素通し
  const render = steps ? steps[i]?.render : null;
  if (m.type === waiting && render) render(m, state);
  else console.log('  ← [' + m.type + ']', JSON.stringify(m).slice(0, 260));

  state.last[m.type] = m;

  // error はステップが allowError を宣言していれば正常な結果として扱う
  // (失敗時の返金など、エラー応答そのものを検証したい場合に使う)
  if (m.type === 'error') {
    if (steps?.[i]?.allowError) { i++; setTimeout(advance, 350); return; }
    console.log('  !!! ERROR — 中断'); ws.close(); return;
  }
  if (m.type === waiting) { i++; setTimeout(advance, 350); }
  if (m.type === 'farewell') setTimeout(() => ws.close(), 300);
});

ws.on('close', () => { console.log('\n### CLOSED | final energy:', state.energy); process.exit(0); });

// welcome を受け取ってから plan を組み立てて開始する (先に entry を送ると弾かれる)
ws.once('message', () => { steps = makePlan(state, flagNames); advance(); });
