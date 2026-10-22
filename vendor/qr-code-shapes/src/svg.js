/* A tiny stand-in for the parts of the DOM the renderers actually touch.
 *
 * The renderers were written against document.createElementNS and build the
 * QR by appending real SVG elements. That ties them to a browser. They only
 * ever call setAttribute / getAttribute / appendChild / remove and read
 * firstChild, so a ~70-line node type covers the whole surface and the
 * renderers run unchanged in Node, in a worker, or during SSR.
 */

export const XMLNS = 'http://www.w3.org/2000/svg';

/* Attribute values arrive as numbers straight out of the geometry math, where
 * 0.1 + 0.2 is a real hazard. Four decimals is well past what a QR needs and
 * keeps the output stable across platforms. */
function formatValue(value) {
  if (typeof value !== 'number') return String(value);
  if (!Number.isFinite(value)) return '0';
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(4)));
}

function escapeAttribute(value) {
  return formatValue(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class SvgNode {
  constructor(nodeName) {
    this.nodeName = nodeName;
    this.attributes = new Map();
    this.childNodes = [];
    this.parentNode = null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
    return this;
  }

  getAttribute(name) {
    return this.attributes.has(name) ? formatValue(this.attributes.get(name)) : null;
  }

  appendChild(child) {
    // Detach first: the frame renderer moves a whole subtree with
    // `while (src.firstChild) dst.appendChild(src.firstChild)`, which never
    // terminates if the node stays parented to the source.
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild(child) {
    const at = this.childNodes.indexOf(child);
    if (at !== -1) {
      this.childNodes.splice(at, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  get firstChild() {
    return this.childNodes[0] || null;
  }

  toString() {
    const attrs = [...this.attributes]
      .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
      .join('');
    if (this.childNodes.length === 0) return `<${this.nodeName}${attrs}/>`;
    const inner = this.childNodes.map(String).join('');
    return `<${this.nodeName}${attrs}>${inner}</${this.nodeName}>`;
  }
}

/** Create an element. The renderers' only construction entry point. */
export function mk(nodeName) {
  return new SvgNode(nodeName);
}

/** Serialize a root <svg> to markup, stamping the namespace the shim omits. */
export function serialize(root) {
  if (!root.attributes.has('xmlns')) root.setAttribute('xmlns', XMLNS);
  return root.toString();
}
