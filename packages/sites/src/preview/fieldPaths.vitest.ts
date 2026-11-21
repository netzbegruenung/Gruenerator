import { type SiteBlock } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { BASE_DRAFT } from '../draft/testDoc';

import { blockIdForPath, fieldLabel, parseFieldPath } from './fieldPaths';

const tile = (id: string) => ({ id, imageUrl: '', text: 'Los', link: '' });
const draft = {
  ...BASE_DRAFT,
  blocks: [
    { id: 'hero', type: 'hero' },
    { id: 'ac1', type: 'actions', items: [tile('x')] },
    { id: 'ac2', type: 'actions', items: [tile('y'), tile('z')] },
    { id: 'th', type: 'themes', items: [] },
    { id: 'co', type: 'contact', title: 'Kontakt', backgroundImageUrl: '' },
  ] satisfies SiteBlock[],
};

describe('parseFieldPath', () => {
  it.each([
    ['site_title', { kind: 'site', key: 'site_title' }],
    ['social_links.instagram', { kind: 'site', key: 'social_links' }],
    ['blocks.b1.title', { kind: 'block', blockId: 'b1', leaf: 'title' }],
    ['blocks.b1', { kind: 'block', blockId: 'b1', leaf: null }],
    ['blocks.b1.items.i2.title', { kind: 'item', blockId: 'b1', itemId: 'i2', leaf: 'title' }],
    ['legal.city', { kind: 'legal', key: 'city' }],
  ] as const)('%s', (path, parsed) => expect(parseFieldPath(path)).toEqual(parsed));

  it.each(['sections.about.title', 'blocks', 'blocks.b1.items', 'whatever'])('rejects %s', (path) =>
    expect(parseFieldPath(path)).toBeNull()
  );
});

describe('blockIdForPath', () => {
  it.each([
    ['site_title', 'hero'],
    ['tagline', 'hero'],
    ['profile_image', 'hero'],
    ['social_links.instagram', 'hero'],
    ['contact_email', 'co'],
    ['contact_phone', 'co'],
    ['blocks.ac2.items.z.link', 'ac2'],
    ['blocks.th', 'th'],
    ['blocks.gone.title', null],
    ['legal.city', null],
  ] as const)('%s -> %s', (path, id) => expect(blockIdForPath(path, draft)).toBe(id));
});

describe('fieldLabel', () => {
  it('numbers a repeated block type and the card inside it', () => {
    expect(fieldLabel('blocks.ac2.items.z.link', draft)).toBe('Aktionen 2, Kachel 2: Link');
    expect(fieldLabel('blocks.ac1.items.x.text', draft)).toBe('Aktionen 1, Kachel 1: Button-Text');
    expect(fieldLabel('blocks.co.title', draft)).toBe('Kontakt: Titel');
  });

  it('labels page and legal fields', () => {
    expect(fieldLabel('legal.city', draft)).toBe('Impressum: Ort');
    expect(fieldLabel('contact_phone', draft)).toBe('Telefon');
    expect(fieldLabel('social_links.mastodon', draft)).toBe('Netzwerk: mastodon');
    expect(fieldLabel('unknown.path', draft)).toBe('unknown.path');
  });
});
