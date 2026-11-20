// 小さなDOM作成の補助。利用者の入力（名前など）は必ず textContent で入れ、HTMLとして解釈しない。

export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'text') el.textContent = value;
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** 名前などの利用者入力を、文字の方向を行内に閉じ込めて表示する（右から左の名前が数値列を動かさない）。 */
export function isolatedText(text, className = 'user-text') {
  const bdi = document.createElement('bdi');
  bdi.className = className;
  bdi.dir = 'auto';
  bdi.textContent = text;
  return bdi;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}
