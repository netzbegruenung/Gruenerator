import { describe, expect, it } from 'vitest';

import { fieldLabel, panelForPath } from './fieldPaths';

describe('panelForPath', () => {
  it.each([
    ['site_title', 'hero'],
    ['tagline', 'hero'],
    ['profile_image', 'hero'],
    ['social_links.instagram', 'hero'],
    ['social_links', 'hero'],
    ['sections.themes.2.title', 'themes'],
    ['sections.about.content', 'about'],
    ['sections.heroImage.subtitle', 'heroImage'],
    ['contact_email', 'contact'],
    ['contact_phone', 'contact'],
    ['legal.city', 'legal'],
    ['sections.unknown.title', null],
    ['something_else', null],
  ] as const)('%s -> %s', (path, panel) => {
    expect(panelForPath(path)).toBe(panel);
  });
});

describe('fieldLabel', () => {
  it('labels legal and section fields', () => {
    expect(fieldLabel('legal.city')).toBe('Impressum: Ort');
    expect(fieldLabel('sections.themes.2.title')).toBe('Themen 3: Titel');
    expect(fieldLabel('contact_phone')).toBe('Telefon');
    expect(fieldLabel('unknown.path')).toBe('unknown.path');
  });
});
