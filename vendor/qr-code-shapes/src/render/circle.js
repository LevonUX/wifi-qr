/* Circular QR: the matrix is drawn inside a disc, with the modules that fall
 * outside the circle culled and the remaining edge filled by a ring of dots.
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

/* ── Circular Premium renderer ──────────── */
function renderCircular(matrix, fg, bg) {
  var n  = matrix.length;
  var m  = 10;  // module size px - matches QR grid exactly
  cfg.moduleSize = m;

  // ── Seeded pseudo-random (deterministic, grid-aligned) ───────
  function rand(ix, iy) {
    var s = Math.sin(ix * 127.1 + iy * 311.7 + cfg.seed) * 43758.5453123;
    return s - Math.floor(s);
  }

  // ── Geometry ─────────────────────────────────────────────────
  var qz      = 4;   // real quiet zone modules (scanner requirement)
  var contPad = 4;   // continuation zone modules beyond QR
  // innerR: content circle radius = QR half-size + qz + contPad
  var innerR  = (n / 2 + qz + contPad) * m;
  // The QR is a square - its corners reach (n/2)·√2 modules from the center,
  // which for long payloads (big n) pokes past the fixed-band circle. Make
  // sure the content circle always clears the QR's half-diagonal + 2 modules.
  var halfDiag = (n / 2) * m * Math.SQRT2;
  if (innerR < halfDiag + m * 2) innerR = halfDiag + m * 2;

  // No ring/band here - any FRAME_LIBRARY key is handled by
  // renderDesignedFrame() instead (see generate()).
  var bandW  = 0;
  var outerR = innerR;
  // Outer shell - bg-colored padding around the circular shape
  var shellPad = m * 2;
  var margin  = 6 + shellPad;
  var total   = Math.ceil(outerR * 2) + margin * 2;
  var cx      = total / 2;
  var cy      = total / 2;

  // QR matrix pixel origin (centered)
  var qrX0 = cx - (n / 2) * m;
  var qrY0 = cy - (n / 2) * m;

  // Continuation dots are excluded from the QR matrix area only.
  // The quiet zone (qz modules) between QR edge and continuation
  // is the bg color - scanner sees it as white space. Continuation
  // starts just outside the QR matrix (no gap needed in code because
  // the bg-colored quiet zone rows simply have no dark QR modules).
  // We exclude 1 extra px so dots don't visually kiss the QR edge.
  var safeX0 = qrX0 - m * 0.5;
  var safeY0 = qrY0 - m * 0.5;
  var safeX1 = qrX0 + n * m + m * 0.5;
  var safeY1 = qrY0 + n * m + m * 0.5;

  // ── SVG root ─────────────────────────────────────────────────
  var svg = mk('svg');
  
  svg.setAttribute('id', 'qr-code');
  svg.setAttribute('viewBox', '0 0 ' + total + ' ' + total);
  svg.setAttribute('shape-rendering', 'geometricPrecision');

  // No clip-path mask: continuation dots are already bounded by the
  // `distC > innerR - m*0.9` cull below, so the circular clip only ever shaved
  // a few px off the outermost dots' edges. Dropping it keeps those dots fully
  // round and removes the leftover clipPath/Vector object from the export.
  // (Ring text is drawn later as per-glyph <text> via appendArcText - no
  //  text-path defs needed either.)

  // ── Background: circular shell matching the shape ─────────────
  var bgCircle = mk('circle');
  bgCircle.setAttribute('cx', cx);
  bgCircle.setAttribute('cy', cy);
  bgCircle.setAttribute('r', outerR + shellPad);
  bgCircle.setAttribute('fill', bg);
  svg.appendChild(bgCircle);
  // Expose the shell so renderDesignedFrame can drop it - when this content is
  // scaled inside a designed frame, the frame supplies its own bg card and this
  // inner shell would otherwise show as a redundant smaller object.
  svg._bgShell = bgCircle;

  // ── CONTINUATION PATTERN ─────────────────────────────────────
  var contG = mk('g');
  contG.setAttribute('fill', fg);

  // Scan far enough to fill the whole content circle with continuation dots -
  // innerR may be wider than the default band when a long payload forces the
  // circle to clear the QR's diagonal (see the halfDiag clamp above).
  var scanPad  = Math.max(qz + contPad, Math.ceil((innerR - (n / 2) * m) / m)) + 1;
  var scanFrom = -scanPad;
  var scanTo   =  n + scanPad;
  var contCells = [];   // collected cells, rendered after the scan

  for (var gi = scanFrom; gi < scanTo; gi++) {
    for (var gj = scanFrom; gj < scanTo; gj++) {

      // Cell center in pixels
      var pcx = qrX0 + (gj + 0.5) * m;
      var pcy = qrY0 + (gi + 0.5) * m;

      // Skip QR matrix area (+ tiny margin)
      if (pcx >= safeX0 && pcx <= safeX1 &&
          pcy >= safeY0 && pcy <= safeY1) continue;

      // Skip outside content circle
      var ddx = pcx - cx, ddy = pcy - cy;
      var distC = Math.sqrt(ddx * ddx + ddy * ddy);
      if (distC > innerR - m * 0.9) continue;  // keep dots away from ring edge

      // t = 0 near QR edge → 1 at circle boundary
      var distFromEdge = Math.max(
        safeX0 - pcx, pcx - safeX1,
        safeY0 - pcy, pcy - safeY1, 0
      );
      var zoneWidth = innerR - (n / 2) * m;
      var t = Math.min(distFromEdge / Math.max(zoneWidth, 1), 1.0);

      // Density: high and uniform like real QR (~55% fill), slight fade only at very edge
      var edgeFade = distC > innerR - m * 3.5 ? Math.max(0, (innerR - m * 0.9 - distC) / (m * 2.6)) : 1.0;
      var noise1 = rand(gj, gi);
      var noise2 = rand(gj + 31, gi + 17) * 0.25;
      var noiseVal = (noise1 + noise2) / 1.25;
      // Checkerboard base mirrors QR timing pattern
      var isEven = (((gi % 2) + (gj % 2) + 4) % 2) === 0;
      var threshold = (isEven ? 0.58 : 0.42) * edgeFade;
      if (noiseVal > threshold) continue;

      // Collect cell - we render it either as a dot/module or as part of a pill
      var cell = { gi: gi, gj: gj, pcx: pcx, pcy: pcy };
      if (!isPillLike(cfg.pattern)) {
        if (cfg.pattern === 'star') {
          cell.dotR = (seededRand(gi, gj) < 0.5) ? 4.0 : 2.8;
        } else {
          cell.dotR = Math.max(4.0 + (rand(gj * 7, gi * 11) - 0.5) * 0.5, 3.2);
        }
      }
      contCells.push(cell);
    }
  }

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

  // ── QR DATA MODULES (full matrix, drawn over continuation) ───
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
        var dotR = (cfg.pattern === 'star') ? (seededRand(row, col) < 0.5 ? 4.0 : 2.8) : 4.0;
        drawModule(qrG, mcx, mcy, dotR, cfg.pattern);
      }
    }
    svg.appendChild(qrG);
  }

  // ── CIRCULAR FINDER EYES ─────────────────────────────────────
  // Use shared drawFinderEyes but with qrX0/qrY0 offset baked in.
  // We create a temporary translated SVG group approach by adjusting
  // the eye coordinates to match the circular canvas offset.
  var circEyeColor = cfg.eyeColor || fg;
  var eR = 3.5 * m;
  var circEyes = [
    { ecx: qrX0 + 3.5 * m,       ecy: qrY0 + 3.5 * m       },
    { ecx: qrX0 + (n - 3.5) * m, ecy: qrY0 + 3.5 * m       },
    { ecx: qrX0 + 3.5 * m,       ecy: qrY0 + (n - 3.5) * m }
  ];

  // Draw
  var eyeG = mk('g');
  eyeG.setAttribute('class', 'qr-eyes');
  circEyes.forEach(function(e) {
    eyeG.appendChild(finderEyeEl(e.ecx, e.ecy, eR, circEyeColor));
  });
  svg.appendChild(eyeG);

  svg._qrCenter = { x: cx, y: cy, m: m };
  // Outer radius the dot cloud actually fills (see the `distC > innerR - m*0.9`
  // cull above). renderDesignedFrame uses this to scale the dots up to nearly
  // meet the frame ring instead of fitting the whole padded artwork.
  svg._dotFillR = innerR - m * 0.9;
  return svg;
}

export { renderCircular };

