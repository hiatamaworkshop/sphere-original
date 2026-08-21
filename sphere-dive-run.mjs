import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const WebSocket = require('ws');
import http from 'http';

function httpsPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: 'localhost',
      port: 3001,
      path, method: 'POST',
      headers: {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data)}
    };
    const req = http.request(options, (res) => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve(JSON.parse(b)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function flagNames(flags) {
  const names = [];
  if (flags & 0x0001) names.push('TemporalShort');
  if (flags & 0x0002) names.push('TemporalLong');
  if (flags & 0x0010) names.push('Dense');
  if (flags & 0x0080) names.push('Authority');
  if (flags & 0x0100) names.push('Sharp');
  if (flags & 0x0400) names.push('Tensile');
  if (flags & 0x1000) names.push('UserMarked');
  if (flags & 0x2000) names.push('SystemCore');
  return names.join('+') || 'none';
}

async function dive() {
  const ticketRes = await httpsPost('/dive/request', {});
  const token = ticketRes.ticket.token;
  console.log('=== DIVE START ===');
  console.log('token:', token.substring(0,16) + '...');

  const ws = new WebSocket('ws://localhost:3001?token=' + token);

  // State machine
  let positioned = false;
  let inSanctuary = false;
  let inCore = false;
  let sensed_sanctuary = false;
  let focused_sanctuary = false;
  let sensed_core = false;
  let focused_core = false;
  let evaluated = false;
  let moved = false;
  let returned = false;

  ws.on('open', () => console.log('[WS OPEN]'));

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());

    // ── welcome ──────────────────────────────────────────────
    if (msg.type === 'welcome') {
      console.log('[WELCOME] session:', msg.sessionId);
      ws.send(JSON.stringify({
        type: 'entry', requestId: 'r1',
        request: { query: 'consciousness and emergence', tags: ['consciousness','emergence','philosophy'], loadout: 'scholar' }
      }));

    // ── processing / amber_showcase ───────────────────────────
    } else if (msg.type === 'processing') {
      console.log('[PROCESSING]', msg.message);

    } else if (msg.type === 'amber_showcase') {
      const amber = msg.amber || [];
      console.log('[AMBER SHOWCASE] while waiting for vector:', amber.length, 'nodes');
      amber.slice(0, 3).forEach(n => console.log('  amber:', n.id?.substring(0,8), '|', JSON.stringify((n.summary||'').substring(0,60))));

    // ── positioned → enter Tutorial → Sanctuary ──────────────
    } else if (msg.type === 'positioned') {
      if (!positioned) {
        positioned = true;
        console.log('[POSITIONED] query:', msg.query, '| remaining:', msg.remainingTime + 's');
        console.log('[LAYER: tutorial] relic-only zone. Scanning...');
        ws.send(JSON.stringify({type: 'scan', requestId: 'scan_t'}));
      }

    // ── scanResult (Tutorial: relic のみ) ────────────────────
    } else if (msg.type === 'scanResult' && !inSanctuary) {
      const nodes = msg.nodes || [];
      console.log('[SCAN tutorial] found', nodes.length, 'nodes:');
      nodes.forEach(n => {
        console.log('  id:', n.id, '| kind:', n.kind, '| flags:', flagNames(n.flags), '| tags:', JSON.stringify(n.tags));
      });
      // Tutorial確認完了 → Sanctuary へ
      console.log('[ACTION] enterSanctuary...');
      ws.send(JSON.stringify({type: 'enterSanctuary', requestId: 'esanc1'}));

    // ── layerChanged ──────────────────────────────────────────
    } else if (msg.type === 'layerChanged') {
      console.log('[LAYER CHANGED] →', msg.layer, '|', msg.message, '| energy:', msg.energy);

      if (msg.layer === 'sanctuary' && !inSanctuary) {
        inSanctuary = true;
        console.log('[LAYER: sanctuary] amber + relic visible. Sensing...');
        setTimeout(() => {
          ws.send(JSON.stringify({type: 'sense', requestId: 'sense_s'}));
        }, 400);

      } else if (msg.layer === 'core' && !inCore) {
        inCore = true;
        console.log('[LAYER: core] all nodes visible. Sensing...');
        setTimeout(() => {
          ws.send(JSON.stringify({type: 'sense', requestId: 'sense_c'}));
        }, 400);
      }

    // ── senseResult ───────────────────────────────────────────
    } else if (msg.type === 'senseResult') {
      const nodes = msg.nodes || [];

      if (!sensed_sanctuary && inSanctuary && !inCore) {
        sensed_sanctuary = true;
        console.log('[SENSE sanctuary] found', nodes.length, 'nodes (amber+relic):');
        nodes.forEach(n => {
          console.log('  id:', n.id, '| kind:', n.kind, '| heat:', n.heat, '| summary:', JSON.stringify((n.summary||'').substring(0,60)));
        });
        // hottest に focus
        if (nodes.length > 0) {
          const target = [...nodes].sort((a,b) => b.heat - a.heat)[0];
          console.log('[ACTION] focus sanctuary hottest:', target.id, '(heat:', target.heat + ')');
          setTimeout(() => {
            ws.send(JSON.stringify({type: 'focus', requestId: 'focus_s', nodeId: target.id}));
          }, 400);
        } else {
          // amber がないなら Core へ
          console.log('[ACTION] no amber nodes, enterCore...');
          setTimeout(() => {
            ws.send(JSON.stringify({type: 'enterCore', requestId: 'ecore1'}));
          }, 400);
        }

      } else if (!sensed_core && inCore) {
        sensed_core = true;
        console.log('[SENSE core] found', nodes.length, 'nodes (all kinds):');
        nodes.slice(0, 8).forEach(n => {
          console.log('  id:', n.id, '| kind:', n.kind, '| heat:', n.heat, '| weight:', n.weight, '| summary:', JSON.stringify((n.summary||'').substring(0,60)));
        });
        // Core で hottest に focus
        if (nodes.length > 0) {
          const target = [...nodes].sort((a,b) => b.heat - a.heat)[0];
          console.log('[ACTION] focus core hottest:', target.id, '(kind:', target.kind, ', heat:', target.heat + ')');
          setTimeout(() => {
            ws.send(JSON.stringify({type: 'focus', requestId: 'focus_c', nodeId: target.id}));
          }, 400);
        } else {
          console.log('[ACTION] no nodes in core, returning...');
          ws.send(JSON.stringify({type: 'return', requestId: 'ret1'}));
        }
      }

    // ── focusResult ───────────────────────────────────────────
    } else if (msg.type === 'focusResult') {
      const n = msg.node || {};
      const layer = inCore ? 'core' : 'sanctuary';
      console.log('[FOCUS ' + layer + '] id:', n.id, '| kind:', n.kind);
      console.log('  summary:', JSON.stringify(n.summary));
      console.log('  content:', JSON.stringify((n.content || '').substring(0, 500)));
      console.log('  heat:', n.heat, '| weight:', n.weight, '| decay:', n.decay);
      console.log('  flags:', flagNames(n.flags || 0), '| immuneMod:', n.immuneMod);

      if (!focused_sanctuary && !inCore) {
        focused_sanctuary = true;
        // Sanctuary で見た後 Core へ進む
        console.log('[ACTION] enterCore...');
        setTimeout(() => {
          ws.send(JSON.stringify({type: 'enterCore', requestId: 'ecore1'}));
        }, 400);

      } else if (!focused_core && inCore) {
        focused_core = true;
        // Core で evaluate（active ノードなら反映される）
        if (!evaluated && n.kind === 'active') {
          evaluated = true;
          console.log('[ACTION] evaluate core node h:8 w:7 d:5...');
          setTimeout(() => {
            ws.send(JSON.stringify({type: 'evaluate', requestId: 'eval_c', nodeId: n.id, h: 8, w: 7, d: 5}));
          }, 400);
        } else {
          console.log('[NOTE] kind=' + n.kind + ', skipping evaluate. Moving hot...');
          setTimeout(() => {
            ws.send(JSON.stringify({type: 'move', requestId: 'move1', mode: 'hot', step: 0.3}));
          }, 400);
        }
      }

    // ── evaluateResult ────────────────────────────────────────
    } else if (msg.type === 'evaluateResult') {
      console.log('[EVALUATE]', msg.success ? 'SUCCESS ✓' : 'FAIL', msg.reason || '', '| energy:', msg.energy);
      // evaluate 後に move
      setTimeout(() => {
        console.log('[ACTION] move hot...');
        ws.send(JSON.stringify({type: 'move', requestId: 'move1', mode: 'hot', step: 0.3}));
      }, 400);

    // ── moveResult ────────────────────────────────────────────
    } else if (msg.type === 'moveResult') {
      const ok = msg.result && msg.result.success;
      console.log('[MOVE]', ok ? 'SUCCESS' : 'BLOCKED: ' + (msg.result && msg.result.blocked), '| energy:', msg.energy);
      if (!moved) {
        moved = true;
        // return へ
        setTimeout(() => {
          if (!returned) {
            returned = true;
            console.log('[ACTION] return...');
            ws.send(JSON.stringify({type: 'return', requestId: 'ret1'}));
          }
        }, 400);
      }

    // ── vestibule / return ────────────────────────────────────
    } else if (msg.type === 'returnAck') {
      console.log('[RETURN ACK]', JSON.stringify(msg).substring(0, 300));
      ws.send(JSON.stringify({type: 'viewTrail', requestId: 'trail1'}));

    } else if (msg.type === 'vestibuleEntered') {
      console.log('[VESTIBULE] evaluationsApplied:', msg.auto?.evaluationsApplied, '| autoCapsuleSaved:', msg.auto?.autoCapsuleSaved);
      ws.send(JSON.stringify({type: 'viewTrail', requestId: 'trail1'}));

    } else if (msg.type === 'trail') {
      const trail = msg.data?.actions || msg.data?.trail || msg.data || [];
      const trailArr = Array.isArray(trail) ? trail : Object.values(trail);
      console.log('[TRAIL] entries:', trailArr.length);
      trailArr.forEach(t => console.log('  TRAIL:', JSON.stringify(t).substring(0, 120)));
      ws.send(JSON.stringify({type: 'viewReceipt', requestId: 'receipt1'}));

    } else if (msg.type === 'receipt') {
      const data = msg.data || msg;
      console.log('[RECEIPT]', JSON.stringify(data).substring(0, 600));
      ws.send(JSON.stringify({type: 'acknowledge', requestId: 'ack1'}));

    } else if (msg.type === 'farewell') {
      console.log('[FAREWELL]', JSON.stringify(msg).substring(0, 300));
      ws.close();

    // ── error / expelled ──────────────────────────────────────
    } else if (msg.type === 'error' || msg.type === 'entryError') {
      console.log('[ERROR]', JSON.stringify(msg));

    } else if (msg.type === 'expelled') {
      console.log('[EXPELLED]', msg.reason);
      ws.close();

    } else if (msg.type === 'warning') {
      console.log('[WARNING]', msg.message || JSON.stringify(msg));

    } else {
      console.log('[UNKNOWN type=' + msg.type + ']', JSON.stringify(msg).substring(0, 200));
    }
  });

  ws.on('error', e => console.log('[WS ERROR]', e.message));
  ws.on('close', () => { console.log('=== DIVE COMPLETE ==='); process.exit(0); });
  setTimeout(() => {
    console.log('[TIMEOUT]');
    ws.close();
    process.exit(0);
  }, 150000);
}

dive().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });
