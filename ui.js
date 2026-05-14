/**
 * NETWERKVERKEER FLUISTERAAR — ui.js
 * Handles all visual rendering:
 * - World-map globe with animated signal lines
 * - Country breakdown bars
 * - LAN device list
 * - Mini coordinate map in detail panel
 * - Log system
 */

// ─── COUNTRY FLAG EMOJI ───────────────────────────────────────────────────────

function countryCodeToFlag(code) {
  if (!code || code.length !== 2) return '🌐';
  const offset = 127397;
  return String.fromCodePoint(
    code.toUpperCase().charCodeAt(0) + offset,
    code.toUpperCase().charCodeAt(1) + offset
  );
}

const COUNTRY_ICONS = {
  'CN': '🇨🇳', 'RU': '🇷🇺', 'US': '🇺🇸', 'DE': '🇩🇪',
  'FR': '🇫🇷', 'GB': '🇬🇧', 'NL': '🇳🇱', 'IE': '🇮🇪',
  'SG': '🇸🇬', 'JP': '🇯🇵', 'KR': '🇰🇷', 'IN': '🇮🇳',
  'BR': '🇧🇷', 'CA': '🇨🇦', 'AU': '🇦🇺',
};

function getFlag(code) {
  return COUNTRY_ICONS[code] || countryCodeToFlag(code) || '🌐';
}

// ─── DEVICE ICON GUESSER ──────────────────────────────────────────────────────

function guessDeviceIcon(hostname) {
  hostname = (hostname || '').toLowerCase();
  if (hostname.includes('camera') || hostname.includes('cam')) return '📷';
  if (hostname.includes('tv') || hostname.includes('television')) return '📺';
  if (hostname.includes('thermo') || hostname.includes('nest')) return '🌡️';
  if (hostname.includes('echo') || hostname.includes('alexa')) return '🔊';
  if (hostname.includes('router') || hostname.includes('gateway')) return '📡';
  if (hostname.includes('phone') || hostname.includes('mobile')) return '📱';
  if (hostname.includes('laptop') || hostname.includes('macbook')) return '💻';
  if (hostname.includes('light') || hostname.includes('bulb') || hostname.includes('hue')) return '💡';
  if (hostname.includes('lock') || hostname.includes('door')) return '🔒';
  if (hostname.includes('vacuum') || hostname.includes('roomba')) return '🤖';
  if (hostname.includes('print')) return '🖨️';
  return '📟';
}

// ─── GLOBE VISUALIZER ─────────────────────────────────────────────────────────

let globeAnimFrame = null;
let globeSignals = [];

function initGlobe(connections) {
  const canvas = document.getElementById('globe-canvas');
  if (!canvas) return;

  const container = canvas.parentElement;
  canvas.width  = container.clientWidth  || 272;
  canvas.height = container.clientHeight || 180;

  // Build signals from foreign connections
  globeSignals = connections
    .filter(c => c.is_foreign && c.lat && c.lon)
    .map(c => ({
      lat: c.lat,
      lon: c.lon,
      risk: c.risk,
      country: c.country,
      age: Math.random() * Math.PI * 2, // random phase
      speed: 0.01 + Math.random() * 0.015,
    }));

  if (globeAnimFrame) cancelAnimationFrame(globeAnimFrame);
  drawGlobe(canvas);
}

function latLonToXY(lat, lon, width, height) {
  // Simple equirectangular projection
  const x = (lon + 180) / 360 * width;
  const y = (90 - lat) / 180 * height;
  return { x, y };
}

function drawGlobe(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#060c18');
  bgGrad.addColorStop(1, '#030608');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Grid lines (latitude/longitude)
  ctx.strokeStyle = 'rgba(0,255,157,0.05)';
  ctx.lineWidth = 0.5;

  for (let lat = -90; lat <= 90; lat += 30) {
    const { y } = latLonToXY(lat, 0, W, H);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  for (let lon = -180; lon <= 180; lon += 30) {
    const { x } = latLonToXY(0, lon, W, H);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  // Rough continent outlines (simplified polygons)
  drawContinents(ctx, W, H);

  // Home beacon (Amsterdam ~52.37, 4.89)
  const home = latLonToXY(52.37, 4.89, W, H);
  const t = Date.now() / 1000;

  // Pulsing rings at home
  for (let i = 0; i < 3; i++) {
    const phase = (t * 1.2 + i * 0.8) % 3;
    const radius = phase * 18;
    const alpha  = Math.max(0, 1 - phase / 3) * 0.5;
    ctx.beginPath();
    ctx.arc(home.x, home.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0,255,157,${alpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(home.x, home.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#00ff9d';
  ctx.fill();
  ctx.shadowBlur = 10;
  ctx.shadowColor = '#00ff9d';
  ctx.fill();
  ctx.shadowBlur = 0;

  // Signal lines + remote nodes
  globeSignals.forEach(sig => {
    sig.age += sig.speed;
    const remote = latLonToXY(sig.lat, sig.lon, W, H);
    const progress = (Math.sin(sig.age) + 1) / 2;

    const color = sig.risk === 'HIGH'   ? '#ff3b3b'
                : sig.risk === 'MEDIUM' ? '#ffaa00'
                :                         '#00ff9d';

    // Animated dashed line from home to remote
    const dx = remote.x - home.x;
    const dy = remote.y - home.y;
    const px = home.x + dx * progress;
    const py = home.y + dy * progress;

    // Static faint base line
    ctx.beginPath();
    ctx.moveTo(home.x, home.y);
    ctx.lineTo(remote.x, remote.y);
    ctx.strokeStyle = `${color}18`;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([]);
    ctx.stroke();

    // Animated packet dot
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowBlur = 8;
    ctx.shadowColor = color;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Remote node glow
    const rAlpha = 0.5 + 0.5 * Math.sin(sig.age * 2);
    ctx.beginPath();
    ctx.arc(remote.x, remote.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = rAlpha;
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  globeAnimFrame = requestAnimationFrame(() => drawGlobe(canvas));
}

function drawContinents(ctx, W, H) {
  // Very simplified continent approximations (just for visual context)
  const regions = [
    // Europe
    [[35,0],[60,0],[65,20],[55,30],[45,45],[35,35],[35,0]],
    // Africa
    [[37,-17],[37,50],[10,43],[-34,26],[-35,17],[0,-17],[37,-17]],
    // North America
    [[75,-165],[75,-60],[50,-55],[25,-80],[15,-90],[15,-120],[65,-170],[75,-165]],
    // South America
    [[12,-72],[10,-60],[5,-52],[-55,-65],[-55,-72],[-10,-80],[12,-72]],
    // Asia
    [[35,25],[35,145],[75,145],[75,25],[35,25]],
    // Australia
    [[-10,112],[-10,154],[-45,154],[-45,112],[-10,112]],
  ];

  ctx.strokeStyle = 'rgba(0,255,157,0.12)';
  ctx.fillStyle   = 'rgba(0,255,157,0.03)';
  ctx.lineWidth   = 0.5;

  regions.forEach(poly => {
    ctx.beginPath();
    poly.forEach(([lat, lon], i) => {
      const { x, y } = latLonToXY(lat, lon, W, H);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
}

// ─── COUNTRY BREAKDOWN ────────────────────────────────────────────────────────

function renderCountryList(tally, localCode = 'NL') {
  const el = document.getElementById('country-list');
  if (!el) return;

  const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const maxVal  = entries.length ? entries[0][1] : 1;

  el.innerHTML = '';
  entries.forEach(([country, count]) => {
    const isForeign = country !== 'Netherlands' && !country.includes('Netherlands');
    const pct = Math.round((count / maxVal) * 100);

    // Try to guess country code from name (rough heuristic)
    const codeGuess = guessCountryCode(country);
    const flag = getFlag(codeGuess);

    const item = document.createElement('div');
    item.className = 'country-item';
    item.innerHTML = `
      <span class="country-flag">${flag}</span>
      <span class="country-name">${country}</span>
      <div class="country-bar-track">
        <div class="country-bar-fill ${isForeign ? 'foreign' : ''}" style="width:${pct}%"></div>
      </div>
      <span class="country-count">${count}</span>
    `;
    el.appendChild(item);
  });
}

function guessCountryCode(name) {
  const map = {
    'United States': 'US', 'China': 'CN', 'Russia': 'RU', 'Germany': 'DE',
    'France': 'FR', 'United Kingdom': 'GB', 'Netherlands': 'NL', 'Ireland': 'IE',
    'Singapore': 'SG', 'Japan': 'JP', 'South Korea': 'KR', 'India': 'IN',
    'Brazil': 'BR', 'Canada': 'CA', 'Australia': 'AU', 'Sweden': 'SE',
    'Norway': 'NO', 'Finland': 'FI', 'Spain': 'ES', 'Italy': 'IT',
    'Ukraine': 'UA', 'Poland': 'PL', 'Czechia': 'CZ', 'Switzerland': 'CH',
    'Belgium': 'BE', 'Austria': 'AT', 'Hong Kong': 'HK', 'Taiwan': 'TW',
  };
  return map[name] || '??';
}

// ─── DEVICE LIST ──────────────────────────────────────────────────────────────

function renderDeviceList(devices) {
  const el = document.getElementById('device-list');
  if (!el) return;

  const countEl = document.getElementById('device-count');
  if (countEl) countEl.textContent = `${devices.length} GEVONDEN`;

  if (devices.length === 0) {
    el.innerHTML = `<div style="color:var(--text-dim);font-family:var(--font-mono);font-size:10px;padding:10px;">
      Geen apparaten gevonden. Voer een scan uit.
    </div>`;
    return;
  }

  el.innerHTML = '';
  devices.forEach(dev => {
    const icon = guessDeviceIcon(dev.hostname);
    const item = document.createElement('div');
    item.className = 'device-item';
    item.innerHTML = `
      <span class="device-icon">${icon}</span>
      <div class="device-info">
        <div class="device-hostname">${dev.hostname || dev.ip}</div>
        <div class="device-ip">${dev.ip} · ${dev.mac}</div>
      </div>
      <div class="device-status"></div>
    `;
    el.appendChild(item);
  });
}

// ─── MINI MAP ─────────────────────────────────────────────────────────────────

function renderMiniMap(lat, lon) {
  const canvas = document.getElementById('mini-map');
  if (!canvas) return;
  const container = canvas.parentElement;
  canvas.width  = container.clientWidth  || 248;
  canvas.height = container.clientHeight || 100;

  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#060c18';
  ctx.fillRect(0, 0, W, H);

  // Simple world outline at mini scale
  ctx.strokeStyle = 'rgba(0,255,157,0.2)';
  ctx.fillStyle   = 'rgba(0,255,157,0.05)';
  ctx.lineWidth = 0.5;

  const toXY = (la, lo) => latLonToXY(la, lo, W, H);

  // Draw simplified regions (same as globe)
  const regions = [
    [[35,0],[60,0],[65,20],[55,30],[45,45],[35,35],[35,0]],
    [[37,-17],[37,50],[10,43],[-34,26],[-35,17],[0,-17],[37,-17]],
    [[75,-165],[75,-60],[50,-55],[25,-80],[15,-90],[15,-120],[65,-170],[75,-165]],
    [[12,-72],[10,-60],[5,-52],[-55,-65],[-55,-72],[-10,-80],[12,-72]],
    [[35,25],[35,145],[75,145],[75,25],[35,25]],
    [[-10,112],[-10,154],[-45,154],[-45,112],[-10,112]],
  ];

  regions.forEach(poly => {
    ctx.beginPath();
    poly.forEach(([la, lo], i) => {
      const { x, y } = toXY(la, lo);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });

  // Mark the location
  const pos = toXY(lat, lon);
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,59,59,0.3)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
  ctx.fillStyle = '#ff3b3b';
  ctx.shadowBlur = 10;
  ctx.shadowColor = '#ff3b3b';
  ctx.fill();
  ctx.shadowBlur = 0;

  // Move the absolute pin to correct position
  const pin = document.getElementById('map-pin');
  if (pin) {
    pin.style.left = `${pos.x}px`;
    pin.style.top  = `${pos.y}px`;
    pin.style.transform = 'translate(-50%, -50%)';
  }
}

// ─── LOG SYSTEM ───────────────────────────────────────────────────────────────

const _logQueue = [];
let _logCount = 0;

function addLog(message, level = 'info') {
  _logCount++;
  const el = document.getElementById('log-entries');
  if (!el) return;

  const now = new Date();
  const time = now.toTimeString().slice(0, 8);

  const entry = document.createElement('div');
  entry.className = `log-entry ${level}`;
  entry.innerHTML = `<span class="log-time">[${time}]</span><span class="log-msg">${message}</span>`;

  el.prepend(entry);

  // Keep only last 80 entries
  while (el.children.length > 80) {
    el.removeChild(el.lastChild);
  }
}

function clearLog() {
  const el = document.getElementById('log-entries');
  if (el) el.innerHTML = '';
  addLog('>> Log gewist door gebruiker', 'info');
}

// Export for script.js
window.UI = {
  initGlobe,
  renderCountryList,
  renderDeviceList,
  renderMiniMap,
  addLog,
  clearLog,
  getFlag,
  guessCountryCode,
};
