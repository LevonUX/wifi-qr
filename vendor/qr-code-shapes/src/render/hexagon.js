/* Hexagonal QR: the matrix is fitted to a flat-top hexagon window.
 *
 * Ported from the koloqr.com generator; geometry unchanged.
 */
import { mk } from '../svg.js';
import { cfg } from './context.js';
import {
  makeSVG, seededRand, isFinderZone, drawModule, drawFinderEyes, finderEyeEl,
  renderGroupedQR, appendGroupedContinuation, appendPillContinuation, renderPills,
  isPillLike, pillSpec,
} from './primitives.js';

/* ── Hexagonal renderer ─────────────────── */
function renderHexagonal(matrix, fg, bg) {
  var n  = matrix.length;
  var m  = 10;
  cfg.moduleSize = m;

  function rand(ix, iy) {
    var s = Math.sin(ix * 127.1 + iy * 311.7 + cfg.seed) * 43758.5453123;
    return s - Math.floor(s);
  }

  // ── Geometry ─────────────────────────────────────────────────
  // Elongated flat-top hexagon.  These are *geometric* band widths between
  // the QR square and the hex extents.  The number of dot rows actually
  // visible is smaller because the boundary safetyPad (~1.6m) trims the
  // band from the outside and the slant edges taper to zero near the QR
  // corners.  Empirically these values give ~8 visible rows on the sides
  // and ~6 visible rows on the top/bottom - matching the requested look.
  var qrW       = n * m;
  // Bands scale with the matrix so the hexagon keeps the same aspect ratio
  // (hexW:hexH = 47:39) for any payload length - fixed-module bands would
  // make a big-n hexagon progressively more square/stretched.
  var hexScale  = n / 25;
  var sideBand  = 11   * hexScale; // modules between QR side and hex side vertex
  var topBand   = 8.45 * hexScale; // modules between QR and top/bottom edge
  // (hexW:hexH ≈ 1.12, matching the designed hex frame's window so the QR fills
  //  it edge-to-edge when scaled in by renderDesignedFrame.)
  var hexW      = qrW + 2 * sideBand * m;
  var hexH      = qrW + 2 * topBand  * m;

  // Safety net: if the QR corners still poke past the hexagon's slanted
  // edges, grow both bands until every corner clears them by ≥ 2.5 modules.
  (function ensureHexClearance() {
    var need = m * 2.5;
    for (var guard = 0; guard < 60; guard++) {
      // Slant edge nearest a QR corner: from top-right corner vertex
      // (hexW/4, -hexH/2) to right side vertex (hexW/2, 0), relative center.
      var p1x = hexW / 4,  p1y = -hexH / 2;
      var p2x = hexW / 2,  p2y = 0;
      var ex = p2x - p1x,  ey = p2y - p1y;
      var elen = Math.sqrt(ex * ex + ey * ey);
      // Inward normal of the edge (points toward the center).
      var nx = -ey / elen, ny = ex / elen;
      if (nx * (0 - p1x) + ny * (0 - p1y) < 0) { nx = -nx; ny = -ny; }
      // QR top-right corner relative to center.
      var cxq = qrW / 2, cyq = -qrW / 2;
      var dist = nx * (cxq - p1x) + ny * (cyq - p1y);
      if (dist >= need) break;
      sideBand += 1;
      topBand  += 1;
      hexW = qrW + 2 * sideBand * m;
      hexH = qrW + 2 * topBand  * m;
    }
  })();

  // No ring/band here - any FRAME_LIBRARY key is handled by
  // renderDesignedFrame() instead (see generate()).
  var shellPad = m * 2;
  var margin  = m * 0.5 + shellPad;

  var totalW = hexW + margin * 2;
  var totalH = hexH + margin * 2;
  var cx = totalW / 2;
  var cy = totalH / 2;

  // 6 vertices of outer hexagon, clockwise from top-right.  Corner verts at
  // ±hexW/4 horizontally; side verts at ±hexW/2.
  var outerVerts = [
    { x: cx + hexW / 4, y: cy - hexH / 2 },  // top-right
    { x: cx + hexW / 2, y: cy             },  // right
    { x: cx + hexW / 4, y: cy + hexH / 2 },  // bottom-right
    { x: cx - hexW / 4, y: cy + hexH / 2 },  // bottom-left
    { x: cx - hexW / 2, y: cy             },  // left
    { x: cx - hexW / 4, y: cy - hexH / 2 }   // top-left
  ];

  // QR centered inside the hex
  var qrX0 = cx - qrW / 2;
  var qrY0 = cy - qrW / 2;
  var safeX0 = qrX0 - m * 0.5;
  var safeY0 = qrY0 - m * 0.5;
  var safeX1 = qrX0 + qrW + m * 0.5;
  var safeY1 = qrY0 + qrW + m * 0.5;

  function unitVec(from, to) {
    var dx = to.x - from.x, dy = to.y - from.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    return { x: dx / len, y: dy / len };
  }

  // For each vertex compute the interior angle and the bisector pointing
  // into the polygon.  Used by roundedHexPath, the inner-hex offsetter, and
  // the boundary-check arc lookup so they all share the same geometry.
  function vertexMeta(verts) {
    return verts.map(function(v, i) {
      var prev = verts[(i + verts.length - 1) % verts.length];
      var next = verts[(i + 1) % verts.length];
      var toPrev = unitVec(v, prev);
      var toNext = unitVec(v, next);
      var cosA = Math.max(-1, Math.min(1,
        toPrev.x * toNext.x + toPrev.y * toNext.y));
      var halfA = Math.acos(cosA) / 2;
      var bisX = (toPrev.x + toNext.x) / 2;
      var bisY = (toPrev.y + toNext.y) / 2;
      var blen = Math.sqrt(bisX * bisX + bisY * bisY) || 1;
      bisX /= blen; bisY /= blen;
      return { v: v, toPrev: toPrev, toNext: toNext, halfA: halfA, bisX: bisX, bisY: bisY };
    });
  }

  // Build SVG path for the hex with rounded corners using per-vertex insets
  // (cot(angle/2) · r) - works for non-regular hexes where each vertex has
  // its own interior angle.
  function roundedHexPath(verts, r) {
    var meta = vertexMeta(verts);
    var arcs = meta.map(function(M) {
      var inset = r / Math.tan(M.halfA);
      return {
        p1: { x: M.v.x + M.toPrev.x * inset, y: M.v.y + M.toPrev.y * inset },
        p2: { x: M.v.x + M.toNext.x * inset, y: M.v.y + M.toNext.y * inset }
      };
    });
    var p = 'M ' + arcs[0].p1.x.toFixed(2) + ',' + arcs[0].p1.y.toFixed(2);
    for (var j = 0; j < verts.length; j++) {
      var a = arcs[j];
      p += ' A ' + r + ',' + r + ' 0 0 1 ' + a.p2.x.toFixed(2) + ',' + a.p2.y.toFixed(2);
      var na = arcs[(j + 1) % verts.length];
      p += ' L ' + na.p1.x.toFixed(2) + ',' + na.p1.y.toFixed(2);
    }
    return p + ' Z';
  }

  var outerCornerR = m * 4.5;

  // ── SVG root ────────────────────────────────────────────────
  var svg = mk('svg');
  
  svg.setAttribute('id', 'qr-code');
  svg.setAttribute('viewBox', '0 0 ' + totalW + ' ' + totalH);
  svg.setAttribute('shape-rendering', 'geometricPrecision');
  svg.setAttribute('style', 'width:340px;height:340px');

  // ── Background: hexagonal shell matching the shape ────────────
  var bgPad = m * 2;
  var bgVerts = outerVerts.map(function(v) {
    var dx = v.x - cx, dy = v.y - cy;
    var len = Math.sqrt(dx * dx + dy * dy);
    var s = (len + bgPad) / len;
    return { x: cx + dx * s, y: cy + dy * s };
  });
  var bgHex = mk('path');
  bgHex.setAttribute('d', roundedHexPath(bgVerts, outerCornerR + bgPad));
  bgHex.setAttribute('fill', bg);
  svg.appendChild(bgHex);
  svg._bgShell = bgHex;   // dropped when scaled into a designed frame (see renderCircular)

  // ── Boundary geometry for per-dot collision check ───────────
  var boundVerts = outerVerts;
  var boundCornerR = outerCornerR;
  var boundMeta = vertexMeta(boundVerts);
  var bEdges = boundVerts.map(function(v1, i) {
    var v2 = boundVerts[(i + 1) % boundVerts.length];
    var ex = v2.x - v1.x, ey = v2.y - v1.y;
    var elen = Math.sqrt(ex * ex + ey * ey);
    return { v1: v1, nx: -ey / elen, ny: ex / elen };
  });
  // Per-vertex arc data - each vertex has its own inset (along edge) and
  // arc-centre distance because the elongated hex angles aren't all equal.
  var bArcs = boundMeta.map(function(M) {
    var inset = boundCornerR / Math.tan(M.halfA);
    var arcCenterDist = boundCornerR / Math.sin(M.halfA);
    return {
      v: M.v, tpx: M.toPrev.x, tpy: M.toPrev.y, tnx: M.toNext.x, tny: M.toNext.y,
      inset: inset,
      cx: M.v.x + M.bisX * arcCenterDist,
      cy: M.v.y + M.bisY * arcCenterDist
    };
  });

  function dotFitsBound(dx, dy, dotR) {
    for (var ei = 0; ei < 6; ei++) {
      var e = bEdges[ei];
      var d = (dx - e.v1.x) * e.nx + (dy - e.v1.y) * e.ny;
      if (d < dotR) return false;
    }
    for (var ai = 0; ai < 6; ai++) {
      var a = bArcs[ai];
      var dvx = dx - a.v.x, dvy = dy - a.v.y;
      var projP = dvx * a.tpx + dvy * a.tpy;
      var projN = dvx * a.tnx + dvy * a.tny;
      if (projP > 0 && projP < a.inset && projN > 0 && projN < a.inset) {
        var ddx = dx - a.cx, ddy = dy - a.cy;
        if (Math.sqrt(ddx * ddx + ddy * ddy) > boundCornerR - dotR) return false;
      }
    }
    return true;
  }

  var safetyPad = m * 1.6;
  function patternBoundR(dotR) {
    var base;
    if (cfg.pattern === 'square' ||
        cfg.pattern === 'rounded') base = cfg.moduleSize * Math.SQRT1_2;
    else if (cfg.pattern === 'small') base = dotR * 1.85 * Math.SQRT1_2;
    else if (isPillLike(cfg.pattern)) base = cfg.moduleSize * 0.5;
    else                                  base = dotR;
    return base + safetyPad;
  }

  // ── Continuation pattern ──────────────────────────────────────
  var contG = mk('g');
  contG.setAttribute('fill', fg);
  var contCells = [];

  var gridStartX = Math.floor((margin - m * 3) / m) * m + (qrX0 % m);
  var gridEndX   = totalW - margin + m * 3;
  var gridStartY = Math.floor((margin - m * 3) / m) * m + (qrY0 % m);
  var gridEndY   = totalH - margin + m * 3;

  for (var py = gridStartY; py < gridEndY; py += m) {
    for (var px = gridStartX; px < gridEndX; px += m) {
      var pcx = px + m / 2;
      var pcy = py + m / 2;
      if (pcx >= safeX0 && pcx <= safeX1 && pcy >= safeY0 && pcy <= safeY1) continue;

      var gi = Math.round(py / m);
      var gj = Math.round(px / m);
      var noise1 = rand(gj, gi);
      var noise2 = rand(gj + 31, gi + 17) * 0.25;
      var noiseVal = (noise1 + noise2) / 1.25;

      var isEven = (((gi % 2) + (gj % 2) + 4) % 2) === 0;
      var threshold = isEven ? 0.58 : 0.42;
      if (noiseVal > threshold) continue;

      var dotR;
      if (cfg.pattern === 'star') {
        dotR = (seededRand(gi, gj) < 0.5) ? 4.0 : 2.8;
      } else {
        dotR = 4.0 + (rand(gj * 7, gi * 11) - 0.5) * 0.5;
        dotR = Math.max(dotR, 3.2);
      }

      if (!dotFitsBound(pcx, pcy, patternBoundR(dotR))) continue;
      contCells.push({ gi: gi, gj: gj, pcx: pcx, pcy: pcy, dotR: dotR });
    }
  }

  // Actual extent the dots occupy (continuation reaches furthest out, but clamp
  // in the QR matrix too). renderDesignedFrame scales THIS to the frame window
  // so the dot cloud meets the ring - using the bare hex vertices would leave a
  // safetyPad-sized gap on every edge.
  var fillMinX = qrX0, fillMaxX = qrX0 + n * m;
  var fillMinY = qrY0, fillMaxY = qrY0 + n * m;
  contCells.forEach(function(c) {
    var r = c.dotR || (m * 0.5);
    if (c.pcx - r < fillMinX) fillMinX = c.pcx - r;
    if (c.pcx + r > fillMaxX) fillMaxX = c.pcx + r;
    if (c.pcy - r < fillMinY) fillMinY = c.pcy - r;
    if (c.pcy + r > fillMaxY) fillMaxY = c.pcy + r;
  });
  var dotHalfW = Math.max(cx - fillMinX, fillMaxX - cx);
  var dotHalfH = Math.max(cy - fillMinY, fillMaxY - cy);

  if (isPillLike(cfg.pattern)) {
    var ps = pillSpec(cfg.pattern);
    appendPillContinuation(contG, contCells, ps.mode, m, ps.sharp);
  } else if (cfg.pattern === 'rounded') {
    appendGroupedContinuation(contG, contCells, m);
  } else {
    contCells.forEach(function(c) {
      drawModule(contG, c.pcx, c.pcy, c.dotR, cfg.pattern);
    });
  }
  svg.appendChild(contG);

  // ── QR data ──────────────────────────────────────────────────
  if (isPillLike(cfg.pattern)) {
    var maskedMatrix2 = matrix.map(function(row, r) {
      return row.map(function(v, c) { return isFinderZone(r, c, n) ? false : v; });
    });
    var ps = pillSpec(cfg.pattern);
    svg.appendChild(renderPills(maskedMatrix2, fg, bg, qrX0, qrY0, ps.mode, ps.sharp));
  } else if (cfg.pattern === 'rounded') {
    svg.appendChild(renderGroupedQR(matrix, n, fg, qrX0, qrY0, m));
  } else {
    var qrG = mk('g');
    qrG.setAttribute('fill', fg);
    for (var row = 0; row < n; row++) {
      for (var col = 0; col < n; col++) {
        if (!matrix[row][col]) continue;
        if (isFinderZone(row, col, n)) continue;
        var mcx = qrX0 + col * m + m / 2;
        var mcy = qrY0 + row * m + m / 2;
        var dotR2 = (cfg.pattern === 'star') ? (seededRand(row, col) < 0.5 ? 4.0 : 2.8) : 4.0;
        drawModule(qrG, mcx, mcy, dotR2, cfg.pattern);
      }
    }
    svg.appendChild(qrG);
  }

  // ── Finder eyes ──────────────────────────────────────────────
  var hexEyeColor = cfg.eyeColor || fg;
  var eR = 3.5 * m;
  var eyes = [
    { ecx: qrX0 + 3.5 * m,       ecy: qrY0 + 3.5 * m       },
    { ecx: qrX0 + (n - 3.5) * m, ecy: qrY0 + 3.5 * m       },
    { ecx: qrX0 + 3.5 * m,       ecy: qrY0 + (n - 3.5) * m }
  ];

  var eyeG = mk('g');
  eyeG.setAttribute('class', 'qr-eyes');
  eyes.forEach(function(e) {
    eyeG.appendChild(finderEyeEl(e.ecx, e.ecy, eR, hexEyeColor));
  });
  svg.appendChild(eyeG);

  svg._qrCenter = { x: cx, y: cy, m: m };
  // Real dot-cloud extent (not the bare hex vertices) - renderDesignedFrame
  // scales this to the frame's inner window so the dots meet the ring.
  svg._hexFill = { halfW: dotHalfW, halfH: dotHalfH };
  return svg;
}

export { renderHexagonal };

