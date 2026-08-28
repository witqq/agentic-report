import { describe, expect, it } from 'vitest';

import { packageStrings, resolvePackageLocale } from '../../src/localization.js';

describe('package reader localization', () => {
  it('resolves only Russian primary tags and otherwise falls back to English', () => {
    expect(resolvePackageLocale('ru')).toBe('ru');
    expect(resolvePackageLocale('RU-ru')).toBe('ru');
    expect(resolvePackageLocale('en-GB')).toBe('en');
    expect(resolvePackageLocale('und')).toBe('en');
    expect(resolvePackageLocale('de-DE')).toBe('en');
    expect(resolvePackageLocale(undefined)).toBe('en');
  });

  it('uses supported Russian and English count forms without host locale state', () => {
    const ru = packageStrings('ru');
    expect([1, 2, 5, 11, 21, 24].map(ru.items)).toEqual([
      '1 элемент',
      '2 элемента',
      '5 элементов',
      '11 элементов',
      '21 элемент',
      '24 элемента',
    ]);
    expect([1, 2].map(packageStrings('und').items)).toEqual(['1 item', '2 items']);
    expect(ru.formatNumber(1234.5)).toBe('1 234,5');
    expect(packageStrings('en').formatNumber(1234.5)).toBe('1,234.5');
    expect([0, 1, 2, 5, 21].map((count) => ru.threadsSummary(count, count))).toEqual([
      '0 обсуждений · открыто: 0',
      '1 обсуждение · открыто: 1',
      '2 обсуждения · открыто: 2',
      '5 обсуждений · открыто: 5',
      '21 обсуждение · открыто: 21',
    ]);
    expect(packageStrings('en').threadsSummary(1, 1)).toBe('1 thread · unresolved: 1');
  });

  it('localizes every closed prior binding and textless target fallback', () => {
    const ru = packageStrings('ru');
    expect((['exact', 'changed', 'missing', 'ambiguous'] as const).map(ru.reviewBinding)).toEqual([
      'точно',
      'изменено',
      'не найдено',
      'неоднозначно',
    ]);
    expect(ru.reviewTargetFallback('markdown:thematic-break')).toBe('Разделитель');
    expect(ru.reviewTargetFallback('directive:future')).toBe('Блок отчёта');
  });
});
