import { describe, it, expect } from 'vitest';
import { translations } from '../src/panel-i18n';
import { PANEL_HTML } from '../src/panel';

describe('multilingual workspace', () => {
  it('provides every interface message in all five languages', () => {
    const keys = Object.keys(translations.en).sort();
    for (const dictionary of Object.values(translations)) {
      expect(Object.keys(dictionary).sort()).toEqual(keys);
      expect(Object.values(dictionary).every(value => typeof value === 'string' && value.trim())).toBe(true);
    }
  });
  it('translates every declared label and attribute', () => {
    for (const match of PANEL_HTML.matchAll(/data-(?:i18n|placeholder|title)="([^"]+)"/g)) {
      expect(translations.en).toHaveProperty(match[1]!);
    }
  });
});
