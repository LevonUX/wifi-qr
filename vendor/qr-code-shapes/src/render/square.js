/* Square QR: modules on a plain grid inside a rounded background card.
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

/* ── Square renderer ────────────────────── */
function renderSquare(matrix, fg, bg) {
  var n = matrix.length;
  var m = 10;
  cfg.moduleSize = m;
  var eyeColor = cfg.eyeColor || fg;

  // Frame is always 'none' here - any FRAME_LIBRARY key is handled by
  // renderDesignedFrame() instead (see generate()), so this renderer only
  // ever runs with no ring/band around the QR.
  var q = 4;

  var qrSize = (n + q * 2) * m;
  // Outer shell - extra bg-colored frame around the QR shape so the bg color
  // is visible as padding around the QR (matches the design with rounded bg).
  var shellPad = m * 2;
  var offset   = shellPad;
  var total    = qrSize + 2 * shellPad;
  var bgRx     = m * 2.5;

  var svg = makeSVG(total, bg, bgRx);
  svg.setAttribute('shape-rendering', 'geometricPrecision');

  // ── Content group (shifted by shellPad) ──
  var cg = mk('g');
  cg.setAttribute('transform', 'translate(' + offset + ',' + offset + ')');
  svg.appendChild(cg);

  // Data modules
  if (isPillLike(cfg.pattern)) {
    var maskedMatrix = matrix.map(function(row, r) {
      return row.map(function(v, c) { return isFinderZone(r, c, n) ? false : v; });
    });
    var ps = pillSpec(cfg.pattern);
    var fp = renderPills(maskedMatrix, fg, bg, q * m, q * m, ps.mode, ps.sharp);
    cg.appendChild(fp);
  } else if (cfg.pattern === 'rounded') {
    // Grouped rounded: adjacent dark modules merge into rounded organic shapes
    cg.appendChild(renderGroupedQR(matrix, n, fg, q * m, q * m, m));
  } else {
    var gData = mk('g');
    gData.setAttribute('fill', fg);
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (!matrix[r][c]) continue;
        if (isFinderZone(r, c, n)) continue;
        var mcx = (c + q) * m + m / 2;
        var mcy = (r + q) * m + m / 2;
        var dotR = (cfg.pattern === 'star') ? (seededRand(r, c) < 0.5 ? 4.0 : 2.8) : 4.0;
        drawModule(gData, mcx, mcy, dotR, cfg.pattern);
      }
    }
    cg.appendChild(gData);
  }

  // Finder eyes
  drawFinderEyes(cg, n, q, m, bg, eyeColor);

  // Hint where the QR data centre lives so generate() can place a logo there.
  svg._qrCenter = { x: offset + (q + n / 2) * m, y: offset + (q + n / 2) * m, m: m };
  return svg;
}

export { renderSquare };

