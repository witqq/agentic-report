import type { PackageIcon } from '../iconography.js';

/**
 * A package icon drawn in the browser. It takes the icon itself, not its name, so the page script carries
 * only the icons its modules import.
 */
export function browserIcon(icon: PackageIcon): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('package-icon');
  svg.dataset.packageIcon = icon.name;
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', icon.path);
  svg.append(path);
  return svg;
}
