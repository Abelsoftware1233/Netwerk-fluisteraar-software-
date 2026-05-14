/**
 * NETWERKVERKEER FLUISTERAAR — script.js
 * Main application controller.
 * Connects to Flask API (or uses demo data if offline).
 * Handles: data fetching, table rendering, filtering, detail view.
 */

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:5000/api';
const POLL_INTERVAL_MS = 15_000; // refresh every 15s
const DEMO_MODE = true; // set false if backend is running

// ─── STATE ────────────────────────────────────────────────────────────────────

let allConnections = [];
let activeFilter   = 'all';
let selectedRow    = null;
let pollTimer      = null;
let scanData       = null;

// ─── STARTUP ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  UI.addLog('>> FLUISTERAAR SYSTEEM GESTART', 'info');
  UI.addLog('>> Verbinding initialiseren...', 'info');
  bootSequence();
});

async function bootSequence() {
  await typeLoaderText([
    'KERNEL MODULES LADEN...',
    'NETWERK INTERFACE DETECTEREN...',
    'PACKET CAPTURE INITIALISEREN...',
    'GEO-IP DATABASE KOPPELEN...',
    'VERBINDING GEREED'
  ]);
  await fetchData();
  startPolling();
}

// ─── TERMINAL BOOT ANIMATION ──────────────────────────────────────────────────

function typeLoaderText(messages) {
  return new Promise(resolve => {
    const el = document.getElementById('loader-text');
    if (!el) return resolve();

    let i = 0;
    const next = () => {
      if (i >= messages.length) { resolve(); return; }
      el.textContent = messages[i++];
      setTimeout(next, 400);
    };
    next();
  });
}

// ─── DATA FETCHING ────────────────────────────────────────────────────────────

async function fetchData() {
  setStatus('scanning');

  try {
    let data;

    if (!DEMO_MODE) {
      const res = await fetch(`${API_BASE}/scan`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } else {
      // Built-in demo data (no backend required)
      data = getDemoData();
    }

    scanData = data;
    allConnections = data.connections || [];

    renderAll(data);
    setStatus('online');
    UI.addLog(`>> Scan voltooid: ${data.total_connections} verbindingen, ${data.foreign_count} buitenlands`, 'info');

    // Log high-risk findings
    allConnections
      .filter(c => c.risk === 'HIGH')
      .forEach(c => {
        UI.addLog(`⚠ HOOG RISICO: ${c.remote_ip} → ${c.country} (${c.process})`, 'high');
      });

  } catch (err) {
    console.warn('API not available, using demo data:', err);
    const data = getDemoData();
    scanData = data;
    allConnections = data.connections;
    renderAll(data);
    setStatus('online');
    UI.addLog('>> Demo modus actief (geen backend)', 'medium');
  }
}

// ─── RENDER ALL ───────────────────────────────────────────────────────────────

function renderAll(data) {
  // Metrics
  const highRisk = (data.connections || []).filter(c => c.risk === 'HIGH').length;
  const total    = data.total_connections || 0;
  const foreign  = data.foreign_count || 0;

  setMetric('val-total',   'fill-total',   total,   total,   total   || 1);
  setMetric('val-foreign', 'fill-foreign', foreign, foreign, total   || 1);
  setMetric('val-risk',    'fill-risk',    highRisk, highRisk, foreign || 1);

  // Scan time
  const st = document.getElementById('scan-time');
  if (st && data.scan_time) {
    const d = new Date(data.scan_time);
    st.textContent = d.toLocaleTimeString('nl-NL');
  }

  // Globe
  const globeCountEl = document.getElementById('globe-count');
  if (globeCountEl) globeCountEl.textContent = `${foreign} ACTIEF`;
  UI.initGlobe(data.connections || []);

  // Country list
  UI.renderCountryList(data.country_tally || {});

  // Devices
  UI.renderDeviceList(data.lan_devices || []);

  // Connection table
  renderTable(allConnections, activeFilter);
}

function setMetric(valId, fillId, display, value, max) {
  const valEl  = document.getElementById(valId);
  const fillEl = document.getElementById(fillId);
  if (valEl)  valEl.textContent = display;
  if (fillEl) fillEl.style.width = `${Math.min(100, Math.round(value / max * 100))}%`;
}

// ─── TABLE ────────────────────────────────────────────────────────────────────

function renderTable(connections, filter) {
  const tbody = document.getElementById('conn-tbody');
  if (!tbody) return;

  const filtered = connections.filter(c => {
    if (filter === 'foreign') return c.is_foreign;
    if (filter === 'HIGH')    return c.risk === 'HIGH';
    if (filter === 'MEDIUM')  return c.risk === 'MEDIUM';
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr class="loading-row"><td colspan="8">
      <div class="terminal-loader">
        <span class="tl-prefix">>> </span>
        <span>Geen verbindingen gevonden voor dit filter.</span>
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  filtered.forEach((conn, idx) => {
    const flag = UI.getFlag(conn.country_code || UI.guessCountryCode(conn.country));
    const tr = document.createElement('tr');
    tr.setAttribute('data-idx', idx);
    tr.innerHTML = `
      <td><span class="risk-badge ${conn.risk}">${conn.risk}</span></td>
      <td>${conn.process || '<span style="color:var(--text-dim)">—</span>'}</td>
      <td style="color:var(--text-dim)">${(conn.proto || '?').toUpperCase()}</td>
      <td style="color:var(--green-dim);font-family:var(--font-mono)">${conn.remote_ip}</td>
      <td style="color:var(--text-dim)">${conn.remote_port}</td>
      <td>
        <div class="country-cell">
          <span>${flag}</span>
          <span>${conn.country || '??'}</span>
        </div>
      </td>
      <td style="color:var(--text-dim);max-width:180px;overflow:hidden;text-overflow:ellipsis" title="${conn.org || ''}">${truncate(conn.org, 28)}</td>
      <td style="color:${stateColor(conn.state)}">${conn.state || '?'}</td>
    `;
    tr.addEventListener('click', () => selectRow(tr, conn, filtered));
    tbody.appendChild(tr);
  });
}

function truncate(str, max) {
  if (!str) return '—';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function stateColor(state) {
  if (!state) return 'var(--text-dim)';
  if (state === 'ESTABLISHED') return 'var(--green-dim)';
  if (state === 'TIME_WAIT')   return 'var(--amber-dim)';
  if (state === 'CLOSE_WAIT')  return 'var(--red-dim)';
  return 'var(--text-dim)';
}

// ─── FILTER ───────────────────────────────────────────────────────────────────

function setFilter(filter, btn) {
  activeFilter = filter;

  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  renderTable(allConnections, filter);
}

window.setFilter = setFilter;

// ─── DETAIL VIEW ──────────────────────────────────────────────────────────────

function selectRow(tr, conn) {
  // Deselect previous
  if (selectedRow) selectedRow.classList.remove('selected');
  tr.classList.add('selected');
  selectedRow = tr;

  // Show detail panel
  document.getElementById('detail-empty').classList.add('hidden');
  const content = document.getElementById('detail-content');
  content.classList.remove('hidden');

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val || '—';
  };

  const riskEl = document.getElementById('detail-risk');
  if (riskEl) {
    riskEl.textContent = `${conn.risk} RISICO`;
    riskEl.className = `detail-risk-badge ${conn.risk}`;
  }

  set('d-hostname', conn.hostname);
  set('d-ip',       conn.remote_ip);
  set('d-port',     conn.remote_port);
  set('d-proto',    (conn.proto || '?').toUpperCase());
  set('d-country',  `${UI.getFlag(conn.country_code || UI.guessCountryCode(conn.country))} ${conn.country || '?'} (${conn.city || '?'})`);
  set('d-org',      conn.org);
  set('d-process',  conn.process);
  set('d-state',    conn.state);
  set('d-time',     conn.timestamp ? new Date(conn.timestamp).toLocaleString('nl-NL') : '?');

  // Mini map
  if (conn.lat && conn.lon) {
    UI.renderMiniMap(conn.lat, conn.lon);
  }

  // Hide traceroute output
  const tro = document.getElementById('traceroute-output');
  if (tro) tro.classList.add('hidden');

  // Store current connection for actions
  window._selectedConn = conn;

  UI.addLog(`>> Detail geladen: ${conn.remote_ip} (${conn.country})`, 'info');
}

// ─── ACTIONS ──────────────────────────────────────────────────────────────────

function blockConnection() {
  const conn = window._selectedConn;
  if (!conn) return;

  UI.addLog(`⊘ GEBLOKKEERD: ${conn.remote_ip} (${conn.country}) — ${conn.process}`, 'high');

  // Visual feedback
  if (selectedRow) {
    selectedRow.style.opacity = '0.3';
    selectedRow.style.textDecoration = 'line-through';
  }
}

function traceRoute() {
  const conn = window._selectedConn;
  if (!conn) return;

  const tro = document.getElementById('traceroute-output');
  if (!tro) return;
  tro.classList.remove('hidden');
  tro.textContent = '';

  UI.addLog(`⇢ TRACEROUTE naar ${conn.remote_ip}...`, 'info');

  const hops = generateFakeTraceroute(conn.remote_ip, conn.country);
  let i = 0;
  const timer = setInterval(() => {
    if (i >= hops.length) { clearInterval(timer); return; }
    tro.textContent += hops[i++] + '\n';
    tro.scrollTop = tro.scrollHeight;
  }, 180);
}

function generateFakeTraceroute(ip, country) {
  const lines = [
    `traceroute to ${ip} (${ip}), 30 hops max`,
    ` 1  192.168.1.1       0.412 ms   0.301 ms   0.288 ms`,
    ` 2  10.0.0.1          2.11 ms    1.98 ms    2.03 ms`,
    ` 3  ae-1.r00.amstnl02.nl.bb.gin.ntt.net  5.6 ms`,
    ` 4  xe-3.r20.frnkge04.de.bb.gin.ntt.net  18.3 ms`,
    ` 5  * * *`,
    ` 6  ${ip.split('.').slice(0,2).join('.')}.backbone.ix.  31.2 ms`,
    ` 7  ${ip}  ${Math.round(20 + Math.random()*150)} ms  (${country})`,
  ];
  return lines;
}

window.blockConnection = blockConnection;
window.traceRoute      = traceRoute;

// ─── SCAN BUTTON ──────────────────────────────────────────────────────────────

async function triggerScan() {
  const btn = document.getElementById('btn-scan');
  if (btn) {
    btn.disabled = true;
    btn.querySelector('span:last-child').textContent = 'SCANNEN...';
  }

  UI.addLog('>> Handmatige scan gestart...', 'info');

  if (!DEMO_MODE) {
    try {
      await fetch(`${API_BASE}/scan/run`, { method: 'POST' });
    } catch (_) {}
    setTimeout(async () => {
      await fetchData();
      resetScanBtn();
    }, 3000);
  } else {
    // Demo: regenerate with slight variation
    await new Promise(r => setTimeout(r, 1500));
    await fetchData();
    resetScanBtn();
  }
}

function resetScanBtn() {
  const btn = document.getElementById('btn-scan');
  if (btn) {
    btn.disabled = false;
    btn.querySelector('span:last-child').textContent = 'SCAN UITVOEREN';
  }
}

window.triggerScan = triggerScan;

// ─── STATUS ───────────────────────────────────────────────────────────────────

function setStatus(state) {
  const dot   = document.getElementById('status-dot');
  const label = document.getElementById('status-label');

  dot.className = `status-dot ${state}`;

  if (state === 'online')   label.textContent = 'SYSTEEM ACTIEF';
  if (state === 'scanning') label.textContent = 'SCANNEN...';
  if (state === 'offline')  label.textContent = 'OFFLINE';
}

// ─── POLLING ──────────────────────────────────────────────────────────────────

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(fetchData, POLL_INTERVAL_MS);
}

// ─── DEMO DATA ────────────────────────────────────────────────────────────────

function getDemoData() {
  const now = new Date().toISOString();
  return {
    scan_time: now,
    total_connections: 18,
    foreign_count: 11,
    country_tally: {
      'United States': 7, 'China': 2, 'Russia': 1,
      'Germany': 1, 'Netherlands': 4, 'Ireland': 2, 'Singapore': 1,
    },
    lan_devices: [
      { ip: '192.168.1.1',  mac: 'aa:bb:cc:dd:ee:01', hostname: 'router.local' },
      { ip: '192.168.1.10', mac: 'aa:bb:cc:dd:ee:02', hostname: 'smart-tv.local' },
      { ip: '192.168.1.15', mac: 'aa:bb:cc:dd:ee:03', hostname: 'thermostat.local' },
      { ip: '192.168.1.20', mac: 'aa:bb:cc:dd:ee:04', hostname: 'camera-01.local' },
      { ip: '192.168.1.25', mac: 'aa:bb:cc:dd:ee:05', hostname: 'echo-dot.local' },
    ],
    connections: [
      { proto:'tcp', local:'192.168.1.10:54231', remote_ip:'93.184.216.34',  remote_port:443,  state:'ESTABLISHED', country:'United States', country_code:'US', city:'Norwell',   org:'AS15133 Edgecast Inc.',          lat:42.16,  lon:-70.82, is_foreign:true,  process:'SmartTV-App',    hostname:'server.iana.example.com', risk:'MEDIUM', timestamp:now },
      { proto:'tcp', local:'192.168.1.15:61022', remote_ip:'39.156.70.21',   remote_port:8883, state:'ESTABLISHED', country:'China',         country_code:'CN', city:'Beijing',   org:'AS23724 IDC China Telecom',      lat:39.90,  lon:116.39, is_foreign:true,  process:'thermostat-d',   hostname:'mqtt.tuya.cn',            risk:'HIGH',   timestamp:now },
      { proto:'tcp', local:'192.168.1.20:55701', remote_ip:'185.53.178.9',   remote_port:554,  state:'ESTABLISHED', country:'Russia',        country_code:'RU', city:'Moscow',    org:'AS204428 SRT Wireless LLC',      lat:55.75,  lon:37.62,  is_foreign:true,  process:'camera-agent',   hostname:'relay.hikvision.ru',      risk:'HIGH',   timestamp:now },
      { proto:'tcp', local:'192.168.1.25:49832', remote_ip:'54.239.28.85',   remote_port:443,  state:'ESTABLISHED', country:'United States', country_code:'US', city:'Ashburn',   org:'AS16509 Amazon.com Inc.',        lat:39.04,  lon:-77.49, is_foreign:true,  process:'alexa-agent',    hostname:'avs-alexa-eu.amazon.com', risk:'MEDIUM', timestamp:now },
      { proto:'udp', local:'192.168.1.10:1900',  remote_ip:'142.250.80.46',  remote_port:443,  state:'STATELESS',   country:'United States', country_code:'US', city:'Mtn View',  org:'AS15169 Google LLC',             lat:37.38,  lon:-122.08,is_foreign:true,  process:'SmartTV-upnp',   hostname:'googlevideo.com',         risk:'MEDIUM', timestamp:now },
      { proto:'tcp', local:'192.168.1.15:60011', remote_ip:'52.211.12.44',   remote_port:443,  state:'ESTABLISHED', country:'Ireland',       country_code:'IE', city:'Dublin',    org:'AS16509 Amazon AWS EU',          lat:53.33,  lon:-6.25,  is_foreign:true,  process:'nest-agent',     hostname:'home.nest.com',           risk:'MEDIUM', timestamp:now },
      { proto:'tcp', local:'192.168.1.20:50221', remote_ip:'13.251.19.45',   remote_port:8443, state:'ESTABLISHED', country:'Singapore',     country_code:'SG', city:'Singapore', org:'AS16509 Amazon AWS SG',          lat:1.35,   lon:103.82, is_foreign:true,  process:'camera-agent',   hostname:'p2p.reolink-sg.com',      risk:'HIGH',   timestamp:now },
      { proto:'tcp', local:'192.168.1.1:55312',  remote_ip:'37.49.226.10',   remote_port:443,  state:'ESTABLISHED', country:'Netherlands',   country_code:'NL', city:'Amsterdam', org:'AS12859 NL-BIT',                lat:52.37,  lon:4.89,   is_foreign:false, process:'router-update',  hostname:'update.tp-link.com',      risk:'LOW',    timestamp:now },
      { proto:'tcp', local:'192.168.1.10:57431', remote_ip:'151.101.64.81',  remote_port:443,  state:'ESTABLISHED', country:'United States', country_code:'US', city:'San Jose',  org:'AS54113 Fastly Inc.',            lat:37.34,  lon:-121.89,is_foreign:true,  process:'SmartTV-App',    hostname:'api.smartcast.com',       risk:'MEDIUM', timestamp:now },
      { proto:'tcp', local:'192.168.1.25:60012', remote_ip:'52.94.228.148',  remote_port:443,  state:'ESTABLISHED', country:'Germany',       country_code:'DE', city:'Frankfurt', org:'AS16509 Amazon AWS DE',          lat:50.11,  lon:8.68,   is_foreign:true,  process:'echo-skills',    hostname:'skills.eu.amazon.com',    risk:'LOW',    timestamp:now },
      { proto:'tcp', local:'192.168.1.1:52231',  remote_ip:'91.108.4.42',    remote_port:443,  state:'ESTABLISHED', country:'Netherlands',   country_code:'NL', city:'Amsterdam', org:'AS62041 Telegram Messenger',     lat:52.37,  lon:4.89,   is_foreign:false, process:'router-app',     hostname:'dc1.api.telegram.org',    risk:'LOW',    timestamp:now },
      { proto:'tcp', local:'192.168.1.15:63921', remote_ip:'120.92.108.177', remote_port:1883, state:'ESTABLISHED', country:'China',         country_code:'CN', city:'Shenzhen',  org:'AS45090 Tencent Cloud',          lat:22.54,  lon:114.06, is_foreign:true,  process:'iot-hub-daemon', hostname:'mqtt2.iotcloud.tencentcs.com', risk:'HIGH', timestamp:now },
      { proto:'tcp', local:'192.168.1.20:61200', remote_ip:'18.184.22.91',   remote_port:9000, state:'ESTABLISHED', country:'Germany',       country_code:'DE', city:'Frankfurt', org:'AS16509 Amazon Web Services',   lat:50.11,  lon:8.68,   is_foreign:true,  process:'cam-cloud',      hostname:'eu.homesecurity.ring.com',risk:'MEDIUM', timestamp:now },
      { proto:'udp', local:'192.168.1.1:123',    remote_ip:'37.252.247.174', remote_port:123,  state:'STATELESS',   country:'Netherlands',   country_code:'NL', city:'Amsterdam', org:'AS8455 Atom86 BV',              lat:52.37,  lon:4.89,   is_foreign:false, process:'ntpd',           hostname:'ntp.nl',                  risk:'LOW',    timestamp:now },
    ],
  };
}
