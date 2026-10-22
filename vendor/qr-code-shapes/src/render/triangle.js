/* Triangular QR: the matrix sits low inside a triangle, since that is where
 * the widest part of the shape is.
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

/* ── Triangular renderer ────────────────── */
function renderTriangular(matrix, fg, bg) {
  var n  = matrix.length;
  var m  = 10;
  cfg.moduleSize = m;

  function rand(ix, iy) {
    var s = Math.sin(ix * 127.1 + iy * 311.7 + cfg.seed) * 43758.5453123;
    return s - Math.floor(s);
  }

  // ── Geometry ─────────────────────────────────────────────────
  var qrW = n * m;
  var triBase   = Math.ceil(qrW * 2.6);
  var triHeight = Math.ceil(triBase * Math.sqrt(3) / 2);

  // No ring/band here - any FRAME_LIBRARY key is handled by
  // renderDesignedFrame() instead (see generate()).
  // Outer shell - bg-colored padding around the triangle
  var shellPad   = m * 2;
  var marginX    = m * 0.5 + shellPad;
  var marginYTop = m * 0.5 + shellPad;
  // Extra bottom margin balances the triangle's bottom-heavy visual weight
  // (wide base, narrow apex) by lifting the apex toward the canvas center.
  var marginYBot = marginYTop + triHeight * 0.18;

  var totalW = triBase + marginX * 2;
  var totalH = triHeight + marginYTop + marginYBot;

  // Outer triangle vertices
  var apexX = totalW / 2;
  var apexY = marginYTop;
  var blX   = marginX;
  var blY   = marginYTop + triHeight;
  var brX   = totalW - marginX;
  var brY   = marginYTop + triHeight;

  // QR position: centered horizontally, lifted 2 modules off the base.
  var qrX0 = apexX - qrW / 2;
  var qrY0 = brY - qrW - m * 2;

  var safeX0 = qrX0 - m * 0.5;
  var safeY0 = qrY0 - m * 0.5;
  var safeX1 = qrX0 + qrW + m * 0.5;
  var safeY1 = qrY0 + qrW + m * 0.5;

  // Centroid (used for vertex offsets - works because equilateral)
  var centroidX = (apexX + blX + brX) / 3;
  var centroidY = (apexY + blY + brY) / 3;

  // ── Helpers ──────────────────────────────────────────────────
  function offsetVertex(v, dist) {
    var dx = centroidX - v.x, dy = centroidY - v.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    return { x: v.x + (dx / len) * dist, y: v.y + (dy / len) * dist };
  }
  function unitVec(from, to) {
    var dx = to.x - from.x, dy = to.y - from.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    return { x: dx / len, y: dy / len };
  }
  // Build SVG path for an equilateral triangle with rounded corners (radius r)
  function roundedTrianglePath(A, B, C, r) {
    // Clockwise: A (apex) → C (bottom-right) → B (bottom-left) → A
    var verts = [A, C, B];
    var d = r * Math.sqrt(3);   // inset along each edge for 60° corners
    var arcs = verts.map(function(v, i) {
      var prev = verts[(i + verts.length - 1) % verts.length];
      var next = verts[(i + 1) % verts.length];
      var toPrev = unitVec(v, prev);
      var toNext = unitVec(v, next);
      return {
        p1: { x: v.x + toPrev.x * d, y: v.y + toPrev.y * d },
        p2: { x: v.x + toNext.x * d, y: v.y + toNext.y * d }
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

  // Outer/inner triangle vertices + corner radii
  var outerA = { x: apexX, y: apexY };
  var outerB = { x: blX,   y: blY };
  var outerC = { x: brX,   y: brY };

  var outerCornerR = m * 4.5;

  // ── SVG root ─────────────────────────────────────────────────
  var svg = mk('svg');
  
  svg.setAttribute('id', 'qr-code');
  svg.setAttribute('viewBox', '0 0 ' + totalW + ' ' + totalH);
  svg.setAttribute('shape-rendering', 'geometricPrecision');
  svg.setAttribute('style', 'width:340px;height:340px');

  // ── Boundary geometry for per-dot collision check ───────────
  // Always the outer triangle (the implied dot-shape boundary) - designed
  // frames render via renderDesignedFrame() and scale this content in afterward.
  var boundA = outerA;
  var boundC = outerC;
  var boundB = outerB;
  var boundCornerR = triBase * 0.07;

  // Clockwise traversal in screen coords: A → C → B → A
  var bVerts = [boundA, boundC, boundB];
  var bEdges = bVerts.map(function(v1, i) {
    var v2 = bVerts[(i + 1) % 3];
    var ex = v2.x - v1.x, ey = v2.y - v1.y;
    var elen = Math.sqrt(ex * ex + ey * ey);
    return { v1: v1, nx: -ey / elen, ny: ex / elen };  // inward normal
  });

  var bArcInset = boundCornerR * Math.sqrt(3);   // edge-inset for 60° corners
  var bArcs = bVerts.map(function(v, i) {
    var prev = bVerts[(i + 2) % 3];
    var next = bVerts[(i + 1) % 3];
    var tp = unitVec(v, prev), tn = unitVec(v, next);
    var bisX = (tp.x + tn.x) / 2, bisY = (tp.y + tn.y) / 2;
    var blen = Math.sqrt(bisX * bisX + bisY * bisY);
    bisX /= blen; bisY /= blen;
    return {
      v: v, tpx: tp.x, tpy: tp.y, tnx: tn.x, tny: tn.y,
      cx: v.x + bisX * 2 * boundCornerR,
      cy: v.y + bisY * 2 * boundCornerR
    };
  });

  // Returns true if a circle of radius dotR at (cx, cy) fits fully inside boundary
  function dotFitsBound(cx, cy, dotR) {
    // 1. Check distance from each straight edge (≥ dotR)
    for (var ei = 0; ei < 3; ei++) {
      var e = bEdges[ei];
      var d = (cx - e.v1.x) * e.nx + (cy - e.v1.y) * e.ny;
      if (d < dotR) return false;
    }
    // 2. If in a corner region, must also be inside the arc (dist from arc center ≤ R - dotR)
    for (var ai = 0; ai < 3; ai++) {
      var a = bArcs[ai];
      var dvx = cx - a.v.x, dvy = cy - a.v.y;
      var projP = dvx * a.tpx + dvy * a.tpy;
      var projN = dvx * a.tnx + dvy * a.tny;
      if (projP > 0 && projP < bArcInset && projN > 0 && projN < bArcInset) {
        var ddx = cx - a.cx, ddy = cy - a.cy;
        if (Math.sqrt(ddx * ddx + ddy * ddy) > boundCornerR - dotR) return false;
      }
    }
    return true;
  }

  // Pattern → effective bounding radius (square modules need their half-diagonal).
  // The +safetyPad uniformly insets the boundary. ~1 module of padding pulls
  // the outermost row/column of pattern elements off every side, giving the
  // QR code more visual weight relative to the triangle.
  var safetyPad = m * 1.6;
  function patternBoundR(dotR) {
    var base;
    // 'square' (plain) and 'rounded' (grouped) both fill full module cells,
    // so their bound is the half-diagonal of an m×m square.
    if (cfg.pattern === 'square' ||
        cfg.pattern === 'rounded') base = cfg.moduleSize * Math.SQRT1_2;
    else if (cfg.pattern === 'small') base = dotR * 1.85 * Math.SQRT1_2;
    // Pill cells can extend up to cfg.moduleSize/2 in the merge direction when
    // they form part of a multi-cell run, so use that as the safe bound.
    else if (isPillLike(cfg.pattern)) base = cfg.moduleSize * 0.5;
    else                                  base = dotR;
    return base + safetyPad;
  }

  // ── Background: triangular shell matching the shape ───────────
  var bgPad = m * 2;
  var bgA = offsetVertex(outerA, -bgPad);
  var bgB = offsetVertex(outerB, -bgPad);
  var bgC = offsetVertex(outerC, -bgPad);
  var bgTri = mk('path');
  bgTri.setAttribute('d', roundedTrianglePath(bgA, bgB, bgC, outerCornerR + bgPad));
  bgTri.setAttribute('fill', bg);
  svg.appendChild(bgTri);
  svg._bgShell = bgTri;   // dropped when scaled into a designed frame (see renderCircular)

  // ── Continuation pattern (decorative dots) ────────────────────
  var contG = mk('g');
  contG.setAttribute('fill', fg);

  // Iterate a grid aligned to QR
  var gridStartX = Math.floor((marginX - m * 3) / m) * m + (qrX0 % m);
  var gridEndX   = totalW - marginX + m * 3;
  var gridStartY = Math.floor((marginYTop - m * 3) / m) * m + (qrY0 % m);
  var gridEndY   = totalH - marginYBot + m * 3;

  var contCells = [];

  for (var py = gridStartY; py < gridEndY; py += m) {
    for (var px = gridStartX; px < gridEndX; px += m) {
      var pcx = px + m / 2;
      var pcy = py + m / 2;

      // Skip QR matrix area
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

      // Skip the whole cell if any part would overlap the ring boundary
      if (!dotFitsBound(pcx, pcy, patternBoundR(dotR))) continue;

      contCells.push({ gi: gi, gj: gj, pcx: pcx, pcy: pcy, dotR: dotR });
    }
  }

  // Real extent the dots occupy (continuation reaches furthest out, clamped to
  // the QR matrix too). renderDesignedFrame scales THIS triangle into the frame
  // window so the dot cloud meets the ring without a big gap.
  var triFillMinX = qrX0, triFillMaxX = qrX0 + qrW;
  var triFillMinY = qrY0, triFillMaxY = qrY0 + qrW;
  contCells.forEach(function(c) {
    var r = c.dotR || (m * 0.5);
    if (c.pcx - r < triFillMinX) triFillMinX = c.pcx - r;
    if (c.pcx + r > triFillMaxX) triFillMaxX = c.pcx + r;
    if (c.pcy - r < triFillMinY) triFillMinY = c.pcy - r;
    if (c.pcy + r > triFillMaxY) triFillMaxY = c.pcy + r;
  });

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
    var fp2 = renderPills(maskedMatrix2, fg, bg, qrX0, qrY0, ps.mode, ps.sharp);
    svg.appendChild(fp2);
  } else if (cfg.pattern === 'rounded') {
    svg.appendChild(renderGroupedQR(matrix, n, fg, qrX0, qrY0, m));
  } else {
    var qrG = mk('g');
    qrG.setAttribute('fill', fg);
    for (var row = 0; row < n; row++) {
      for (var col = 0; col < n; col++) {
        if (!matrix[row][col]) continue;
        if (isFinderZone(row, col, n)) continue;
        var mx  = qrX0 + col * m;
        var my  = qrY0 + row * m;
        var mcx = mx + m / 2;
        var mcy = my + m / 2;
        var dotR2 = (cfg.pattern === 'star') ? (seededRand(row, col) < 0.5 ? 4.0 : 2.8) : 4.0;
        drawModule(qrG, mcx, mcy, dotR2, cfg.pattern);
      }
    }
    svg.appendChild(qrG);
  }

  // ── Finder eyes ──────────────────────────────────────────────
  var triEyeColor = cfg.eyeColor || fg;
  var eR = 3.5 * m;
  var triEyes = [
    { ecx: qrX0 + 3.5 * m,       ecy: qrY0 + 3.5 * m       },
    { ecx: qrX0 + (n - 3.5) * m, ecy: qrY0 + 3.5 * m       },
    { ecx: qrX0 + 3.5 * m,       ecy: qrY0 + (n - 3.5) * m }
  ];

  // Draw eyes (same per-shape logic as renderCircular)
  var eyeG = mk('g');
  eyeG.setAttribute('class', 'qr-eyes');
  triEyes.forEach(function(e) {
    eyeG.appendChild(finderEyeEl(e.ecx, e.ecy, eR, triEyeColor));
  });
  svg.appendChild(eyeG);

  svg._qrCenter = { x: qrX0 + (n / 2) * m, y: qrY0 + (n / 2) * m, m: m };
  // Real dot-cloud bbox + true centroid (average of every dot - robust to the
  // corner rounding, unlike the bbox). renderDesignedFrame scales the cloud
  // about this centroid so the perpendicular gap to the frame is uniform.
  var triSumX = 0, triSumY = 0, triCnt = 0;
  contCells.forEach(function(c) { triSumX += c.pcx; triSumY += c.pcy; triCnt++; });
  for (var rr = 0; rr < n; rr++) {
    for (var cc = 0; cc < n; cc++) {
      if (!matrix[rr][cc] || isFinderZone(rr, cc, n)) continue;
      triSumX += qrX0 + cc * m + m / 2; triSumY += qrY0 + rr * m + m / 2; triCnt++;
    }
  }
  svg._triFill = { minX: triFillMinX, maxX: triFillMaxX, minY: triFillMinY, maxY: triFillMaxY };
  svg._triCentroid = triCnt ? { x: triSumX / triCnt, y: triSumY / triCnt } : null;
  // Deterministic dot-boundary triangle (independent of the random dot pattern)
  // - renderDesignedFrame scales THIS into the frame so the gap is consistent
  // across payloads (the dot bbox above wobbles with the random fill).
  svg._triGeom = { apexY: apexY, baseY: brY, centroidX: centroidX, centroidY: centroidY };
  return svg;
}

export { renderTriangular };

