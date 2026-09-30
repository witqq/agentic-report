/*! agentic-report script: filter */
/** Filter lists (`:::filter`): the items whose text contains the query stay, with a count. */

import type { PackageStrings } from '../../localization.js';
import { provideFeature } from '../features.js';

function applyFilter(input: HTMLInputElement, strings: PackageStrings): void {
  const filter = input.closest<HTMLElement>('[data-filter]');
  if (filter === null) return;
  const output = filter.querySelector<HTMLOutputElement>('[data-filter-count]');
  const items = [...filter.querySelectorAll<HTMLLIElement>(':scope > ul > li, :scope > ol > li')];
  const query = input.value.trim().toLocaleLowerCase();
  let visible = 0;
  for (const item of items) {
    item.hidden = !item.textContent?.toLocaleLowerCase().includes(query);
    if (!item.hidden) visible += 1;
  }
  if (output !== null) output.textContent = strings.items(visible);
}

provideFeature('filter', applyFilter);
