/* Turning rendered markup into files. Browser-only - these need a canvas.
 *
 * Import from 'qr-code-shapes/browser'; the main entry stays free of DOM
 * assumptions so it can run on a server.
 */

/** Wrap SVG markup in a Blob ready to download or upload. */
export function toSVGBlob(markup) {
  return new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
}

/**
 * Rasterize SVG markup to a PNG.
 *
 * @param {string} markup            Output of renderQR().
 * @param {object} [options]
 * @param {number} [options.size]    Width and height in pixels. Default 1024.
 * @param {string} [options.background] Paint behind the code. Omit to keep the
 *   PNG's alpha channel - which is what you want when the code was rendered
 *   with `background: 'transparent'`.
 * @returns {Promise<Blob>}
 */
export function toPNGBlob(markup, options = {}) {
  const size = options.size || 1024;
  // Base64 rather than a blob: URL - Safari taints a canvas drawn from a blob
  // URL, and a tainted canvas cannot be read back out.
  const source = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(markup)));

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (options.background) {
        context.fillStyle = options.background;
        context.fillRect(0, 0, size, size);
      }
      context.drawImage(image, 0, 0, size, size);
      canvas.toBlob((blob) => {
        blob ? resolve(blob) : reject(new Error('canvas.toBlob produced nothing'));
      }, 'image/png');
    };
    image.onerror = () => reject(new Error('the browser could not load the rendered SVG'));
    image.src = source;
  });
}

/** Save a Blob to the user's downloads. */
export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking synchronously cancels the download in Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
