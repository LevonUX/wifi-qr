/* WiFi QR generator: form state in, QR card out. Everything stays in the page. */

import { renderQR } from '../vendor/qr-code-shapes/src/index.js';
import { toSVGBlob, toPNGBlob, download } from '../vendor/qr-code-shapes/src/browser.js';
import { EYE_PATH_D } from '../vendor/qr-code-shapes/src/render/primitives.js';

/** Rectangle path with its own radius per corner (tl, tr, br, bl), in cubics. */
function roundedRect(x0, y0, x1, y1, [tl, tr, br, bl]) {
  const k = 0.4477; // 1 - 0.5523: cubic approximation of a quarter circle
  return `M${x0 + tl} ${y0}H${x1 - tr}C${x1 - tr * k} ${y0} ${x1} ${y0 + tr * k} ${x1} ${y0 + tr}`
    + `V${y1 - br}C${x1} ${y1 - br * k} ${x1 - br * k} ${y1} ${x1 - br} ${y1}`
    + `H${x0 + bl}C${x0 + bl * k} ${y1} ${x0} ${y1 - bl * k} ${x0} ${y1 - bl}`
    + `V${y0 + tl}C${x0} ${y0 + tl * k} ${x0 + tl * k} ${y0} ${x0 + tl} ${y0}Z`;
}

// Extra finder-eye designs, in the library's 52-unit eye box: ring from 0 to
// 52 with a 7-unit stroke, centre dot from 15 to 37.
const EXTRA_EYES = {
  leaf: roundedRect(0, 0, 52, 52, [24, 6, 24, 6])
    + roundedRect(7, 7, 45, 45, [17, 2, 17, 2])
    + roundedRect(15, 15, 37, 37, [10, 2, 10, 2]),
};

/**
 * renderQR with a wider choice of finder eyes. The library only knows
 * circle / rounded / square, so for an extra design we lend it the square
 * slot for the length of one synchronous render.
 */
function renderWithEye(eyeShape, options) {
  const extra = EXTRA_EYES[eyeShape];
  if (!extra) return renderQR({ ...options, eyeShape });
  const original = EYE_PATH_D.square;
  EYE_PATH_D.square = extra;
  try {
    return renderQR({ ...options, eyeShape: 'square' });
  } finally {
    EYE_PATH_D.square = original;
  }
}

const $ = (id) => document.getElementById(id);

const form = $('wifi-form');
const els = {
  ssid: $('ssid'),
  security: $('security'),
  password: $('password'),
  passwordField: $('password-field'),
  passwordHint: $('password-hint'),
  togglePassword: $('toggle-password'),
  hidden: $('hidden'),
  customColor: $('custom-color'),
  contrastHint: $('contrast-hint'),
  frame: $('frame'),
  heading: $('heading'),
  showPassword: $('show-password'),
  card: $('card'),
  qr: $('qr'),
  cardTitle: $('card-title'),
  cardPass: $('card-pass'),
  cardPassRow: $('card-pass-row'),
  download: $('download'),
  downloadMenu: $('download-menu'),
  dlPng: $('dl-png'),
  dlSvg: $('dl-svg'),
  print: $('print'),
  status: $('status'),
};

let currentSvg = '';

/** Backslash-escape the characters the Wi-Fi QR format reserves. */
export function escapeWifi(value) {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

/** Build the WIFI: payload understood by iOS and Android cameras. */
export function wifiPayload({ ssid, security, password, hidden }) {
  let text = `WIFI:T:${security};S:${escapeWifi(ssid)};`;
  if (security !== 'nopass') text += `P:${escapeWifi(password)};`;
  text += `H:${hidden ? 'true' : 'false'};;`;
  return text;
}

function selectedColor() {
  const picked = form.querySelector('input[name="color"]:checked').value;
  return picked === 'custom' ? els.customColor.value : picked;
}

function readState() {
  return {
    ssid: els.ssid.value,
    security: els.security.value,
    password: els.password.value,
    hidden: els.hidden.checked,
    shape: form.querySelector('input[name="shape"]:checked').value,
    pattern: form.querySelector('input[name="pattern"]:checked').value,
    eyeShape: form.querySelector('input[name="eye"]:checked').value,
    color: selectedColor(),
    frame: els.frame.checked ? 'thin' : 'none',
    heading: els.heading.value.trim() || 'Scan to connect',
    showPassword: els.showPassword.checked,
    paper: form.querySelector('input[name="paper"]:checked').value,
  };
}

// WCAG relative luminance, used to warn about codes too pale to scan reliably.
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function passwordWarning({ security, password }) {
  if (security === 'nopass') return '';
  if (!password) return 'Leave empty only if the network really has no password.';
  if (security === 'WPA' && (password.length < 8 || password.length > 63)) {
    return 'WPA passwords are usually 8–63 characters – double-check it.';
  }
  if (security === 'WEP' && ![5, 13, 10, 26].includes(password.length)) {
    return 'WEP keys are normally 5 or 13 characters (or 10 / 26 hex digits).';
  }
  return '';
}

function setPaper(paper) {
  document.body.classList.toggle('paper-a4', paper === 'a4');
  document.body.classList.toggle('paper-a5', paper === 'a5');
  let style = document.getElementById('page-size');
  if (!style) {
    style = document.createElement('style');
    style.id = 'page-size';
    document.head.appendChild(style);
  }
  style.textContent = `@page { size: ${paper.toUpperCase()} portrait; margin: 12mm; }`;
}

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle('error', isError);
}

const NS = 'http://www.w3.org/2000/svg';

/**
 * Frame the code in a square viewBox around `box` (viewBox units), with an
 * even quiet zone on every side, on a white square so the margin survives.
 */
function frameBox(svg, box) {
  const size = Math.max(box.r - box.x, box.b - box.y);
  const side = size * 1.12;
  const x = (box.x + box.r) / 2 - side / 2;
  const y = (box.y + box.b) / 2 - side / 2;
  svg.setAttribute('viewBox', [x, y, side, side].map((n) => +n.toFixed(2)).join(' '));
  let rect = svg.querySelector(':scope > rect[data-quiet-zone]');
  if (!rect) {
    rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('data-quiet-zone', '');
    rect.setAttribute('fill', '#ffffff');
    svg.insertBefore(rect, svg.firstChild);
  }
  for (const [k, v] of Object.entries({ x, y, width: side, height: side })) {
    rect.setAttribute(k, +v.toFixed(2));
  }
}

/**
 * First pass, synchronous: crop to the bounding box of the drawn artwork.
 * The hexagon and triangle renderers leave a wide margin inside the canvas,
 * which would make those codes look much smaller than the square one.
 */
function cropToCode(svg) {
  // Measure through a temporary wrapper: a child's own getBBox leaves out its
  // transform, which would put the crop off-centre.
  const wrapper = document.createElementNS(NS, 'g');
  const drawn = [...svg.children].filter((c) => c.id !== 'Background' && c.tagName !== 'defs');
  if (!drawn.length) return;
  drawn[0].before(wrapper);
  wrapper.append(...drawn);
  const b = wrapper.getBBox();
  wrapper.replaceWith(...drawn);
  if (!b.width || !b.height) return;
  // getBBox ignores clip paths, so clipped artwork can spill past the canvas.
  const vb = svg.viewBox.baseVal;
  frameBox(svg, {
    x: Math.max(b.x, vb.x),
    y: Math.max(b.y, vb.y),
    r: Math.min(b.x + b.width, vb.x + vb.width),
    b: Math.min(b.y + b.height, vb.y + vb.height),
  });
}

/**
 * Second pass: rasterize and crop to the pixels actually inked. Geometry
 * alone can't see that a circle's outer ring is clipped or sparse, which left
 * the visible code sitting off-centre on the card.
 */
async function cropToInk(svg) {
  const N = 400;
  const markup = new XMLSerializer().serializeToString(svg);
  const image = new Image();
  image.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(markup)));
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, N, N);
  ctx.drawImage(image, 0, 0, N, N);
  const data = ctx.getImageData(0, 0, N, N).data;
  let l = N, t = N, r = -1, b = -1;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      if (Math.min(data[i], data[i + 1], data[i + 2]) < 230) {
        if (x < l) l = x;
        if (x > r) r = x;
        if (y < t) t = y;
        if (y > b) b = y;
      }
    }
  }
  if (r < 0) return false;
  const vb = svg.viewBox.baseVal;
  const k = vb.width / N;
  frameBox(svg, { x: vb.x + l * k, y: vb.y + t * k, r: vb.x + (r + 1) * k, b: vb.y + (b + 1) * k });
  return true;
}

let renderToken = 0;

const SAMPLE_NETWORK = { ssid: 'Your network', security: 'WPA', password: 'your-password' };

function update() {
  const state = readState();
  const open = state.security === 'nopass';

  els.passwordField.hidden = open;
  els.passwordHint.textContent = passwordWarning(state);
  els.contrastHint.textContent = luminance(state.color) > 0.18
    ? 'This colour is quite light – phones may struggle to read it. A darker shade scans best.'
    : '';

  els.cardTitle.textContent = state.heading;
  els.cardPass.textContent = state.password;
  els.cardPassRow.hidden = open || !state.showPassword || !state.password;
  els.card.style.setProperty('--card-accent', state.color);
  setPaper(state.paper);

  const ready = state.ssid.length > 0;
  [els.download, els.print].forEach((b) => { b.disabled = !ready; });
  if (!ready) closeMenu();

  // Before a network name is typed, show a sample code so the card is never
  // empty and style changes are visible straight away. It can't be saved.
  const payload = ready ? wifiPayload(state) : wifiPayload({ ...SAMPLE_NETWORK, hidden: false });

  try {
    currentSvg = renderWithEye(state.eyeShape, {
      text: payload,
      shape: state.shape,
      pattern: state.pattern,
      frame: state.frame,
      color: state.color,
      background: '#ffffff',
    });
    const node = new DOMParser().parseFromString(currentSvg, 'image/svg+xml').documentElement;
    node.removeAttribute('id');
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', ready
      ? `QR code to join the Wi-Fi network ${state.ssid}`
      : 'Sample QR code – enter your network name to make your own');
    const svg = document.importNode(node, true);
    els.qr.replaceChildren(svg);
    cropToCode(svg);
    // Downloads use the cropped markup, so they match the preview.
    currentSvg = ready ? new XMLSerializer().serializeToString(svg) : '';
    setStatus('');
    const token = ++renderToken;
    cropToInk(svg).then((changed) => {
      if (ready && changed && token === renderToken) currentSvg = new XMLSerializer().serializeToString(svg);
    }).catch(() => {});
  } catch (error) {
    currentSvg = '';
    els.qr.innerHTML = '<div class="card-empty">These details are too long to fit in a QR code</div>';
    [els.download, els.print].forEach((b) => { b.disabled = true; });
    closeMenu();
    setStatus(error.message, true);
  }
}

function fileName(ext) {
  const slug = els.ssid.value.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'network';
  return `wifi-${slug}.${ext}`;
}

form.addEventListener('input', update);
form.addEventListener('change', update);
form.addEventListener('submit', (e) => e.preventDefault());

// Picking a custom colour should also select the custom swatch.
els.customColor.addEventListener('input', () => {
  form.querySelector('input[name="color"][value="custom"]').checked = true;
  update();
});

els.togglePassword.addEventListener('click', () => {
  const show = els.password.type === 'password';
  els.password.type = show ? 'text' : 'password';
  els.togglePassword.setAttribute('aria-pressed', String(show));
  els.togglePassword.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});

function openMenu() {
  els.downloadMenu.hidden = false;
  els.download.setAttribute('aria-expanded', 'true');
  els.downloadMenu.querySelector('button').focus();
}

function closeMenu() {
  els.downloadMenu.hidden = true;
  els.download.setAttribute('aria-expanded', 'false');
}

els.download.addEventListener('click', () => {
  if (els.downloadMenu.hidden) openMenu(); else closeMenu();
});

document.addEventListener('click', (e) => {
  if (!els.downloadMenu.hidden && !e.target.closest('.dropdown')) closeMenu();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !els.downloadMenu.hidden) {
    closeMenu();
    els.download.focus();
  }
});

els.dlSvg.addEventListener('click', () => {
  closeMenu();
  if (!currentSvg) return;
  download(toSVGBlob(currentSvg), fileName('svg'));
  setStatus('SVG saved – it scales to any print size.');
});

els.dlPng.addEventListener('click', async () => {
  closeMenu();
  if (!currentSvg) return;
  try {
    els.download.disabled = true;
    download(await toPNGBlob(currentSvg, { size: 1200 }), fileName('png'));
    setStatus('PNG saved (1200 × 1200 px).');
  } catch (error) {
    setStatus(`Could not create the PNG: ${error.message}`, true);
  } finally {
    els.download.disabled = !currentSvg;
  }
});

els.print.addEventListener('click', () => window.print());

update();
