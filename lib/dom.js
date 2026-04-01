export function element(tagName, options = {}) {
  const el = document.createElement(tagName);
  const { dataset, style, childNodes, ...rest } =
    options;
  Object.assign(el, rest);
  if (dataset) Object.assign(el.dataset, dataset);
  if (style) Object.assign(el.style, style);
  if (childNodes) el.append(...childNodes);
  return el;
}

export function fragment(...children) {
  const frag = document.createDocumentFragment();
  frag.append(...children);
  return frag;
}
