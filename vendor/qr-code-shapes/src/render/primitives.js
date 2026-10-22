/* Everything the four shape renderers draw with: module shapes, finder eyes,
 * and the two "continuation" renderers that merge adjacent modules into
 * rounded blobs or capsules.
 *
 * Ported from the koloqr.com generator. The geometry is unchanged; only the
 * element construction (mk instead of document.createElementNS) and the
 * settings lookup (cfg instead of a page-global state object) differ.
 */
import { mk } from '../svg.js';
import { cfg } from './context.js';

function isPillLike(p) {
  return p === 'pill-h' || p === 'pill-v' || p === 'bar-h' || p === 'bar-v';
}
function pillSpec(p) {
  return {
    mode:  (p === 'pill-h' || p === 'bar-h') ? 'h' : 'v',
    sharp: p === 'bar-h' || p === 'bar-v'
  };
}

/* ── Helpers ────────────────────────────── */
// Deterministic per-cell pseudo-random in [0, 1) - used for "star" variant
// sizing so the big/small dots are scattered instead of strictly alternating.
function seededRand(ix, iy) {
  var s = Math.sin(ix * 127.1 + iy * 311.7 + cfg.seed) * 43758.5453123;
  return s - Math.floor(s);
}

function isFinderZone(row, col, n) {
  // 8×8 safe area around the 3 finder patterns
  return (row < 8 && col < 8) ||
         (row < 8 && col >= n - 8) ||
         (row >= n - 8 && col < 8);
}

function makeSVG(size, bg, bgRx) {
  var svg = mk('svg');
  
  svg.setAttribute('id', 'qr-code');
    svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
  svg.setAttribute('shape-rendering', 'crispEdges');
  if (bg && bg !== 'transparent') {
    var rect = mk('rect');
    rect.setAttribute('width', size);
    rect.setAttribute('height', size);
    if (bgRx) {
      rect.setAttribute('rx', bgRx);
      rect.setAttribute('ry', bgRx);
    }
        rect.setAttribute('id', 'Background');
rect.setAttribute('fill', bg);
    svg.appendChild(rect);
  }
  return svg;
}

/* ── Module shape helper ────────────────── */
function drawModule(parent, cx, cy, r, shape) {
  cx = typeof cx === 'number' ? cx : parseFloat(cx);
  cy = typeof cy === 'number' ? cy : parseFloat(cy);
  r  = typeof r  === 'number' ? r  : parseFloat(r);

  if (shape === 'dots' || shape === 'star') {
    var el = mk('circle');
    el.setAttribute('cx', cx.toFixed(1));
    el.setAttribute('cy', cy.toFixed(1));
    el.setAttribute('r',  r.toFixed(2));
    parent.appendChild(el);
  } else if (shape === 'small') {
    // Small separate squares with visible gaps between cells
    var side = r * 1.85;
    var el = mk('rect');
    el.setAttribute('x',      (cx - side / 2).toFixed(2));
    el.setAttribute('y',      (cy - side / 2).toFixed(2));
    el.setAttribute('width',  side.toFixed(2));
    el.setAttribute('height', side.toFixed(2));
    el.setAttribute('rx',     '0');
    parent.appendChild(el);
  } else if (shape === 'square') {
    var half = cfg.moduleSize / 2;
    var el = mk('rect');
    el.setAttribute('x',      (cx - half).toFixed(2));
    el.setAttribute('y',      (cy - half).toFixed(2));
    el.setAttribute('width',  cfg.moduleSize);
    el.setAttribute('height', cfg.moduleSize);
    el.setAttribute('rx',     '0');
    parent.appendChild(el);
  } else if (shape === 'stars') {
    // 5-point star (outer/inner radius ratio = 1 : 0.4)
    var R = r * 1.45;
    var Ri = R * 0.4;
    var pts = '';
    for (var i = 0; i < 10; i++) {
      var rad = (i % 2 === 0) ? R : Ri;
      var ang = -Math.PI / 2 + i * Math.PI / 5;
      pts += (i > 0 ? ' ' : '') +
             (cx + Math.cos(ang) * rad).toFixed(2) + ',' +
             (cy + Math.sin(ang) * rad).toFixed(2);
    }
    var el = mk('polygon');
    el.setAttribute('points', pts);
    parent.appendChild(el);
  } else if (shape === 'hearts') {
    var hr = r * 1.3;
    var d = 'M ' + cx.toFixed(2) + ',' + (cy + hr * 0.55).toFixed(2) +
            ' C ' + (cx - hr * 1.4).toFixed(2) + ',' + (cy - hr * 0.25).toFixed(2) +
            ' ' + (cx - hr * 0.45).toFixed(2) + ',' + (cy - hr * 1.05).toFixed(2) +
            ' ' + cx.toFixed(2) + ',' + (cy - hr * 0.3).toFixed(2) +
            ' C ' + (cx + hr * 0.45).toFixed(2) + ',' + (cy - hr * 1.05).toFixed(2) +
            ' ' + (cx + hr * 1.4).toFixed(2) + ',' + (cy - hr * 0.25).toFixed(2) +
            ' ' + cx.toFixed(2) + ',' + (cy + hr * 0.55).toFixed(2) + ' Z';
    var el = mk('path');
    el.setAttribute('d', d);
    parent.appendChild(el);
  } else if (shape === 'triangles') {
    // Equilateral triangle pointing up - vertices at top, bottom-left, bottom-right
    var tx = r * 1.25;
    var ty = r * 0.72;
    var pts = cx.toFixed(2) + ',' + (cy - r * 1.44).toFixed(2) + ' ' +
              (cx + tx).toFixed(2) + ',' + (cy + ty).toFixed(2) + ' ' +
              (cx - tx).toFixed(2) + ',' + (cy + ty).toFixed(2);
    var el = mk('polygon');
    el.setAttribute('points', pts);
    parent.appendChild(el);
  } else if (shape === 'diamonds') {
    // 4-point rhombus
    var dr = r * 1.35;
    var pts = cx.toFixed(2) + ',' + (cy - dr).toFixed(2) + ' ' +
              (cx + dr).toFixed(2) + ',' + cy.toFixed(2) + ' ' +
              cx.toFixed(2) + ',' + (cy + dr).toFixed(2) + ' ' +
              (cx - dr).toFixed(2) + ',' + cy.toFixed(2);
    var el = mk('polygon');
    el.setAttribute('points', pts);
    parent.appendChild(el);
  } else {
    var el = mk('circle');
    el.setAttribute('cx', cx.toFixed(1));
    el.setAttribute('cy', cy.toFixed(1));
    el.setAttribute('r',  r.toFixed(2));
    parent.appendChild(el);
  }
}

/* ── Shared finder eye renderer ─────────── */

// Each finder eye is ONE path (ring + centre dot merged, holes via evenodd) so
// the eye is a single object in exports and recolors with one `fill`. Authored
// in a 52×52 design box (ring outer edge → box edge, centre dot centred); the
// box maps to the eye's 7-module footprint (diameter 2·eR) on canvas.
var EYE_PATH_D = {
  circle:
    'M26 0C40.3594 0 52 11.6406 52 26C52 40.3594 40.3594 52 26 52C11.6406 52 0 40.3594 0 26C0 11.6406 11.6406 0 26 0ZM26 7C15.5066 7 7 15.5066 7 26C7 36.4934 15.5066 45 26 45C36.4934 45 45 36.4934 45 26C45 15.5066 36.4934 7 26 7Z' +
    'M26 15C32.0751 15 37 19.9249 37 26C37 32.0751 32.0751 37 26 37C19.9249 37 15 32.0751 15 26C15 19.9249 19.9249 15 26 15Z',
  rounded:
    'M33 0C43.4934 0 52 8.50659 52 19V33C52 43.4934 43.4934 52 33 52H19C8.50659 52 0 43.4934 0 33V19C0 8.50659 8.50659 0 19 0H33ZM19 7C12.3726 7 7 12.3726 7 19V33C7 39.6274 12.3726 45 19 45H33C39.6274 45 45 39.6274 45 33V19C45 12.3726 39.6274 7 33 7H19Z' +
    'M33 15C35.2091 15 37 16.7909 37 19V33C37 35.2091 35.2091 37 33 37H19C16.7909 37 15 35.2091 15 33V19C15 16.7909 16.7909 15 19 15H33Z',
  square:
    'M45 0C48.866 0 52 3.13401 52 7V45C52 48.866 48.866 52 45 52H7C3.13401 52 1.93283e-07 48.866 0 45V7C0 3.13401 3.13401 1.93277e-07 7 0H45ZM7 45H45V7H7V45Z' +
    'M37 37H15V15H37V37Z'
};

// Apply a uniform scale `s` + translate (tx,ty) to an absolute-coordinate path
// string (M/L/C/H/V/Z - everything the eye designs use). Baking the transform
// into the coordinates (rather than a transform attribute) keeps the eye-pulse
// animation working: it sets a CSS `transform: scale()` on each eye, which
// would otherwise clobber a positioning transform attribute.
function transformPathData(d, s, tx, ty) {
  var numRe = /-?\d*\.?\d+(?:[eE][-+]?\d+)?/g;
  return d.replace(/([MLCHVZ])([^MLCHVZ]*)/gi, function(_, cmd, args) {
    var C = cmd.toUpperCase();
    if (C === 'Z') return cmd;
    var nums = args.match(numRe) || [];
    var out = [];
    if (C === 'H') {
      nums.forEach(function(nx) { out.push(+nx * s + tx); });
    } else if (C === 'V') {
      nums.forEach(function(ny) { out.push(+ny * s + ty); });
    } else {                       // M / L / C - alternating x,y pairs
      for (var i = 0; i < nums.length; i++) {
        out.push(+nums[i] * s + (i % 2 === 0 ? tx : ty));
      }
    }
    return cmd + out.map(function(v) { return Math.round(v * 1000) / 1000; }).join(' ');
  });
}

// Build a single <path> for one finder eye centred at (ecx,ecy) with outer
// radius eR, coloured `eyeColor`, using the current cfg.eyeShape.
function finderEyeEl(ecx, ecy, eR, eyeColor) {
  var shape = (cfg.eyeShape === 'square' || cfg.eyeShape === 'rounded')
    ? cfg.eyeShape : 'circle';
  var s = (eR * 2) / 52;                 // 52-unit design box → 2·eR on canvas
  var p = mk('path');
  p.setAttribute('d', transformPathData(EYE_PATH_D[shape], s, ecx - eR, ecy - eR));
  p.setAttribute('fill-rule', 'evenodd');
  p.setAttribute('fill', eyeColor);
  return p;
}

function drawFinderEyes(svg, n, q, m, bg, eyeColor) {
  var eR = 3.5 * m;
  var eyes = [
    { ecx: (q + 3.5) * m,       ecy: (q + 3.5) * m       },  // top-left
    { ecx: (q + n - 3.5) * m,   ecy: (q + 3.5) * m       },  // top-right
    { ecx: (q + 3.5) * m,       ecy: (q + n - 3.5) * m   }   // bottom-left
  ];

  // Draw eyes
  var eyeG = mk('g');
  eyeG.setAttribute('class', 'qr-eyes');
  eyes.forEach(function(e) {
    eyeG.appendChild(finderEyeEl(e.ecx, e.ecy, eR, eyeColor));
  });
  svg.appendChild(eyeG);
}

/* ── Grouped-rounded renderer ──────────── */
// Each dark module is rendered as a unit square that selectively rounds only
// the corners NOT shared with a dark neighbour - so adjacent modules visually
// merge into a single organic shape with smooth outer corners and clean
// straight internal joints. Boolean-union feel without filter overhead.

// Build an SVG path-segment for a rect with possibly-different per-corner radii.
function buildRoundedRectPath(x, y, w, h, rTL, rTR, rBR, rBL) {
  var p = 'M' + (x + rTL).toFixed(1) + ',' + y.toFixed(1);
  p += ' L' + (x + w - rTR).toFixed(1) + ',' + y.toFixed(1);
  if (rTR > 0) {
    p += ' Q' + (x + w).toFixed(1) + ',' + y.toFixed(1) +
         ' ' + (x + w).toFixed(1) + ',' + (y + rTR).toFixed(1);
  }
  p += ' L' + (x + w).toFixed(1) + ',' + (y + h - rBR).toFixed(1);
  if (rBR > 0) {
    p += ' Q' + (x + w).toFixed(1) + ',' + (y + h).toFixed(1) +
         ' ' + (x + w - rBR).toFixed(1) + ',' + (y + h).toFixed(1);
  }
  p += ' L' + (x + rBL).toFixed(1) + ',' + (y + h).toFixed(1);
  if (rBL > 0) {
    p += ' Q' + x.toFixed(1) + ',' + (y + h).toFixed(1) +
         ' ' + x.toFixed(1) + ',' + (y + h - rBL).toFixed(1);
  }
  p += ' L' + x.toFixed(1) + ',' + (y + rTL).toFixed(1);
  if (rTL > 0) {
    p += ' Q' + x.toFixed(1) + ',' + y.toFixed(1) +
         ' ' + (x + rTL).toFixed(1) + ',' + y.toFixed(1);
  }
  return p + ' Z ';
}

// Concave-corner fillet.  At a concave corner of a group (where two adjacent
// dark neighbours exist but their shared diagonal is empty), we drop a small
// "negative-curve" wedge into that empty diagonal so the group's outline
// reads as a smooth boolean union.  Quadrant identifies which side of the
// corner the empty diagonal sits on: BR / BL / TR / TL.
function buildConcaveFillet(cx, cy, R, quadrant) {
  var p1x, p1y, p2x, p2y;
  switch (quadrant) {
    case 'BR':  // empty cell is to the BOTTOM-RIGHT of corner
      p1x = cx + R; p1y = cy;
      p2x = cx;     p2y = cy + R;
      break;
    case 'BL':  // BOTTOM-LEFT empty
      p1x = cx;     p1y = cy + R;
      p2x = cx - R; p2y = cy;
      break;
    case 'TR':  // TOP-RIGHT empty
      p1x = cx;     p1y = cy - R;
      p2x = cx + R; p2y = cy;
      break;
    case 'TL':  // TOP-LEFT empty
      p1x = cx - R; p1y = cy;
      p2x = cx;     p2y = cy - R;
      break;
  }
  // Path:  corner → first axis (straight) → arc curving back toward corner
  return 'M' + cx.toFixed(1) + ',' + cy.toFixed(1) +
         ' L' + p1x.toFixed(1) + ',' + p1y.toFixed(1) +
         ' A' + R + ',' + R + ' 0 0,0 ' + p2x.toFixed(1) + ',' + p2y.toFixed(1) +
         ' Z ';
}

// Render the dense QR matrix as a grouped path.
// Skips finder zones (drawn separately by drawFinderEyes).
function renderGroupedQR(matrix, n, fg, offsetX, offsetY, m) {
  var R  = m * 0.4;   // corner radius - same "weight" as our dots / pills (r=4)

  function isDark(r, c) {
    if (r < 0 || r >= n || c < 0 || c >= n) return false;
    if (!matrix[r][c]) return false;
    if (isFinderZone(r, c, n)) return false;
    return true;
  }

  // One <path> per cell instead of a single merged path - adjacent cells
  // still visually merge (their geometry abuts with no seams thanks to
  // identical fill), but each cell becomes its own animatable element.
  var group = mk('g');
  group.setAttribute('fill', fg);

  for (var r = 0; r < n; r++) {
    for (var c = 0; c < n; c++) {
      if (!isDark(r, c)) continue;

      var hasTop    = isDark(r - 1, c);
      var hasBottom = isDark(r + 1, c);
      var hasLeft   = isDark(r, c - 1);
      var hasRight  = isDark(r, c + 1);

      var rTL = (!hasTop    && !hasLeft)  ? R : 0;
      var rTR = (!hasTop    && !hasRight) ? R : 0;
      var rBR = (!hasBottom && !hasRight) ? R : 0;
      var rBL = (!hasBottom && !hasLeft)  ? R : 0;

      var x = offsetX + c * m;
      var y = offsetY + r * m;

      var d = buildRoundedRectPath(x, y, m, m, rTL, rTR, rBR, rBL);

      // Concave-corner fillets: each is detected by exactly one cell to avoid
      // double-rendering at the same corner.
      if (hasRight && hasBottom && !isDark(r + 1, c + 1)) {
        d += buildConcaveFillet(x + m, y + m, R, 'BR');
      }
      if (hasLeft && hasBottom && !isDark(r + 1, c - 1)) {
        d += buildConcaveFillet(x, y + m, R, 'BL');
      }
      if (hasRight && hasTop && !isDark(r - 1, c + 1)) {
        d += buildConcaveFillet(x + m, y, R, 'TR');
      }
      if (hasLeft && hasTop && !isDark(r - 1, c - 1)) {
        d += buildConcaveFillet(x, y, R, 'TL');
      }

      var path = mk('path');
      path.setAttribute('d', d);
      group.appendChild(path);
    }
  }
  return group;
}

// Render a sparse list of continuation cells with the same grouped logic.
// Two cells are considered adjacent when their (gi, gj) differ by exactly
// 1 in either axis - same coordinate system used by the continuation grid.
function appendGroupedContinuation(parent, cells, m) {
  if (!cells.length) return;
  var R = m * 0.4;

  var cellMap = {};
  cells.forEach(function(c) {
    cellMap[c.gi + ',' + c.gj] = c;
  });
  function isDark(gi, gj) {
    return cellMap[gi + ',' + gj] !== undefined;
  }

  // One <path> per cell so the QR-change wave can animate each module
  // independently. Adjacent cells visually merge because their geometry
  // abuts seamlessly (identical fill).
  var fill = parent.getAttribute('fill') || '#000';
  cells.forEach(function(c) {
    var gi = c.gi, gj = c.gj;
    var hasTop    = isDark(gi - 1, gj);
    var hasBottom = isDark(gi + 1, gj);
    var hasLeft   = isDark(gi, gj - 1);
    var hasRight  = isDark(gi, gj + 1);

    var rTL = (!hasTop    && !hasLeft)  ? R : 0;
    var rTR = (!hasTop    && !hasRight) ? R : 0;
    var rBR = (!hasBottom && !hasRight) ? R : 0;
    var rBL = (!hasBottom && !hasLeft)  ? R : 0;

    var x = c.pcx - m / 2;
    var y = c.pcy - m / 2;

    var d = buildRoundedRectPath(x, y, m, m, rTL, rTR, rBR, rBL);

    // Concave-corner fillets (same logic as renderGroupedQR)
    if (hasRight && hasBottom && !isDark(gi + 1, gj + 1)) d += buildConcaveFillet(x + m, y + m, R, 'BR');
    if (hasLeft  && hasBottom && !isDark(gi + 1, gj - 1)) d += buildConcaveFillet(x,     y + m, R, 'BL');
    if (hasRight && hasTop    && !isDark(gi - 1, gj + 1)) d += buildConcaveFillet(x + m, y,     R, 'TR');
    if (hasLeft  && hasTop    && !isDark(gi - 1, gj - 1)) d += buildConcaveFillet(x,     y,     R, 'TL');

    var path = mk('path');
    path.setAttribute('d', d);
    path.setAttribute('fill', fill);
    parent.appendChild(path);
  });
}

/* ── Pill renderers (H / V merge) ──── */
// These merge horizontally/vertically adjacent modules into capsule shapes.
// Each "run" of connected modules in the merge direction becomes one pill.

// Render a sparse list of continuation cells using the pill grouping logic.
// Adjacent cells (consecutive `gj` for 'h' or `gi` for 'v') merge into a single
// rounded-rect capsule; isolated cells stay as small circles - same visual
// rule as `renderPills` applies to the QR data.
function appendPillContinuation(parent, cells, mode, m, sharp) {
  if (!cells.length) return;
  var R = m * 0.4;  // pill half-thickness == dot radius (uniform "weight")
  var corner = sharp ? 0 : R;

  // Bucket cells by row (h) or column (v)
  var groups = {};
  cells.forEach(function(c) {
    var key = (mode === 'h') ? c.gi : c.gj;
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  });

  Object.keys(groups).forEach(function(key) {
    var arr = groups[key].sort(function(a, b) {
      return (mode === 'h') ? a.gj - b.gj : a.gi - b.gi;
    });
    var i = 0;
    while (i < arr.length) {
      var runStart = i;
      while (i + 1 < arr.length) {
        var step = (mode === 'h') ? arr[i+1].gj - arr[i].gj : arr[i+1].gi - arr[i].gi;
        if (step !== 1) break;
        i++;
      }
      var first = arr[runStart];
      var last  = arr[i];

      if (i === runStart) {
        // Isolated module: circle for pill mode, square for bar mode
        if (sharp) {
          var sq = mk('rect');
          sq.setAttribute('x', first.pcx - R);
          sq.setAttribute('y', first.pcy - R);
          sq.setAttribute('width',  R * 2);
          sq.setAttribute('height', R * 2);
          parent.appendChild(sq);
        } else {
          var dot = mk('circle');
          dot.setAttribute('cx', first.pcx);
          dot.setAttribute('cy', first.pcy);
          dot.setAttribute('r',  R);
          parent.appendChild(dot);
        }
      } else {
        // Adjacent run → rounded-rect capsule (or sharp rect for bar mode)
        var rect = mk('rect');
        if (mode === 'h') {
          var x0 = first.pcx - m / 2;
          var x1 = last.pcx + m / 2;
          rect.setAttribute('x', x0);
          rect.setAttribute('y', first.pcy - R);
          rect.setAttribute('width',  x1 - x0);
          rect.setAttribute('height', R * 2);
        } else {
          var y0 = first.pcy - m / 2;
          var y1 = last.pcy + m / 2;
          rect.setAttribute('x', first.pcx - R);
          rect.setAttribute('y', y0);
          rect.setAttribute('width',  R * 2);
          rect.setAttribute('height', y1 - y0);
        }
        rect.setAttribute('rx', corner);
        rect.setAttribute('ry', corner);
        parent.appendChild(rect);
      }
      i++;
    }
  });
}

function renderPills(matrix, fg, bg, offsetX, offsetY, mode, sharp) {
  // mode:  'h' = horizontal runs,  'v' = vertical runs
  // sharp: when true, runs become rectangles with sharp corners (bar-h / bar-v)
  var n  = matrix.length;
  var m  = cfg.moduleSize;
  var R  = m * 0.4;       // run half-thickness = dot radius (4 when m = 10)
  var inset = (m - R*2) / 2;  // 1px gap each side so thickness equals 8px
  var corner = sharp ? 0 : R;

  function dark(r, c) {
    if (r < 0 || r >= n || c < 0 || c >= n) return false;
    return !!matrix[r][c];
  }

  // Build capsule path for a run from (r,c0) to (r,c1) horizontally.
  // The pill spans the full module range horizontally, but its height is
  // inset to match the dot diameter - gives a uniform "thickness" feel and
  // a natural gap between vertically-stacked pill rows.
  // Rounded-rect path (corner = 0 for sharp/bar mode, corner = R for pill).
  function roundRectPath(x0, y0, x1, y1) {
    if (corner === 0) {
      return 'M' + x0 + ',' + y0 +
             ' L' + x1 + ',' + y0 +
             ' L' + x1 + ',' + y1 +
             ' L' + x0 + ',' + y1 + ' Z';
    }
    var rx = corner;
    return 'M' + (x0+rx) + ',' + y0 +
           ' L' + (x1-rx) + ',' + y0 +
           ' Q' + x1 + ',' + y0 + ' ' + x1 + ',' + (y0+rx) +
           ' L' + x1 + ',' + (y1-rx) +
           ' Q' + x1 + ',' + y1 + ' ' + (x1-rx) + ',' + y1 +
           ' L' + (x0+rx) + ',' + y1 +
           ' Q' + x0 + ',' + y1 + ' ' + x0 + ',' + (y1-rx) +
           ' L' + x0 + ',' + (y0+rx) +
           ' Q' + x0 + ',' + y0 + ' ' + (x0+rx) + ',' + y0 + ' Z';
  }

  function hPill(r, c0, c1) {
    var x0 = offsetX + c0 * m;
    var x1 = offsetX + (c1 + 1) * m;
    var y0 = offsetY + r * m + inset;
    return roundRectPath(x0, y0, x1, y0 + R * 2);
  }

  // Single isolated module: circle for pill mode, square for bar mode.
  // Same path-string format so we can fold it into the single combined <path>.
  function dotPath(r, c) {
    var cx = offsetX + c * m + m / 2;
    var cy = offsetY + r * m + m / 2;
    if (sharp) {
      return roundRectPath(cx - R, cy - R, cx + R, cy + R);
    }
    var rad = R;
    return 'M' + (cx - rad) + ',' + cy +
           ' a' + rad + ',' + rad + ' 0 1,0 ' + (rad * 2) + ',0' +
           ' a' + rad + ',' + rad + ' 0 1,0 ' + (-rad * 2) + ',0 Z';
  }

  function vPill(r0, r1, c) {
    var x0 = offsetX + c * m + inset;
    var y0 = offsetY + r0 * m;
    var y1 = offsetY + (r1 + 1) * m;
    return roundRectPath(x0, y0, x0 + R * 2, y1);
  }

  // One <path> per pill/dot so the QR-change wave can animate each run
  // independently. Visually identical to a merged path - adjacent paths
  // with the same fill abut without seams.
  var group = mk('g');
  group.setAttribute('fill', fg);

  function addPath(d) {
    var p = mk('path');
    p.setAttribute('d', d);
    group.appendChild(p);
  }

  if (mode === 'h') {
    for (var r = 0; r < n; r++) {
      var c = 0;
      while (c < n) {
        if (!dark(r, c)) { c++; continue; }
        var c0 = c;
        while (c < n && dark(r, c)) c++;
        addPath(c - c0 === 1 ? dotPath(r, c0) : hPill(r, c0, c - 1));
      }
    }
  } else if (mode === 'v') {
    for (var col = 0; col < n; col++) {
      var r = 0;
      while (r < n) {
        if (!dark(r, col)) { r++; continue; }
        var r0 = r;
        while (r < n && dark(r, col)) r++;
        addPath(r - r0 === 1 ? dotPath(r0, col) : vPill(r0, r - 1, col));
      }
    }
  }

  return group;
}

export {
  isPillLike, pillSpec,
  seededRand, isFinderZone, makeSVG,
  drawModule,
  EYE_PATH_D, transformPathData, finderEyeEl, drawFinderEyes,
  buildRoundedRectPath, buildConcaveFillet, renderGroupedQR, appendGroupedContinuation,
  appendPillContinuation, renderPills,
};

