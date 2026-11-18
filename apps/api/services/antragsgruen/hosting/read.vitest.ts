/**
 * Antragsliste und Antragssuche einer eigenen Seite. Die Zeile ist die von
 * Antragsgrün 4.18.1 (Docker, 18.11.2026), gekürzt um Export- und Aktionsspalten.
 */
import { describe, expect, it } from 'vitest';

import { findOwnMotion, motionListOf, type OwnMotionRef } from './read.js';

const ROW = (id: number, prefix: string, title: string, status: string) =>
  `<tr class="motion motion${id}"><td><input type="checkbox" name="motions[]" value="${id}" class="selectbox"></td>` +
  `<td class="typeCol">A</td><td class="prefixCol"><a href="/kv-anna/Slug-${id}"><span class="glyphicon glyphicon-file" aria-hidden="true"></span> ${prefix}</a></td>` +
  `<td class="titleCol"><span><a href="/kv-anna/admin/motion/update/${id}"><span class="glyphicon glyphicon-edit" aria-hidden="true"></span> ${title}</a></span></td>` +
  `<td>${status}<div class="todo">To Do: Antrag freischalten</div></td><td>anna Test</td></tr>`;

describe('motionListOf', () => {
  it('reads number, title, status and page of every row, unscreened ones included', () => {
    const html = `<table><tbody>${ROW(2, '-', 'Mehr Radwege', 'Eingereicht (ungeprüft)')}${ROW(5, 'A1', 'Busse', 'Eingereicht')}</tbody></table>`;
    expect(motionListOf(html, 'https://kv-anna.antragsgruen.de')).toEqual([
      {
        id: 2,
        prefix: null,
        title: 'Mehr Radwege',
        status: 'Eingereicht (ungeprüft)',
        url: 'https://kv-anna.antragsgruen.de/kv-anna/Slug-2',
      },
      {
        id: 5,
        prefix: 'A1',
        title: 'Busse',
        status: 'Eingereicht',
        url: 'https://kv-anna.antragsgruen.de/kv-anna/Slug-5',
      },
    ]);
  });

  it('is empty for a page without motions', () => {
    expect(motionListOf('<table></table>', 'https://x.antragsgruen.de')).toEqual([]);
  });
});

describe('findOwnMotion', () => {
  const ref = (id: number, prefix: string | null, title: string): OwnMotionRef => ({
    id,
    prefix,
    title,
    status: 'Eingereicht',
    url: `https://x/${id}`,
  });
  const MOTIONS = [
    ref(1, 'A1', 'Mehr Radwege'),
    ref(2, 'A2', 'Busse im ländlichen Raum'),
    ref(3, null, 'Mehr Radwege'),
  ];

  it('finds by number regardless of spacing and case', () => {
    expect(findOwnMotion(MOTIONS, 'a 2')?.id).toBe(2);
  });

  it('finds by the words of the title', () => {
    expect(findOwnMotion(MOTIONS, 'Busse laendlich')?.id).toBe(2);
  });

  it('gives up when a title is ambiguous instead of guessing', () => {
    expect(findOwnMotion(MOTIONS, 'Mehr Radwege')).toBeNull();
  });
});
