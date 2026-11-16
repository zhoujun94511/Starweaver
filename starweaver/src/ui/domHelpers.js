// Safe DOM helpers — exclusively use createElement & textContent (never innerHTML).

export function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '' && text !== null && text !== undefined) {
    node.textContent = String(text);
  }
  return node;
}

export function clearChildren(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}
