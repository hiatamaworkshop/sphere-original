(() => {
'use strict';

// === Configuration ===
const API_BASE = (() => {
  if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return '';
  if (location.port === '3001') return '';
  return 'http://localhost:3001';
})();

function getWsUrl() {
  if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}`;
  }
  return 'ws://localhost:8081';
}

async function api(path, options) {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

// === Mock Data ===
let mockData = [];

async function loadPresetData() {
  try {
    const res = await fetch('mock-data.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    mockData = await res.json();
    onMockDataLoaded();
  } catch (e) {
    document.getElementById('contributeResult').innerHTML =
      `<div class="error">Failed to load preset: ${escapeHtml(e.message)}</div>`;
  }
}

function loadFileData(file) {
  // File size limit: 5MB
  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    document.getElementById('contributeResult').innerHTML =
      `<div class="error">File too large (max 5MB)</div>`;
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);

      // Support both formats: ExperienceCapsule (schema v4) and legacy array
      let data;
      if (parsed.schemaVersion === 4 && (parsed.topTier || parsed.normalNodes || parsed.ghostNodes)) {
        // Convert ExperienceCapsule to internal array format
        data = [];
        if (parsed.topTier) {
          data.push(...parsed.topTier.map(node => ({ ...node, tier: 'top' })));
        }
        if (parsed.normalNodes) {
          data.push(...parsed.normalNodes.map(node => ({ ...node, tier: 'normal' })));
        }
        if (parsed.ghostNodes) {
          data.push(...parsed.ghostNodes.map(node => ({ ...node, tier: 'ghost' })));
        }
      } else if (Array.isArray(parsed)) {
        // Legacy array format
        data = parsed;
      } else {
        throw new Error('JSON must be either an ExperienceCapsule (schemaVersion 4) or an array');
      }

      // Validate basic structure (tier, summary, tags)
      const invalidItems = data.filter((item, i) => {
        if (!item.tier || !['top', 'normal', 'ghost'].includes(item.tier)) return true;
        if (!item.summary || typeof item.summary !== 'string') return true;
        if (!Array.isArray(item.tags)) return true;
        return false;
      });

      if (invalidItems.length > 0) {
        throw new Error(`${invalidItems.length} items have invalid structure. Required: {tier, summary, tags[]}`);
      }

      mockData = data;
      onMockDataLoaded();
    } catch (err) {
      document.getElementById('contributeResult').innerHTML =
        `<div class="error">Invalid JSON: ${escapeHtml(err.message)}<br>` +
        `<a href="/schema" target="_blank" style="color: #4ecdc4;">View Schema</a> | ` +
        `<span onclick="document.getElementById('downloadExample').click()" style="cursor: pointer; color: #4ecdc4;">Download Example</span></div>`;
    }
  };
  reader.readAsText(file);
}

function onMockDataLoaded() {
  // Data limit: max 500 items
  const MAX_ITEMS = 500;
  if (mockData.length > MAX_ITEMS) {
    mockData = mockData.slice(0, MAX_ITEMS);
    document.getElementById('contributeResult').innerHTML =
      `<div class="warning">Data truncated to ${MAX_ITEMS} items (too many items)</div>`;
  } else {
    document.getElementById('contributeResult').innerHTML =
      `<div class="success">${mockData.length} items loaded</div>`;
  }
  renderMockList();
  document.getElementById('selectedCount').textContent = `${mockData.length} loaded`;
}

function renderMockList() {
  const el = document.getElementById('mockList');
  el.innerHTML = mockData.map((item, i) => {
    const title = item.summary || item.title || `Item ${i}`;
    const tags = item.tags || [];
    const imp = item.importance ?? 0;
    const tier = imp >= 0.85 ? 'top' : imp >= 0.5 ? 'normal' : 'ghost';
    return `<label class="mock-item" data-index="${i}">
      <input type="checkbox" checked value="${i}">
      <span class="mock-tier tier-${tier}">${tier}</span>
      <span class="mock-title">${escapeHtml(title)}</span>
      <span class="mock-tags">${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</span>
    </label>`;
  }).join('');
  updateSelectedCount();
}

// Sanitize user input: strip tags, control chars, excessive whitespace
function sanitizeInput(str) {
  return str
    .replace(/<[^>]*>/g, '')           // strip HTML tags
    .replace(/[^\x20-\x7E\u3000-\u9FFF\uFF00-\uFFEF\u0080-\u024F]/g, '') // allow ASCII + JP + Latin-ext
    .replace(/\s+/g, ' ')             // collapse whitespace
    .trim()
    .slice(0, 200);                    // hard limit
}

function validateDiveInput(query) {
  if (!query || query.length < 2) return 'Topic must be at least 2 characters';
  if (/^[\s\d\W]+$/.test(query)) return 'Topic must contain meaningful text';
  if (/<script|javascript:|on\w+\s*=/i.test(query)) return 'Invalid input detected';
  return null;
}

function getSelectedItems() {
  const checks = document.querySelectorAll('#mockList input[type="checkbox"]:checked');
  return Array.from(checks).map(c => mockData[parseInt(c.value)]).filter(Boolean);
}

function updateSelectedCount() {
  const count = document.querySelectorAll('#mockList input[type="checkbox"]:checked').length;
  document.getElementById('selectedCount').textContent = `${count} selected`;
  document.getElementById('contributeBtn').disabled = count === 0;
}

// Event: mock list checkbox changes
document.getElementById('mockList').addEventListener('change', updateSelectedCount);
document.getElementById('loadPreset').addEventListener('click', loadPresetData);
document.getElementById('uploadFile').addEventListener('change', (e) => {
  if (e.target.files[0]) loadFileData(e.target.files[0]);
});
document.getElementById('downloadExample').addEventListener('click', () => {
  // Download schema-compliant ExperienceCapsule example
  const example = {
    schemaVersion: 4,
    topTier: [
      {
        tags: ['quantum', 'computing', 'technology'],
        summary: 'Quantum computing fundamentals',
        content: 'Quantum computers leverage superposition and entanglement of quantum bits (qubits) to perform computations. Unlike classical bits that are either 0 or 1, qubits can exist in multiple states simultaneously, enabling exponential parallelism for certain problem classes.',
        flags: 0
      },
      {
        tags: ['AI', 'neural-network', 'deep-learning'],
        summary: 'Neural network architecture patterns',
        content: 'Modern deep learning architectures include CNNs for vision, RNNs/LSTMs for sequences, Transformers for attention-based processing, and GANs for generative tasks. Each architecture is optimized for specific data structures and problem domains.',
        flags: 0
      }
    ],
    normalNodes: [
      {
        tags: ['distributed', 'system', 'theory'],
        summary: 'CAP theorem and consistency models',
        content: 'CAP theorem states that distributed systems can guarantee at most two of Consistency, Availability, and Partition tolerance. Modern NoSQL databases make explicit trade-offs: CP systems (MongoDB, HBase) vs AP systems (Cassandra, DynamoDB).',
        flags: 0
      },
      {
        tags: ['blockchain', 'consensus', 'cryptography'],
        summary: 'Blockchain consensus mechanisms',
        flags: 0
      },
      {
        tags: ['functional', 'programming', 'type-theory'],
        summary: 'Algebraic data types and pattern matching',
        ref_url: 'https://en.wikipedia.org/wiki/Algebraic_data_type',
        flags: 0
      }
    ],
    ghostNodes: [
      {
        tags: ['devops', 'monitoring', 'observability'],
        summary: 'Observability vs monitoring: semantic differences',
        flags: 0
      }
    ],
    timestamp: Date.now()
  };
  const blob = new Blob([JSON.stringify(example, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sphere-example.json';
  a.click();
  URL.revokeObjectURL(url);
});
document.getElementById('selectAll').addEventListener('click', () => {
  document.querySelectorAll('#mockList input[type="checkbox"]').forEach(c => c.checked = true);
  updateSelectedCount();
});
document.getElementById('selectNone').addEventListener('click', () => {
  document.querySelectorAll('#mockList input[type="checkbox"]').forEach(c => c.checked = false);
  updateSelectedCount();
});

// === Tab Switching ===
let activeTab = 'dashboard';
let pollingTimer = null;

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById(`tab-${tab}`).classList.add('active');
    activeTab = tab;
    if (tab === 'dashboard') startPolling();
    else stopPolling();
    if (tab === 'docs' && !docsLoaded) loadDocsList();
  });
});

// Notice links (e.g. "See Diving Experience in Docs")
document.addEventListener('click', (e) => {
  const link = e.target.closest('.notice-link[data-goto-doc]');
  if (!link) return;
  e.preventDefault();
  const file = link.dataset.gotoDoc;
  // Switch to docs tab
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('.tab[data-tab="docs"]').classList.add('active');
  document.getElementById('tab-docs').classList.add('active');
  activeTab = 'docs';
  stopPolling();
  if (!docsLoaded) loadDocsList();
  // Click the matching doc link after list is built
  setTimeout(() => {
    const docLink = document.querySelector(`#docsList a[data-doc="${file}"]`);
    if (docLink) docLink.click();
  }, 50);
});

// === Dashboard ===
async function fetchDashboard() {
  try {
    const [stats, metrics] = await Promise.all([
      api('/nodes/stats'),
      api('/metrics')
    ]);
    renderNodeDistribution(stats);
    renderAverages(stats);
    renderSystem(metrics);
    renderField(metrics);
    updateConnection(true);
  } catch (_e) {
    updateConnection(false);
  }
}

function renderNodeDistribution(stats) {
  const el = document.getElementById('nodeDistribution');
  const counts = stats.counts;
  const kinds = ['active', 'amber', 'fossil', 'ghost', 'relic', 'environment'];
  const max = Math.max(...kinds.map(k => counts[k] || 0), 1);

  el.innerHTML = `<div class="total">Total: ${counts.total}</div>` +
    kinds.map(k => {
      const count = counts[k] || 0;
      const pct = (count / max * 100).toFixed(0);
      return `<div class="bar-row">
        <span class="bar-label kind-${k}">${k}</span>
        <div class="bar-track"><div class="bar-fill kind-${k}" style="width:${pct}%"></div></div>
        <span class="bar-value">${count}</span>
      </div>`;
    }).join('');
}

function renderAverages(stats) {
  const el = document.getElementById('nodeAverages');
  const a = stats.averages;
  el.innerHTML = `
    <div class="metric-row"><span>Avg Heat</span><span>${a.heat.toFixed(1)}</span></div>
    <div class="metric-row"><span>Avg Weight</span><span>${a.weight.toFixed(1)}</span></div>
    <div class="metric-row"><span>Avg TTL</span><span>${a.ttl.toFixed(0)}</span></div>
  `;
}

function renderSystem(metrics) {
  const el = document.getElementById('systemMetrics');
  el.innerHTML = `
    <div class="metric-row"><span>Uptime</span><span>${formatUptime(metrics.uptime)}</span></div>
    <div class="metric-row"><span>Nodes</span><span>${metrics.nodeCount}</span></div>
    <div class="metric-row"><span>Agents</span><span>${metrics.agents}</span></div>
    <div class="metric-row"><span>Heap</span><span>${(metrics.memory.heapUsed / 1024 / 1024).toFixed(1)} MB</span></div>
  `;
}

function renderField(metrics) {
  const el = document.getElementById('fieldInfo');
  if (!metrics.field) {
    el.innerHTML = '<div class="metric-row"><span>No field data</span></div>';
    return;
  }
  const f = metrics.field;
  el.innerHTML = `
    <div class="metric-row"><span>Intensity</span><span>${f.intensity.toFixed(3)}</span></div>
    <div class="metric-row"><span>Dominant Flags</span><span>0x${f.dominantFlags.toString(16).padStart(4, '0')}</span></div>
    <div class="metric-row"><span>Volatility</span><span>${f.volatility.toFixed(3)}</span></div>
  `;
}

function updateConnection(ok) {
  const dot = document.querySelector('.dot');
  const text = document.getElementById('connText');
  dot.className = 'dot ' + (ok ? 'connected' : 'disconnected');
  text.textContent = ok ? 'Connected' : 'Disconnected';
}

function startPolling() {
  if (pollingTimer) return;
  fetchDashboard();
  pollingTimer = setInterval(fetchDashboard, 5000);
}

function stopPolling() {
  if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
}

// === Explore ===
document.getElementById('exploreBtn').addEventListener('click', async () => {
  const q = document.getElementById('exploreQuery').value.trim();
  if (!q) return;
  const limit = document.getElementById('exploreLimit').value;
  const radius = document.getElementById('exploreRadius').value;
  const el = document.getElementById('exploreResults');
  el.innerHTML = '<div class="loading">Searching...</div>';

  try {
    const data = await api(`/sphere/explore?q=${encodeURIComponent(q)}&limit=${limit}&radius=${radius}`);
    if (!data.results || data.results.length === 0) {
      el.innerHTML = `<div class="no-results">No results found (searched ${data.meta?.total ?? 0} nodes)</div>`;
      return;
    }
    el.innerHTML = `<div class="meta">Found ${data.meta.matched} matches in ${data.meta.total} nodes (showing ${data.meta.returned})</div>` +
      data.results.map(r => `
        <div class="result-card">
          <div class="result-header">
            <span class="kind-badge kind-${r.kind}">${r.kind}</span>
            <span class="distance">d=${r.distance.toFixed(3)}</span>
            <span class="heat">h=${r.heat.toFixed(1)}</span>
          </div>
          <div class="result-summary"><strong>Summary:</strong> ${escapeHtml(r.summary)}</div>
          ${(r.tags && r.tags.length > 0) ? `<div class="result-tags"><strong>Tags:</strong> ${r.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
          <div class="result-id">${r.id}</div>
        </div>
      `).join('');
  } catch (e) {
    el.innerHTML = `<div class="error">Error: ${e.message}</div>`;
  }
});

document.getElementById('exploreQuery').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('exploreBtn').click();
});

// === Contribute (Wave mode: staggered capsules) ===
function buildCapsuleFromChunk(chunk) {
  const topTier = [];
  const normalNodes = [];
  const ghostNodes = [];

  for (const item of chunk) {
    const seed = {
      tags: item.tags || [],
      summary: item.summary || item.title || '',
      content: item.payload || item.content || item.summary || item.title || '',
      flags: item.flags ?? 0,
    };
    const imp = item.importance ?? 0.5;
    if (imp >= 0.85) topTier.push(seed);
    else if (imp >= 0.5) normalNodes.push(seed);
    else ghostNodes.push(seed);
  }

  return {
    schemaVersion: 4,
    topTier: topTier.slice(0, 2),
    normalNodes: normalNodes.slice(0, 5),
    ghostNodes: ghostNodes.slice(0, 3),
    evaluations: [],
    timestamp: Date.now(),
  };
}

document.getElementById('contributeBtn').addEventListener('click', async () => {
  const selected = getSelectedItems();
  if (selected.length === 0) return;

  // Selection limit: max 200 items
  const MAX_CONTRIBUTE = 200;
  if (selected.length > MAX_CONTRIBUTE) {
    document.getElementById('contributeResult').innerHTML =
      `<div class="error">Too many items selected (max ${MAX_CONTRIBUTE})</div>`;
    return;
  }

  const resultEl = document.getElementById('contributeResult');
  const btn = document.getElementById('contributeBtn');
  btn.disabled = true;

  // Shuffle for variety
  const shuffled = [...selected].sort(() => Math.random() - 0.5);

  // Split into chunks of 10 (wave mode)
  const chunkSize = 10;
  const waves = [];
  for (let i = 0; i < shuffled.length; i += chunkSize) {
    waves.push(shuffled.slice(i, i + chunkSize));
  }

  resultEl.innerHTML = `<div class="loading">Wave 0/${waves.length} ...</div>`;
  let totalIncarnated = 0;
  let failures = 0;
  const delayMs = 3000;

  for (let w = 0; w < waves.length; w++) {
    const capsule = buildCapsuleFromChunk(waves[w]);
    const seedCount = capsule.topTier.length + capsule.normalNodes.length + capsule.ghostNodes.length;

    resultEl.innerHTML = `<div class="loading">Wave ${w + 1}/${waves.length} (${seedCount} seeds)...</div>`;

    try {
      const data = await api('/sphere/contribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'sphere-ui', capsule })
      });
      if (data.success) {
        totalIncarnated += data.nodeCount ?? 0;
      } else {
        failures++;
      }
    } catch (_e) {
      failures++;
    }

    // Wait between waves (except the last one)
    if (w < waves.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  const failMsg = failures > 0 ? ` (${failures} failed)` : '';
  resultEl.innerHTML = `<div class="success">✓ ${totalIncarnated} nodes contributed! Check Dashboard for updates.${failMsg}</div>`;

  // Clear selection after successful contribution
  document.querySelectorAll('#mockList input[type="checkbox"]').forEach(cb => cb.checked = false);
  updateSelectedCount();

  // Update Dashboard node count
  if (totalIncarnated > 0) {
    fetchDashboard();
  }

  btn.disabled = false;
});

// === Dive ===
let diveWs = null;
let diveAgentId = null;
let diveRequestId = 0;
const divePendingRequests = new Map();
let selectedNodeId = null;
let pendingEntry = null; // validated entry stored before WS connect
let diveStats = null; // client-side action tracker
let diveEnergy = 100; // local energy tracking (mirrors sphere-context DEFAULT_ENERGY)
const ENERGY_COSTS = { scan: 1, sense: 3, focus: 10, warp: 15, move: 5, evaluate: 3 };

function updateEnergyDisplay() {
  const el = document.getElementById('energyValue');
  if (el) {
    el.textContent = diveEnergy;
    el.parentElement.classList.toggle('energy-low', diveEnergy <= 10);
    el.parentElement.classList.toggle('energy-critical', diveEnergy <= 0);
  }
}

function consumeEnergy(action) {
  const cost = ENERGY_COSTS[action] ?? 0;
  diveEnergy = Math.max(0, diveEnergy - cost);
  updateEnergyDisplay();
}

function getDiveEntryRequest() {
  const raw = document.getElementById('diveEntry').value;
  const query = sanitizeInput(raw);
  const err = validateDiveInput(query);
  if (err) return { error: err };

  // Extract tags from comma/space-separated words (first 5, lowercase)
  const tags = query.toLowerCase().split(/[\s,]+/).filter(w => w.length >= 2).slice(0, 5);
  if (tags.length === 0) tags.push('explore');
  return { query, tags };
}

async function startDive() {
  // Validate input before requesting ticket
  pendingEntry = getDiveEntryRequest();
  if (pendingEntry.error) {
    addDiveLog(`Input error: ${pendingEntry.error}`);
    pendingEntry = null;
    return;
  }

  try {
    addDiveLog('Requesting dive ticket...');
    const data = await api('/dive/request', { method: 'POST' });
    if (!data.success) { addDiveLog(`Error: ${data.error}`); return; }

    const token = data.ticket.token;
    addDiveLog('Ticket received. Connecting WebSocket...');

    diveWs = new WebSocket(`${getWsUrl()}?token=${token}`);

    diveWs.onopen = () => {
      addDiveLog('WebSocket connected');
      setDivePhase('connected');
    };

    diveWs.onmessage = (event) => {
      try { handleDiveMessage(JSON.parse(event.data)); }
      catch (err) { addDiveLog(`[JS Error] ${err.message}`); }
    };

    diveWs.onclose = (event) => {
      addDiveLog(`Disconnected (code: ${event.code})`);
      resetDive();
    };

    diveWs.onerror = () => addDiveLog('WebSocket error');
  } catch (e) {
    addDiveLog(`Error: ${e.message}`);
  }
}

function handleDiveMessage(msg) {
  switch (msg.type) {
    case 'welcome':
      diveAgentId = msg.sessionId;
      document.getElementById('diveAgentId').textContent = `Session: ${msg.sessionId?.slice(0, 8) ?? '?'}`;
      addDiveLog(`Welcome! Session ${msg.sessionId?.slice(0, 8) ?? '?'}`);
      // Send pre-validated EntryRequest
      addDiveLog(`Entry: "${pendingEntry.query}" [${pendingEntry.tags.join(', ')}]`);
      diveWs.send(JSON.stringify({
        type: 'entry',
        requestId: `req-${++diveRequestId}`,
        request: pendingEntry
      }));
      setDivePhase('pending');
      break;

    case 'processing':
      addDiveLog('Processing entry...');
      setDivePhase('processing');
      break;

    case 'positioned':
      addDiveLog(`Positioned! Query: "${msg.query}", Time: ${msg.remainingTime ?? '?'}s`);
      setDivePhase('active');
      document.getElementById('diveActions').style.display = 'flex';
      document.getElementById('endDive').disabled = false;
      diveStats = { startedAt: Date.now(), scans: 0, senses: 0, focuses: 0, moves: 0, evaluates: 0 };
      diveEnergy = 100;
      document.getElementById('energyDisplay').style.display = 'inline';
      updateEnergyDisplay();
      // Auto-transition: tutorial → sanctuary → core (sequential)
      sendDiveAction('enterSanctuary', {}).then(() => sendDiveAction('enterCore', {}));
      break;

    case 'layerChanged':
      addDiveLog(`Layer: ${msg.layer}`);
      resolvePending(msg.requestId, msg);
      break;

    case 'senseResult':
    case 'scanResult':
      addDiveLog(`${msg.type}: ${msg.nodes?.length ?? 0} nodes`);
      if (diveStats) { msg.type === 'senseResult' ? diveStats.senses++ : diveStats.scans++; }
      consumeEnergy(msg.type === 'senseResult' ? 'sense' : 'scan');
      resolvePending(msg.requestId, msg);
      if (msg.nodes?.length > 0) renderDiveNodes(msg.nodes, msg.type === 'senseResult' ? 'Sense' : 'Scan');
      break;

    case 'focusResult':
      addDiveLog(`Focus: ${msg.node?.kind ?? 'unknown'}`);
      if (diveStats) diveStats.focuses++;
      consumeEnergy('focus');
      resolvePending(msg.requestId, msg);
      renderFocusResult(msg);
      break;

    case 'moveResult':
      addDiveLog(`Moved! ${msg.result?.success ? 'OK' : 'Blocked: ' + (msg.result?.blocked ?? '?')}`);
      if (diveStats) diveStats.moves++;
      consumeEnergy('move');
      if (msg.result?.success) {
        document.getElementById('diveResults').innerHTML =
          '<div class="dive-info">Moved. Use Sense or Scan to explore your new surroundings.</div>';
      }
      resolvePending(msg.requestId, msg);
      break;

    case 'warpResult':
      if (msg.result?.success) {
        addDiveLog(`✓ Warped to ${msg.result.arrivedAt?.slice(0, 12) || 'unknown'}`);
        document.getElementById('warpNodeId').value = '';
        consumeEnergy('warp');
        // Clear stale results — previous focus/sense data is no longer valid after warp
        document.getElementById('diveResults').innerHTML =
          '<div class="dive-info">Warped. Use Sense or Scan to explore your new surroundings.</div>';
      } else {
        const err = msg.result?.error || 'unknown';
        addDiveLog(`✗ Warp failed: ${err === 'not_visible' ? 'Node not visible (scan/sense first)' : err}`);
      }
      resolvePending(msg.requestId, msg);
      break;

    case 'evaluateResult':
      addDiveLog(`Evaluate: ${msg.success ? 'success' : 'failed' + (msg.reason ? ' (' + msg.reason + ')' : '')}`);
      if (diveStats && msg.success) diveStats.evaluates++;
      if (msg.success) consumeEnergy('evaluate');
      resolvePending(msg.requestId, msg);
      break;

    case 'returnAck':
      addDiveLog('Returned from Sphere');
      resolvePending(msg.requestId, msg);
      if (diveStats) renderReturnSummary(diveStats);
      resetDive();
      break;

    case 'entryError':
      addDiveLog(`Entry rejected: ${(msg.errors || []).map(e => e.code || e.message).join(', ')}`);
      break;

    case 'amber_showcase':
      addDiveLog(`Amber Showcase: ${msg.amber?.length ?? 0} entries`);
      break;

    case 'bus_message':
      addDiveLog(`[Bus] ${msg.senderId?.slice(0, 6)}: ${msg.protocol}`);
      break;

    case 'error':
      addDiveLog(`Error: ${msg.error ?? 'Unknown error'}`);
      resolvePending(msg.requestId, msg);
      break;

    case 'warning':
      addDiveLog(`Warning: ${msg.message}`);
      break;

    case 'expelled':
      addDiveLog(`Expelled: ${msg.reason}`);
      resetDive();
      break;

    default:
      addDiveLog(`[${msg.type}] ${JSON.stringify(msg).slice(0, 80)}`);
  }
}

function sendDiveAction(type, payload) {
  if (!diveWs || diveWs.readyState !== WebSocket.OPEN) {
    addDiveLog(`[Action] ${type} skipped (WS not open)`);
    return null;
  }
  const reqId = `req-${++diveRequestId}`;
  const msg = { type, requestId: reqId, ...payload };
  addDiveLog(`> ${type} (${reqId})`);
  diveWs.send(JSON.stringify(msg));
  return new Promise(resolve => {
    divePendingRequests.set(reqId, resolve);
    setTimeout(() => { if (divePendingRequests.has(reqId)) { divePendingRequests.delete(reqId); addDiveLog(`[Timeout] ${type} (${reqId})`); resolve(null); } }, 10000);
  });
}

function resolvePending(reqId, data) {
  if (reqId && divePendingRequests.has(reqId)) {
    divePendingRequests.get(reqId)(data);
    divePendingRequests.delete(reqId);
  }
}

function renderDiveNodes(nodes, title) {
  const el = document.getElementById('diveResults');
  const isSense = title === 'Sense';
  el.innerHTML = `<h5>${escapeHtml(title)}</h5>` + nodes.map(n => {
    const heat = typeof n.heat === 'number' ? n.heat : (n.h ?? 0);
    const shortId = n.id.slice(0, 12);
    let label = '';
    if (n.summary) {
      label = `<strong>Summary:</strong> ${escapeHtml(n.summary)}`;
    } else if (n.tags && n.tags.length > 0) {
      label = `<strong>Tags:</strong> ${n.tags.map(t => escapeHtml(t)).join(', ')}`;
    }
    const canFocus = isSense && (n.kind === 'active' || n.kind === 'amber');
    return `<div class="dive-node" data-id="${n.id}">
      <span class="kind-badge kind-${n.kind}">${n.kind}</span>
      <span class="node-id" title="${n.id}" onclick="window._setWarpId('${n.id}')">${shortId}</span>
      <span class="node-summary">${label}</span>
      <span class="node-heat">h=${heat.toFixed(1)}</span>
      <div class="node-actions">
        ${canFocus ? `<button class="mini-btn" onclick="window._selectAndFocus('${n.id}')">Focus</button>` : ''}
        <button class="mini-btn mini-btn-warp" onclick="window._warpTo('${n.id}')">Warp</button>
      </div>
    </div>`;
  }).join('');
}

function renderFocusResult(msg) {
  const el = document.getElementById('diveResults');
  const n = msg.node;
  if (!n) { el.innerHTML = '<div class="error">Focus failed</div>'; return; }

  el.innerHTML = `
    <h5>Focus: ${escapeHtml(n.kind)}</h5>
    <div class="focus-detail">
      <div class="metric-row"><span>ID</span><span>${n.id}</span></div>
      <div class="metric-row"><span>Kind</span><span class="kind-badge kind-${n.kind}">${n.kind}</span></div>
      <div class="metric-row"><span>Heat</span><span>${n.heat?.toFixed(1) ?? '?'}</span></div>
      <div class="metric-row"><span>Weight</span><span>${n.weight?.toFixed(1) ?? '?'}</span></div>
      <div class="metric-row"><span>Decay</span><span>${n.decay?.toFixed(1) ?? '?'}</span></div>
      ${n.summary ? `<div class="focus-summary"><strong>Summary:</strong> ${escapeHtml(n.summary)}</div>` : ''}
      ${n.tags?.length ? `<div class="result-tags"><strong>Tags:</strong> ${n.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      ${n.content ? `<div class="focus-content"><span class="content-label">📄 Main Content:</span><br>${escapeHtml(n.content)}</div>` : ''}
      <div class="evaluate-controls">
        <label>Heat: <input type="range" id="evalHeat" min="0" max="10" value="5"></label>
        <label>Confidence: <input type="range" id="evalConf" min="0" max="100" value="70"></label>
        <button onclick="window._evaluateNode('${n.id}')">Evaluate</button>
      </div>
    </div>
    ${msg.nearbyGhosts?.length ? `<h5>Nearby Ghosts (${msg.nearbyGhosts.length})</h5>` +
      msg.nearbyGhosts.map(g => `<div class="dive-node" data-id="${g.id}">
        <span class="kind-badge kind-${g.kind || 'ghost'}">${g.kind || 'ghost'}</span>
        <span class="node-id" title="${g.id}" onclick="window._setWarpId('${g.id}')">${g.id?.slice(0, 12) ?? '?'}</span>
        <span class="node-summary">${g.summary ? escapeHtml(g.summary) : (g.tags?.length ? g.tags.map(t => escapeHtml(t)).join(', ') : '')}</span>
        <div class="node-actions">
          <button class="mini-btn mini-btn-warp" onclick="window._warpTo('${g.id}')">Warp</button>
        </div>
      </div>`).join('') : ''}
  `;
}

window._selectAndFocus = function(id) {
  selectedNodeId = id;
  sendDiveAction('focus', { nodeId: id });
};

window._setWarpId = function(id) {
  document.getElementById('warpNodeId').value = id;
};

window._warpTo = function(id) {
  document.getElementById('warpNodeId').value = id;
  sendDiveAction('warp', { nodeId: id });
  addDiveLog(`Warping to ${id.slice(0, 12)}...`);
};

window._evaluateNode = function(id) {
  const h = parseInt(document.getElementById('evalHeat').value);
  const w = 5; // neutral weight
  const d = 5; // neutral decay
  sendDiveAction('evaluate', { nodeId: id, h, w, d });
};

document.querySelectorAll('#diveActions button[data-action]').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    const radius = parseFloat(document.getElementById('diveRadius').value) || 3;
    // Clear previous results on new action
    document.getElementById('diveResults').innerHTML = '';
    if (action === 'scan') sendDiveAction('scan', { radius });
    else if (action === 'sense') sendDiveAction('sense', { radius });
    else if (action === 'move') sendDiveAction('move', { step: 0.3, mode: document.getElementById('moveMode').value });
  });
});

// Warp button handler
document.getElementById('warpBtn').addEventListener('click', () => {
  const nodeId = document.getElementById('warpNodeId').value.trim();
  if (!nodeId) {
    addDiveLog('⚠️ Warp failed: Enter a node ID');
    return;
  }
  document.getElementById('diveResults').innerHTML = '';
  sendDiveAction('warp', { nodeId });
  addDiveLog(`Warping to ${nodeId.slice(0, 12)}...`);
});

document.getElementById('startDive').addEventListener('click', startDive);
document.getElementById('endDive').addEventListener('click', () => { if (diveWs) sendDiveAction('return', {}); });

// Action help modal
document.getElementById('actionHelpBtn').addEventListener('click', () => {
  document.getElementById('actionHelpModal').style.display = 'flex';
});
document.getElementById('closeActionHelp').addEventListener('click', () => {
  document.getElementById('actionHelpModal').style.display = 'none';
});
document.getElementById('actionHelpModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
});

function setDivePhase(phase) {
  const el = document.getElementById('divePhase');
  el.textContent = phase;
  el.className = 'phase-indicator phase-' + phase;
}

function addDiveLog(msg) {
  const el = document.getElementById('diveLog');
  const time = new Date().toLocaleTimeString();
  el.innerHTML += `<div class="log-entry"><span class="log-time">${time}</span> ${escapeHtml(msg)}</div>`;
  el.scrollTop = el.scrollHeight;
}

function renderReturnSummary(s) {
  const el = document.getElementById('diveResults');
  const dur = Date.now() - s.startedAt;
  const mins = Math.floor(dur / 60000);
  const secs = Math.floor((dur % 60000) / 1000);
  el.innerHTML = `
    <div class="return-summary">
      <h4>Dive Summary</h4>
      <p class="summary-description">
        Agents transform these experiences into nodes and contribute them to the Sphere.
      </p>
      <table class="summary-table">
        <tr><td>Duration</td><td>${mins}m ${secs}s</td></tr>
        <tr><td>Scans</td><td>${s.scans}</td></tr>
        <tr><td>Senses</td><td>${s.senses}</td></tr>
        <tr><td>Focuses</td><td>${s.focuses}</td></tr>
        <tr><td>Moves</td><td>${s.moves}</td></tr>
        <tr><td>Evaluations</td><td>${s.evaluates}</td></tr>
      </table>
    </div>`;
}

function resetDive() {
  diveWs = null;
  diveAgentId = null;
  diveStats = null;
  selectedNodeId = null;
  divePendingRequests.clear();
  setDivePhase('disconnected');
  document.getElementById('diveActions').style.display = 'none';
  document.getElementById('endDive').disabled = true;
  document.getElementById('diveAgentId').textContent = '';
  document.getElementById('warpNodeId').value = '';
  document.getElementById('energyDisplay').style.display = 'none';
  diveEnergy = 100;
}

// === Swarm ===
let swarmAgents = [];

function getRandomEntryRequest() {
  if (mockData.length > 0) {
    const item = mockData[Math.floor(Math.random() * mockData.length)];
    return { query: item.summary || item.title || 'swarm', tags: item.tags || ['swarm'] };
  }
  return { query: 'Automated swarm exploration', tags: ['swarm', 'auto'] };
}

document.getElementById('launchSwarm').addEventListener('click', async () => {
  const count = parseInt(document.getElementById('swarmCount').value);
  document.getElementById('launchSwarm').disabled = true;
  document.getElementById('stopSwarm').disabled = false;

  for (let i = 0; i < count; i++) {
    await launchSwarmAgent(i);
    await new Promise(r => setTimeout(r, 500));
  }
});

document.getElementById('stopSwarm').addEventListener('click', () => {
  swarmAgents.forEach(a => { if (a.ws && a.ws.readyState === WebSocket.OPEN) a.ws.close(); });
  swarmAgents = [];
  document.getElementById('swarmStatus').innerHTML = '<div>All agents stopped</div>';
  document.getElementById('launchSwarm').disabled = false;
  document.getElementById('stopSwarm').disabled = true;
});

async function launchSwarmAgent(index) {
  try {
    const data = await api('/dive/request', { method: 'POST' });
    if (!data.success) {
      document.getElementById('swarmStatus').innerHTML += `<div class="error">Agent ${index}: ticket failed</div>`;
      return;
    }

    const ws = new WebSocket(`${getWsUrl()}?token=${data.ticket.token}`);
    const agent = { ws, index, phase: 'connecting', actions: 0, agentId: '' };
    swarmAgents.push(agent);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case 'welcome':
          agent.agentId = msg.sessionId || '';
          const swarmEntry = getRandomEntryRequest();
          ws.send(JSON.stringify({
            type: 'entry',
            requestId: `swarm-${index}-${Date.now()}`,
            request: swarmEntry
          }));
          agent.phase = 'entering';
          break;
        case 'processing':
          agent.phase = 'processing';
          break;
        case 'positioned':
          agent.phase = 'active';
          autoExplore(agent);
          break;
        case 'senseResult':
          if (msg.nodes?.length > 0) {
            const target = msg.nodes[Math.floor(Math.random() * msg.nodes.length)];
            ws.send(JSON.stringify({ type: 'focus', requestId: `s-${Date.now()}`, nodeId: target.id }));
          } else {
            const modes = ['random', 'hot', 'explore'];
            ws.send(JSON.stringify({ type: 'move', requestId: `s-${Date.now()}`, step: 0.3, mode: modes[Math.floor(Math.random() * modes.length)] }));
          }
          agent.actions++;
          break;
        case 'focusResult':
          if (msg.node) {
            const evalH = Math.floor(3 + Math.random() * 5);
            ws.send(JSON.stringify({
              type: 'evaluate', requestId: `s-${Date.now()}`, nodeId: msg.node.id,
              h: evalH, w: 5, d: 5
            }));
          }
          agent.actions++;
          break;
        case 'evaluateResult':
        case 'moveResult':
          agent.actions++;
          setTimeout(() => autoExplore(agent), 2000);
          break;
        case 'error':
          console.warn(`[Swarm Agent ${agent.index}] Error:`, msg.error);
          // Continue exploration despite errors
          setTimeout(() => autoExplore(agent), 3000);
          break;
        case 'expelled':
        case 'returnAck':
          agent.phase = 'done';
          break;
      }
      updateSwarmStatus();
    };

    ws.onclose = () => { agent.phase = 'disconnected'; updateSwarmStatus(); };
  } catch (e) {
    document.getElementById('swarmStatus').innerHTML += `<div class="error">Agent ${index}: ${e.message}</div>`;
  }
}

function autoExplore(agent) {
  if (!agent.ws || agent.ws.readyState !== WebSocket.OPEN) return;
  agent.ws.send(JSON.stringify({ type: 'sense', requestId: `s-${Date.now()}`, radius: 5 }));
}

function updateSwarmStatus() {
  document.getElementById('swarmStatus').innerHTML = swarmAgents.map(a =>
    `<div class="swarm-agent">
      <span class="phase-indicator phase-${a.phase}">${a.phase}</span>
      <span>Agent ${a.index}${a.agentId ? ' (' + a.agentId.slice(0, 6) + ')' : ''}</span>
      <span>Actions: ${a.actions}</span>
    </div>`
  ).join('');
}

// === Docs ===
let docsLoaded = false;

const DOCS = [
  { file: 'introduction.md', title: 'What is Sphere?' },
  { file: 'why-sphere.md', title: 'Why Sphere Matters' },
  { file: 'architecture.md', title: 'Technical Architecture' },
  { file: 'agent-rulebook.md', title: 'Agent Rulebook' },
  { file: 'diving-experience.md', title: 'Diving Experience' },
];

function loadDocsList() {
  docsLoaded = true;
  const ul = document.getElementById('docsList');
  ul.innerHTML = DOCS.map(d =>
    `<li><a href="#" data-doc="${d.file}">${d.title}</a></li>`
  ).join('');

  ul.addEventListener('click', async (e) => {
    if (e.target.tagName !== 'A') return;
    e.preventDefault();
    const file = e.target.dataset.doc;
    ul.querySelectorAll('a').forEach(a => a.classList.remove('active'));
    e.target.classList.add('active');

    const content = document.getElementById('docsContent');
    content.innerHTML = '<div class="loading">Loading...</div>';

    try {
      const res = await fetch(`docs/${file}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const md = await res.text();
      content.innerHTML = marked.parse(md);
    } catch (err) {
      content.innerHTML = `<div class="error">Failed to load ${escapeHtml(file)}: ${escapeHtml(err.message)}</div>`;
    }
  });

  const first = ul.querySelector('a');
  if (first) first.click();
}

// === Init ===
startPolling();

})();
