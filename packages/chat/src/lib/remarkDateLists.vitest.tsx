import { render } from '@testing-library/react';
import { defaultRemarkPlugins, Streamdown } from 'streamdown';
import { describe, expect, it, vi } from 'vitest';

import { remarkDateLists } from './remarkDateLists';
import { streamdownComponents } from './streamdownComponents';

// Der Code-Block-Renderer ist hier nicht Gegenstand und lädt unter jsdom langsam.
vi.mock('./shikiHighlight', () => ({
  shikiCodePlugin: {},
  normalizeLang: (lang?: string) => lang ?? '',
  highlightCode: async (code: string) => code,
}));

/** Echter Parser, echte Komponenten — so wie der Chat rendert, ohne Tipp-Animation. */
function renderMarkdown(markdown: string) {
  return render(
    <Streamdown
      components={streamdownComponents}
      remarkPlugins={[...Object.values(defaultRemarkPlugins), remarkDateLists]}
    >
      {markdown}
    </Streamdown>
  );
}

describe('remarkDateLists', () => {
  it('lässt ein Datum in einer Aufzählung ein Datum bleiben (Live-Fall 19.11.2026)', () => {
    const { container } = renderMarkdown(
      [
        '* 28. November 2026 (9 bis 13 Uhr): Infostand am Wochenmarkt.',
        '* 1. Dezember (2026): Frist für den Zeitplan.',
        '* 17. Januar 2027: Aufstellungsversammlung für die Kommunalwahl.',
        '* März 2027: Start der Fahrradstraße.',
      ].join('\n')
    );
    const items = [...container.querySelectorAll('li')].map((li) => li.textContent);
    expect(items).toEqual([
      '28. November 2026 (9 bis 13 Uhr): Infostand am Wochenmarkt.',
      '1. Dezember (2026): Frist für den Zeitplan.',
      '17. Januar 2027: Aufstellungsversammlung für die Kommunalwahl.',
      'März 2027: Start der Fahrradstraße.',
    ]);
    expect(container.querySelector('ol')).toBeNull();
  });

  it('macht einen Absatz, der mit einem Datum beginnt, nicht zur Liste', () => {
    const { container } = renderMarkdown('17. Jänner 2027 tagt der Landesvorstand.');
    expect(container.querySelector('ol')).toBeNull();
    expect(container.textContent).toContain('17. Jänner 2027 tagt der Landesvorstand.');
  });

  it('übernimmt jede Zahl aus dem Text, nicht nur die erste', () => {
    const { container } = renderMarkdown('28. November: Infostand\n29. November: Abbau');
    expect(container.querySelector('ol')).toBeNull();
    expect(container.textContent).toContain('28. November: Infostand');
    expect(container.textContent).toContain('29. November: Abbau');
  });

  it('lässt echte Aufzählungen Listen und behält ihren Startwert', () => {
    const { container } = renderMarkdown('3. Antrag stellen\n4. Beschluss fassen');
    const ol = container.querySelector('ol');
    expect(ol).not.toBeNull();
    expect(ol!.getAttribute('start')).toBe('3');
    expect(ol!.querySelectorAll('li')).toHaveLength(2);
  });

  it('lässt Code-Blöcke unberührt', () => {
    const { container } = renderMarkdown('```\n28. November\n```');
    expect(container.querySelector('ol')).toBeNull();
    expect(container.textContent).toContain('28. November');
  });
});
