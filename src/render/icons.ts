import type { Element } from 'hast';

import type { PackageIconName } from '../iconography.js';
import { PACKAGE_ICON_PATHS } from './icon-paths.js';

export function decorativeIcon(name: PackageIconName): Element {
  return {
    type: 'element',
    tagName: 'svg',
    properties: {
      className: ['package-icon'],
      dataPackageIcon: name,
      viewBox: '0 0 16 16',
      width: 16,
      height: 16,
      ariaHidden: 'true',
      focusable: 'false',
    },
    children: [
      {
        type: 'element',
        tagName: 'path',
        properties: { d: PACKAGE_ICON_PATHS[name] },
        children: [],
      },
    ],
  };
}
