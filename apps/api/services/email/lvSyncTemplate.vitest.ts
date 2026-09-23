/**
 * Wolke-Dateien sind als `wolke://<key>/<pfad>` gespeichert — in der Mail an
 * den Landesverband muss daraus der anklickbare Freigabe-Link werden, in HTML
 * und Text.
 */
import { describe, expect, it, vi } from 'vitest';

import { renderLvSyncNotificationTemplate } from './templates.js';

vi.mock('../scrapers/utils/wolkeShareSecrets.js', () => ({
  resolveWolkeDisplayUrl: (url: string) =>
    url.replace('wolke://be-share/', 'https://wolke.netzbegruenung.de/s/TESTTOKEN#/'),
}));

describe('renderLvSyncNotificationTemplate', () => {
  it('links a Wolke file with its resolved share link and leaves web urls alone', () => {
    const { html, text } = renderLvSyncNotificationTemplate({
      lvName: 'Berlin',
      syncDate: '2026-09-23T10:00:00.000Z',
      newArticles: [
        { title: 'Antwort', url: 'wolke://be-share/WPS/Antwort.pdf', type: 'beschluss' },
        { title: 'Presse', url: 'https://gruene.berlin/a', type: 'presse' },
      ],
    });
    const shown = 'https://wolke.netzbegruenung.de/s/TESTTOKEN#/WPS/Antwort.pdf';
    expect(html).toContain(`href="${shown}"`);
    expect(text).toContain(shown);
    expect(html).not.toContain('wolke://');
    expect(text).not.toContain('wolke://');
    expect(html).toContain('href="https://gruene.berlin/a"');
  });
});
