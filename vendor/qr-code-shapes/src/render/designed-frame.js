/* Draws a QR inside one of the designed frames.
 *
 * The shape renderers each produce a bare code; this scales that artwork into
 * the frame's window and paints the frame around it. Every frame is authored
 * in a 420x420 box, centred on a 440x440 background card.
 *
 * Ported from the koloqr.com generator; geometry unchanged.
 */
import { mk } from '../svg.js';
import { cfg } from './context.js';
import {
  seededRand, isFinderZone, drawModule, drawFinderEyes,
  renderGroupedQR, renderPills, isPillLike, pillSpec,
} from './primitives.js';
import {
  DESIGN_BOX, DESIGN_QR, DESIGN_OFF, CARD_BOX, CARD_PAD,
  appendBgCard, FRAME_LIBRARY, FRAMELESS_SPECS,
} from '../frames.js';
import { renderCircular } from './circle.js';
import { renderTriangular } from './triangle.js';
import { renderHexagonal } from './hexagon.js';

function renderDesignedFrame(matrix, fg, bg, frameKey) {
  var n = matrix.length;
  var m = 10;                         // keep module size fixed so the shared
  cfg.moduleSize = m;                    // dot/eye helpers use their tuned radii
  var q = 2;                          // quiet-zone modules (live in the margin)
  var eyeColor = cfg.eyeColor || fg;
  var spec = FRAME_LIBRARY[frameKey] || FRAMELESS_SPECS[frameKey];

  // Logo anchor - defaults to the box center, but each content branch
  // overrides it with the QR data center mapped through that content's
  // transform (matters for the triangle, whose data sits low, near the base).
  var svg, logoModuleSize, logoCx = DESIGN_BOX / 2, logoCy = DESIGN_BOX / 2;
  // Where the frame paths/strokes/labels get appended. Defaults to the svg
  // root; the square branch points it at a translated group so the whole
  // 420 artwork is centered inside the 440 background card.
  var contentRoot = null;

  if (spec && spec.content === 'circle') {
    // ── Circular content: render the round QR (dots radiating to a circle)
    //    with no ring of its own, then scale its whole artwork into the 300
    //    window, centered inside the 440 circular bg card.
    var content = renderCircular(matrix, fg, bg);
    // The frame supplies its own bg card (appendBgCard); drop the content's
    // own background shell so it doesn't show as a redundant smaller object.
    if (content._bgShell && content._bgShell.parentNode) content._bgShell.remove();

    svg = mk('svg');
    
  svg.setAttribute('id', 'qr-code');
        svg.setAttribute('viewBox', '0 0 ' + CARD_BOX + ' ' + CARD_BOX);
    svg.setAttribute('shape-rendering', 'geometricPrecision');
    appendBgCard(svg, spec.shape, bg);
    contentRoot = mk('g');
    contentRoot.setAttribute('id', 'QR-code');
    contentRoot.setAttribute('transform', 'translate(' + CARD_PAD + ',' + CARD_PAD + ')');
    svg.appendChild(contentRoot);

    var cvb = (content.getAttribute('viewBox') || '').trim().split(/\s+/).map(Number);
    var cw = cvb[2] || 1, ch = cvb[3] || 1;

    // Scale the *dot cloud* (not the whole padded viewBox) to nearly meet the
    // frame ring. Fitting the full artwork into DESIGN_QR left a big white gap,
    // because the content carries its own shell padding + quiet/continuation
    // zones around the dots.
    var dotFillR  = content._dotFillR || (Math.max(cw, ch) / 2);
    // Where the frame's QR window opens: `innerR` (filled-path frames) or, for
    // legacy stroked rings, the inner edge of the stroke.
    var ringSpec  = (spec.strokes && spec.strokes[0]) || null;
    var ringInner = spec.innerR
      ? spec.innerR
      : (ringSpec && ringSpec.el === 'circle')
        ? ringSpec.r - (ringSpec.strokeWidth || 0) / 2
        : DESIGN_QR / 2;
    var targetR = ringInner - 5;           // small breathing gap inside the ring
    var cs = targetR / dotFillR;
    // Centre the content circle on the frame centre.
    var ctx = DESIGN_BOX / 2 - (cw / 2) * cs;
    var cty = DESIGN_BOX / 2 - (ch / 2) * cs;
    var cg = mk('g');
    cg.setAttribute('id', 'Code');
    cg.setAttribute('transform', 'translate(' + ctx.toFixed(3) + ',' + cty.toFixed(3) + ') scale(' + cs.toFixed(5) + ')');
    while (content.firstChild) cg.appendChild(content.firstChild);
    contentRoot.appendChild(cg);

    // renderCircular fixes its module size at 10; on-canvas it's 10·cs.
    logoModuleSize = (content._qrCenter ? content._qrCenter.m : m) * cs;
    if (content._qrCenter) {
      logoCx = CARD_PAD + ctx + cs * content._qrCenter.x;
      logoCy = CARD_PAD + cty + cs * content._qrCenter.y;
    }
  } else if (spec && spec.content === 'hex') {
    // ── Hexagonal content: render the hex QR (dots radiating to a hexagon) with
    //    no ring of its own, then scale it so the hex outline meets the frame's
    //    inner window. Corners stay transparent (no full bg rect).
    var hcontent = renderHexagonal(matrix, fg, bg);
    if (hcontent._bgShell && hcontent._bgShell.parentNode) hcontent._bgShell.remove();

    svg = mk('svg');
    
  svg.setAttribute('id', 'qr-code');
        svg.setAttribute('viewBox', '0 0 ' + CARD_BOX + ' ' + CARD_BOX);
    svg.setAttribute('shape-rendering', 'geometricPrecision');
    appendBgCard(svg, spec.shape, bg);
    contentRoot = mk('g');
    contentRoot.setAttribute('id', 'QR-code');
    contentRoot.setAttribute('transform', 'translate(' + CARD_PAD + ',' + CARD_PAD + ')');
    svg.appendChild(contentRoot);

    var hvb = (hcontent.getAttribute('viewBox') || '').trim().split(/\s+/).map(Number);
    var hw = hvb[2] || 1, hh = hvb[3] || 1;
    var hfill = hcontent._hexFill || { halfW: hw / 2, halfH: hh / 2 };

    // Fit the hex outline just inside the frame window (uniform scale so the
    // dots / modules stay square). min() guards against overflow on either axis.
    // hgap = total breathing room across an axis (≈9px gap on each side).
    var hgap = 18;
    var hTargetW = (spec.innerW || DESIGN_QR) - hgap;
    var hTargetH = (spec.innerH || DESIGN_QR) - hgap;
    var hcs = Math.min(hTargetW / (hfill.halfW * 2), hTargetH / (hfill.halfH * 2));
    var hcx = DESIGN_BOX / 2, hcy = (spec.cy || DESIGN_BOX / 2);
    var htx = hcx - (hw / 2) * hcs;
    var hty = hcy - (hh / 2) * hcs;
    var hg = mk('g');
    hg.setAttribute('id', 'Code');
    hg.setAttribute('transform', 'translate(' + htx.toFixed(3) + ',' + hty.toFixed(3) + ') scale(' + hcs.toFixed(5) + ')');
    while (hcontent.firstChild) hg.appendChild(hcontent.firstChild);
    contentRoot.appendChild(hg);

    logoModuleSize = (hcontent._qrCenter ? hcontent._qrCenter.m : m) * hcs;
    if (hcontent._qrCenter) {
      logoCx = CARD_PAD + htx + hcs * hcontent._qrCenter.x;
      logoCy = CARD_PAD + hty + hcs * hcontent._qrCenter.y;
    }
  } else if (spec && spec.content === 'tri') {
    // ── Triangular content: render the triangle QR (dots radiating to a
    //    triangle) with no ring, then map its dot-cloud triangle onto the
    //    frame's target triangle (triPts) so the perpendicular gap is uniform
    //    on all three edges. A plain bbox fit leaves the slants tighter than
    //    the base (width fills, height has slack), so we map the 3 corners.
    var tcontent = renderTriangular(matrix, fg, bg);
    if (tcontent._bgShell && tcontent._bgShell.parentNode) tcontent._bgShell.remove();

    svg = mk('svg');
    
  svg.setAttribute('id', 'qr-code');
        svg.setAttribute('viewBox', '0 0 ' + CARD_BOX + ' ' + CARD_BOX);
    svg.setAttribute('shape-rendering', 'geometricPrecision');
    appendBgCard(svg, spec.shape, bg);
    contentRoot = mk('g');
    contentRoot.setAttribute('id', 'QR-code');
    contentRoot.setAttribute('transform', 'translate(' + CARD_PAD + ',' + CARD_PAD + ')');
    svg.appendChild(contentRoot);

    var tvb = (tcontent.getAttribute('viewBox') || '').trim().split(/\s+/).map(Number);
    var geom = tcontent._triGeom || { apexY: 0, baseY: tvb[3] || 1, centroidX: (tvb[2] || 1) / 2, centroidY: (tvb[3] || 1) / 2 };
    var tgt = spec.triTarget || { h: 300, cx: DESIGN_BOX / 2, cy: DESIGN_BOX / 2 };
    // Scale the deterministic dot-boundary triangle onto the frame's inner
    // triangle, aligning centroids. The dots sit a fixed margin inside that
    // boundary, so the gap scales with the QR (small for dense, larger for
    // sparse) and stays even on all three edges.
    var tcs = tgt.h / Math.max(1, geom.baseY - geom.apexY);
    var ttx = tgt.cx - tcs * geom.centroidX;
    var tty = tgt.cy - tcs * geom.centroidY;
    var tg = mk('g');
    tg.setAttribute('id', 'Code');
    tg.setAttribute('transform', 'translate(' + ttx.toFixed(3) + ',' + tty.toFixed(3) + ') scale(' + tcs.toFixed(5) + ')');
    while (tcontent.firstChild) tg.appendChild(tcontent.firstChild);
    contentRoot.appendChild(tg);

    logoModuleSize = (tcontent._qrCenter ? tcontent._qrCenter.m : m) * tcs;
    if (tcontent._qrCenter) {
      logoCx = CARD_PAD + ttx + tcs * tcontent._qrCenter.x;
      logoCy = CARD_PAD + tty + tcs * tcontent._qrCenter.y;
    }
  } else {
    // ── Square content (default): 420 frame + QR centered in a 440 bg card.
    var scale = DESIGN_QR / (n * m);
    svg = mk('svg');
    
  svg.setAttribute('id', 'qr-code');
        svg.setAttribute('viewBox', '0 0 ' + CARD_BOX + ' ' + CARD_BOX);
    svg.setAttribute('shape-rendering', 'geometricPrecision');

    // Background card - rounded square at the full 440 box.
    appendBgCard(svg, spec.shape, bg);

    // All artwork (QR + frame paths/labels) lives in a 420 group nudged in by
    // CARD_PAD so it's centered inside the card.
    contentRoot = mk('g');
    contentRoot.setAttribute('id', 'QR-code');
    contentRoot.setAttribute('transform', 'translate(' + CARD_PAD + ',' + CARD_PAD + ')');
    svg.appendChild(contentRoot);
    logoCx += CARD_PAD;
    logoCy += CARD_PAD;

    var t = DESIGN_OFF - scale * q * m;
    var sg = mk('g');
    sg.setAttribute('id', 'Code');
    sg.setAttribute('transform', 'translate(' + t.toFixed(3) + ',' + t.toFixed(3) + ') scale(' + scale.toFixed(5) + ')');
    contentRoot.appendChild(sg);

    if (isPillLike(cfg.pattern)) {
      var maskedMatrix = matrix.map(function(row, r) {
        return row.map(function(v, c) { return isFinderZone(r, c, n) ? false : v; });
      });
      var ps = pillSpec(cfg.pattern);
      sg.appendChild(renderPills(maskedMatrix, fg, bg, q * m, q * m, ps.mode, ps.sharp));
    } else if (cfg.pattern === 'rounded') {
      sg.appendChild(renderGroupedQR(matrix, n, fg, q * m, q * m, m));
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
      sg.appendChild(gData);
    }
    drawFinderEyes(sg, n, q, m, bg, eyeColor);
    logoModuleSize = m * scale;
  }

  // ── Frame: filled paths (square) and/or stroked shapes (circle ring).
  // Append to contentRoot - the square branch sets this to a centered group;
  // every other shape leaves it as the svg root.
  if (!contentRoot) contentRoot = svg;
  var frameCol = cfg.frameColor || fg;
  // All frame artwork goes into a dedicated group so animations can target it
  var frameLayer = mk('g');
  frameLayer.setAttribute('id', 'Frame');
  contentRoot.appendChild(frameLayer);
  var frameRoot = frameLayer;
  if (spec && spec.paths) {
    spec.paths.forEach(function(p) {
      var fp = mk('path');
      fp.setAttribute('id', 'Frame');
      fp.setAttribute('d', p.d);
      if (p.fillRule) fp.setAttribute('fill-rule', p.fillRule);
      // Decorative accent shapes (ticks/stars/dots on frame-06/07/08) can be
      // recolored independently of the ring; default mirrors how they were
      // authored (cutouts default to bg, additive dots default to frameCol).
      fp.setAttribute('fill', frameCol);
      frameRoot.appendChild(fp);
    });
  }
  if (spec && spec.strokes) {
    spec.strokes.forEach(function(st) {
      var el = mk(st.el);
      if (st.el === 'circle') {
        el.setAttribute('cx', st.cx); el.setAttribute('cy', st.cy); el.setAttribute('r', st.r);
      } else if (st.el === 'path') {
        el.setAttribute('d', st.d);
        el.setAttribute('stroke-linejoin', 'round');
      }
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', frameCol);
      el.setAttribute('stroke-width', st.strokeWidth);
      frameRoot.appendChild(el);
    });
  }

  // Logo center hint - QR always centered in the 420 box.
  svg._qrCenter = { x: logoCx, y: logoCy, m: logoModuleSize };
  return svg;
}

export { renderDesignedFrame };

