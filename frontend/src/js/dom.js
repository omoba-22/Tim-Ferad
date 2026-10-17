// Builds page elements safely. Text is always added as plain text (never as
// HTML), so names or messages from the server cannot inject code into a page.
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue
    if (key === 'class') node.className = value
    else node.setAttribute(key, value === true ? '' : value)
  }
  node.append(...children.filter((c) => c != null && c !== false))
  return node
}

export const clear = (node) => node.replaceChildren()
