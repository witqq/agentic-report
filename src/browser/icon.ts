import { PACKAGE_ICON_PATHS, type PackageIconName } from '../iconography.js';

export function browserIcon(name: PackageIconName): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('package-icon');
  svg.dataset.packageIcon = name;
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', PACKAGE_ICON_PATHS[name]);
  svg.append(path);
  return svg;
}
