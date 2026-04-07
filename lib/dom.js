export function element(tagName, options = {}) {
  const node = document.createElement(tagName);
  const { dataset, style, childNodes, ...rest } =
    options;
  Object.assign(node, rest);
  if (dataset) {
    Object.assign(node.dataset, dataset);
  }
  if (childNodes) node.append(...childNodes);
  return node;
}

export function fragment(...children) {
  const frag = document.createDocumentFragment();
  frag.append(...children);
  return frag;
}
