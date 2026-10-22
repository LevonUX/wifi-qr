/* The handful of settings every renderer reads while it draws.
 *
 * The renderers came from a page where these lived on a global `state` object
 * that the UI mutated. Threading them through twenty nested helpers would have
 * meant rewriting geometry code that is already correct, so they live here
 * instead and renderQR() sets them before it draws. Rendering is synchronous
 * and single-pass, so there is nothing to race with.
 */

export const cfg = {
  /** Module shape: dots | square | small | star | rounded | stars | hearts |
   *  triangles | diamonds | pill-h | pill-v | pill-h-sharp | pill-v-sharp */
  pattern: 'dots',
  /** Finder-eye shape: circle | rounded | square */
  eyeShape: 'circle',
  /** Eye fill; falls back to the foreground colour when null. */
  eyeColor: null,
  /** Frame fill; falls back to the foreground colour when null. */
  frameColor: null,
  /** Canvas units per module. Every renderer fixes this at 10. */
  moduleSize: 10,
  /** Seeds the scatter in the 'star' pattern. Fixed, so output is reproducible. */
  seed: 0,
};

export function applyConfig(options) {
  cfg.pattern = options.pattern || 'dots';
  cfg.eyeShape = options.eyeShape || 'circle';
  cfg.eyeColor = options.eyeColor || null;
  cfg.frameColor = options.frameColor || null;
  cfg.moduleSize = 10;
  cfg.seed = typeof options.seed === 'number' ? options.seed : 0;
}

