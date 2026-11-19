import { SITE_ACTION_TEXT_MAX, type WebsiteContent } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { attachImages, clampSections, validateWebsiteContent } from './content.js';
import { actionLinksFor } from './prompt.js';

function content(themes: number, actions: number): WebsiteContent {
  return {
    hero: { heading: 'Hallo', text: 'Kurz' },
    about: { title: 'Über mich', content: 'Text' },
    hero_image: { title: 'Slogan', subtitle: 'Untertitel' },
    themes: Array.from({ length: themes }, (_, i) => ({
      title: `Thema ${i}`,
      content: `Inhalt ${i}`,
    })),
    actions: Array.from({ length: actions }, (_, i) => ({
      text: `Aktion ${i}`,
      link: '#kontakt',
    })),
    contact: { title: 'Kontakt', email: '' },
  };
}

const echoPick = (text: string): Promise<string> => Promise.resolve(`img:${text}`);

describe('clampSections', () => {
  it('kürzt Themen und Aktionen auf drei', () => {
    const result = clampSections(content(5, 4));
    expect(result.themes).toHaveLength(3);
    expect(result.actions).toHaveLength(3);
  });

  it('lässt kürzere Listen unangetastet', () => {
    const result = clampSections(content(2, 1));
    expect(result.themes).toHaveLength(2);
    expect(result.actions).toHaveLength(1);
  });
});

describe('attachImages', () => {
  it('ordnet jedem Abschnitt sein eigenes Bild zu', async () => {
    const result = await attachImages(content(3, 3), echoPick);
    expect(result.hero_image.imageUrl).toBe('img:Slogan Untertitel');
    expect(result.themes.map((t) => t.imageUrl)).toEqual([
      'img:Thema 0 Inhalt 0',
      'img:Thema 1 Inhalt 1',
      'img:Thema 2 Inhalt 2',
    ]);
    expect(result.actions.map((a) => a.imageUrl)).toEqual([
      'img:Aktion 0',
      'img:Aktion 1',
      'img:Aktion 2',
    ]);
    expect(result.contact.backgroundImageUrl).toBe('img:Kontakt Kontakt Politik Grüne');
  });

  it('bleibt richtig, wenn das Modell weniger als drei Abschnitte liefert', async () => {
    const result = await attachImages(content(2, 2), echoPick);
    expect(result.themes.map((t) => t.imageUrl)).toEqual([
      'img:Thema 0 Inhalt 0',
      'img:Thema 1 Inhalt 1',
    ]);
    expect(result.actions.map((a) => a.imageUrl)).toEqual(['img:Aktion 0', 'img:Aktion 1']);
    expect(result.contact.backgroundImageUrl).toBe('img:Kontakt Kontakt Politik Grüne');
  });

  it('trägt einen leeren String ein, wenn der Bildwähler nichts findet', async () => {
    const result = await attachImages(content(1, 1), () => Promise.resolve(''));
    expect(result.themes[0]?.imageUrl).toBe('');
    expect(result.contact.backgroundImageUrl).toBe('');
  });
});

describe('validateWebsiteContent', () => {
  it('accepts content with allowed links', () => {
    const input = content(3, 2);
    input.actions[1] = { text: 'Werde Mitglied', link: actionLinksFor('de-DE')[1] ?? '' };
    expect(validateWebsiteContent('de-DE')(input).ok).toBe(true);
  });

  it('rejects a German membership link for de-AT', () => {
    const input = content(3, 1);
    input.actions[0] = { text: 'Werde Mitglied', link: 'https://www.gruene.de/mitglied-werden' };
    const result = validateWebsiteContent('de-AT')(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('actions.0.link');
  });

  it('clamps four themes to three before validating', () => {
    const result = validateWebsiteContent('de-DE')(content(4, 1));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.themes).toHaveLength(3);
  });

  it('names the field of an overlong text', () => {
    const input = content(3, 1);
    input.actions[0] = { text: 'x'.repeat(SITE_ACTION_TEXT_MAX + 1), link: '#kontakt' };
    const result = validateWebsiteContent('de-DE')(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('actions.0.text');
  });

  it('drops null image fields the model sends', () => {
    const input = content(3, 1);
    (input.themes[0] as Record<string, unknown>).imageUrl = null;
    expect(validateWebsiteContent('de-DE')(input).ok).toBe(true);
  });

  it('ignores an invented contact e-mail', () => {
    const input = content(3, 1);
    input.contact.email = 'a'.repeat(400) + '@x.de';
    expect(validateWebsiteContent('de-DE')(input).ok).toBe(true);
  });
});
