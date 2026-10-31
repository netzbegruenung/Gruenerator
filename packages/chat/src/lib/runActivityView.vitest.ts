import { describe, expect, it } from 'vitest';

import { formatRunDuration, selectRunActivity } from './runActivityView';

import type { StatusPartLike } from './toolStatusLine';

const search = (id: string, query: string): StatusPartLike => ({
  type: 'tool-call',
  toolCallId: id,
  toolName: 'web_search',
  args: { query },
  result: { results: [] },
});
const text = (value: string): StatusPartLike => ({ type: 'text', text: value });

describe('formatRunDuration', () => {
  it('reads seconds, minutes and both', () => {
    expect(formatRunDuration(45_200)).toBe('45 Sek.');
    expect(formatRunDuration(100_000)).toBe('1 Min. 40 Sek.');
    expect(formatRunDuration(180_000)).toBe('3 Min.');
  });

  it('never says 0 Sek.', () => {
    expect(formatRunDuration(120)).toBe('1 Sek.');
  });
});

describe('selectRunActivity', () => {
  it('gives a long turn its row, with the steps in order and their queries', () => {
    const view = selectRunActivity(
      [search('a', 'Klimageld'), text('Zwischenstand'), search('b', 'CO2-Preis 2027')],
      100_000,
      false
    );
    expect(view?.label).toBe('Gearbeitet für 1 Min. 40 Sek. · 2 Schritte');
    expect(view?.steps).toEqual([
      { id: 'a', label: 'Websuche „Klimageld“' },
      { id: 'b', label: 'Websuche „CO2-Preis 2027“' },
    ]);
  });

  it('gives a quick turn with many steps its row', () => {
    const view = selectRunActivity(
      [search('a', 'x'), search('b', 'y'), search('c', 'z')],
      4_000,
      false
    );
    expect(view?.label).toBe('Gearbeitet für 4 Sek. · 3 Schritte');
  });

  it('leaves a quick turn with few steps alone', () => {
    expect(selectRunActivity([search('a', 'x'), search('b', 'y')], 29_000, false)).toBeNull();
  });

  it('leaves a single step alone, however long it ran — the everyday agentic lookup', () => {
    expect(selectRunActivity([search('a', 'Bundeskanzler')], 20_345, false)).toBeNull();
    expect(selectRunActivity([search('a', 'x')], 180_000, false)).toBeNull();
  });

  it('leaves a turn without any step alone, however long it ran', () => {
    expect(selectRunActivity([text('Antwort')], 90_000, false)).toBeNull();
  });

  it('shows nothing while the turn is still running — the status line owns that', () => {
    expect(selectRunActivity([search('a', 'x')], 90_000, true)).toBeNull();
  });

  it('drops the time on turns persisted before it was recorded', () => {
    const view = selectRunActivity(
      [search('a', 'x'), search('b', 'y'), search('c', 'z')],
      null,
      false
    );
    expect(view?.label).toBe('3 Schritte');
  });

  it('does not count the tool-group loaders as work', () => {
    const loader: StatusPartLike = {
      type: 'tool-call',
      toolCallId: 'l',
      toolName: 'meine_inhalte_laden',
      args: {},
    };
    expect(selectRunActivity([loader, search('a', 'x')], 60_000, false)).toBeNull();
    expect(
      selectRunActivity([loader, search('a', 'x'), search('b', 'y')], 30_000, false)?.label
    ).toBe('Gearbeitet für 30 Sek. · 2 Schritte');
  });
});
