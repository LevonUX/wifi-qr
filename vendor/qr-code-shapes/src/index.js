/* Public API. */

import { getQRMatrix } from './encoder.js';
import { serialize } from './svg.js';
import { applyConfig } from './render/context.js';
import { renderSquare } from './render/square.js';
import { renderCircular } from './render/circle.js';
import { renderDesignedFrame } from './render/designed-frame.js';

export { SvgNode, serialize } from './svg.js';

/** Outline the code is drawn into. */
export const SHAPES = ['square', 'circle', 'triangle', 'hexagon'];

/** Shape of an individual data module. */
export const PATTERNS = [
  'dots', 'square', 'small', 'star', 'rounded',
  'stars', 'hearts', 'triangles', 'diamonds',
  'pill-h', 'pill-v', 'bar-h', 'bar-v',
];

/** Shape of the three finder eyes. */
export const EYE_SHAPES = ['circle', 'rounded', 'square'];

/** Frame drawn around the code. Every shape offers all of them. */
export const FRAMES = ['none', 'thin', 'double', 'organic'];

// Public shape/frame names mapped onto the internal artwork keys.
const FRAME_KEYS = {
  square: { thin: 'custom01', double: 'custom02', organic: 'custom05' },
  circle: { thin: 'circ01', double: 'circ02', organic: 'circ05' },
  triangle: { thin: 'tri01', double: 'tri02', organic: 'tri05' },
  hexagon: { thin: 'hex01', double: 'hex02', organic: 'hex05' },
};

// An unframed triangle or hexagon still routes through the frame renderer, so
// that dropping the frame does not also change the code's size and position.
const FRAMELESS_KEYS = { triangle: '__frameless_tri', hexagon: '__frameless_hex' };

function oneOf(value, allowed, name, fallback) {
  if (value === undefined || value === null) return fallback;
  if (!allowed.includes(value)) {
    throw new TypeError(`${name}: expected one of ${allowed.join(', ')} - got ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Render a QR code and return it as an SVG node tree.
 *
 * Use this when you want to walk or edit the result before serializing it;
 * for the common case reach for renderQR, which hands back markup.
 *
 * @param {object} options
 * @param {string} options.text        Payload to encode. Required.
 * @param {string} [options.shape]     One of SHAPES. Default 'square'.
 * @param {string} [options.pattern]   One of PATTERNS. Default 'dots'.
 * @param {string} [options.eyeShape]  One of EYE_SHAPES. Default 'circle'.
 * @param {string} [options.frame]     One of FRAMES. Default 'none'.
 * @param {string} [options.color]     Module colour. Default '#000000'.
 * @param {string} [options.background] Background colour, or 'transparent'. Default '#ffffff'.
 * @param {string} [options.eyeColor]  Finder-eye colour. Defaults to `color`.
 * @param {string} [options.frameColor] Frame colour. Defaults to `color`.
 * @param {number} [options.seed]      Seeds the scatter of the 'star' pattern. Default 0.
 * @param {number} [options.mask]      Force a mask pattern, 0-7. Default: the encoder picks.
 * @returns {SvgNode}
 */
export function renderQRNode(options = {}) {
  const { text } = options;
  if (typeof text !== 'string' || text.length === 0) {
    throw new TypeError('text: expected a non-empty string');
  }

  const shape = oneOf(options.shape, SHAPES, 'shape', 'square');
  const frame = oneOf(options.frame, FRAMES, 'frame', 'none');
  oneOf(options.pattern, PATTERNS, 'pattern', 'dots');
  oneOf(options.eyeShape, EYE_SHAPES, 'eyeShape', 'circle');

  const { mask } = options;
  if (mask !== undefined && (!Number.isInteger(mask) || mask < 0 || mask > 7)) {
    throw new TypeError(`mask: expected an integer 0-7 - got ${JSON.stringify(mask)}`);
  }

  const color = options.color || '#000000';
  const background = options.background || '#ffffff';

  applyConfig(options);

  // Error correction is fixed at level H: the frames and outlines cover part
  // of the code, and H is what lets it still scan.
  const matrix = getQRMatrix(text, mask);

  if (frame !== 'none') return renderDesignedFrame(matrix, color, background, FRAME_KEYS[shape][frame]);
  if (FRAMELESS_KEYS[shape]) return renderDesignedFrame(matrix, color, background, FRAMELESS_KEYS[shape]);
  if (shape === 'circle') return renderCircular(matrix, color, background);
  return renderSquare(matrix, color, background);
}

/**
 * Render a QR code and return it as SVG markup.
 *
 * Takes the same options as renderQRNode.
 *
 * @returns {string} A standalone <svg> document.
 */
export function renderQR(options = {}) {
  return serialize(renderQRNode(options));
}
