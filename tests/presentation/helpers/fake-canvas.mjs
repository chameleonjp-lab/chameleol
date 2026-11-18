// 単体試験用の 2D 文脈の代用品。描いた文字・拡縮・画像を記録し、文字の幅は「全角は1em・半角は0.55em」で測る。
export function createFakeContext(canvas = null) {
  const ops = [];
  const texts = [];
  const state = { font: '10px sans-serif', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1 };
  const stack = [];
  const gradient = () => ({ addColorStop() {} });
  const target = {
    ops,
    texts,
    state,
    canvas,
    measureText(text) {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(state.font)?.[1] ?? 10);
      let w = 0;
      for (const ch of String(text)) w += (ch.codePointAt(0) > 0x2e7f ? 1 : 0.55) * size;
      return { width: w };
    },
    fillText(text, x, y) { texts.push({ text: String(text), x, y, font: state.font, kind: 'fill' }); ops.push(['fillText', String(text)]); },
    strokeText(text, x, y) { texts.push({ text: String(text), x, y, font: state.font, kind: 'stroke' }); ops.push(['strokeText', String(text)]); },
    scale(x, y) { ops.push(['scale', x, y]); },
    drawImage(image, ...args) { ops.push(['drawImage', image, ...args]); },
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    createLinearGradient: gradient,
    createRadialGradient: gradient,
    save() { stack.push({ ...state }); ops.push(['save']); },
    restore() { Object.assign(state, stack.pop() ?? {}); ops.push(['restore']); },
  };
  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (prop in state) return state[prop];
      return (...args) => { ops.push([String(prop), ...args]); };
    },
    set(obj, prop, value) { if (typeof value === 'function' || prop in obj) obj[prop] = value; else state[prop] = value; return true; },
  });
}

/** linkedom の canvas に fake 文脈を付ける。 */
export function installFakeCanvas(window) {
  const proto = Object.getPrototypeOf(window.document.createElement('canvas'));
  const contexts = new WeakMap();
  proto.getContext = function getContext() {
    if (!contexts.has(this)) contexts.set(this, createFakeContext(this));
    return contexts.get(this);
  };
  return (canvas) => contexts.get(canvas) ?? canvas.getContext('2d');
}
