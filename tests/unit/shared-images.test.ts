import { describe, expect, it } from 'vitest';

import { SHARED_IMAGES_ELEMENT_ID, shareRepeatedImages } from '../../src/render/shared-images.js';

describe('repeated images in one file', () => {
  const url = `data:image/png;base64,${'A'.repeat(4000)}`;
  const once = 'data:image/png;base64,BBBB';

  it('keeps each repeated image once in a data block and refers to it from every occurrence', () => {
    const html = `<html><body><img src="${url}" alt="a"><template><img src="${url}" alt="b"></template><img src="${once}" alt="c"></body></html>`;
    const shared = shareRepeatedImages(html);
    expect(shared.html.split(url)).toHaveLength(2);
    expect(shared.html).toContain(`<img data-shared-src="i1" alt="a">`);
    expect(shared.html).toContain(`<img data-shared-src="i1" alt="b">`);
    expect(shared.html).toContain(`src="${once}"`);
    expect(shared.html).toContain(`id="${SHARED_IMAGES_ELEMENT_ID}"`);
    expect(shared.savedBytes).toBe(Buffer.byteLength(url));
    expect(Buffer.byteLength(html) - Buffer.byteLength(shared.html)).toBeGreaterThan(3900);
  });

  it('shares a repeated clip and poster too', () => {
    const clip = `data:video/mp4;base64,${'V'.repeat(3000)}`;
    const poster = `data:image/jpeg;base64,${'P'.repeat(1000)}`;
    const html = `<body><video poster="${poster}"><source src="${clip}"></video><video poster="${poster}"><source src="${clip}"></video></body>`;
    const shared = shareRepeatedImages(html);
    expect(shared.html.split(clip)).toHaveLength(2);
    expect(shared.html.split(poster)).toHaveLength(2);
    expect(shared.html).toContain('<source data-shared-src=');
    expect(shared.html).toContain('<video data-shared-poster=');
  });

  it('changes nothing when no image repeats', () => {
    const html = `<html><body><img src="${once}"></body></html>`;
    expect(shareRepeatedImages(html)).toEqual({ html, savedBytes: 0 });
  });
});
