import { describeError } from '../core/util.js';

export function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.type) node.type = options.type;
  if (options.title) node.title = options.title;
  if (options.name) node.name = options.name;
  if (options.value !== undefined) node.value = String(options.value);
  if (options.placeholder) node.placeholder = options.placeholder;
  if (options.ariaLabel) node.setAttribute('aria-label', options.ariaLabel);
  if (options.onClick) node.addEventListener('click', options.onClick);
  for (const child of Array.isArray(children) ? children : [children]) if (child) node.append(child);
  return node;
}

export function button(text, onClick, className = '') {
  return element('button', { type: 'button', text, onClick, className: `ma-button ${className}`.trim() });
}

export function notice(error) {
  const text = describeError(error);
  if (window.toastr?.error) window.toastr.error(text, '镜渊');
  else console.error('[Mirror Abyss]', error);
}
