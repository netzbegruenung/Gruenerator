/**
 * Die `heavy`-Stufe läuft auf Scaleway (`provider: 'scaleway'`), NICHT über
 * `routeMistralModel`. Zwei Dinge tragen diese Lane, und keines davon bewacht
 * der Compiler — deshalb dieser Test.
 *
 *  1. `reasoning_effort: 'none'`. Gemma 4 26B-A4B denkt per Default und
 *     antwortet dann mit LEEREM `content` (gemessen 01.08.2026: leer auch bei
 *     max_tokens 1500, nach 5386 Zeichen Reasoning). Leerer Inhalt ist für
 *     `aiService` kein Fehler, sondern startet die Fallback-Kette — der Ausfall
 *     wäre also teuer UND unsichtbar.
 *  2. `KNOWN` in workers/providers/index.ts. Das ist ein Array, kein Record:
 *     ein fehlender Provider ist kein Typfehler, sondern eine stille
 *     Degradierung über `normalizeProviderName` nach `'mistral'` — ausgerechnet
 *     auf das teuerste Modell, hinter nichts als einer console.warn.
 */

import { describe, expect, it } from 'vitest';

import { KNOWN_PROVIDERS } from '../../../workers/providers/index.js';
import { intermediateLane } from '../intermediateLanes.js';
import { normalizeProviderName } from '../providers.js';
import { scalewayFetchWithThinkingDisabled } from '../scalewayThinkingFetch.js';

import type { ProviderName } from '../providers.js';

/** Jeder Wert der Union. Wächst die Union, muss diese Liste mitwachsen — und
 *  genau dann fällt der Test unten auf, falls `KNOWN` vergessen wurde. */
const ALL_PROVIDERS: ProviderName[] = ['mistral', 'litellm', 'regolo', 'greenpt', 'scaleway'];

describe('scaleway text lane', () => {
  it('erzwingt reasoning_effort none auf jedem Chat-Request', async () => {
    let sent: Record<string, unknown> | null = null;
    const original = globalThis.fetch;
    globalThis.fetch = ((_input: unknown, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Promise.resolve(new Response('{}', { status: 200 }));
    }) as typeof fetch;

    try {
      await scalewayFetchWithThinkingDisabled('https://example.invalid/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ model: 'gemma-4-26b-a4b-it', messages: [], max_tokens: 20 }),
      });
    } finally {
      globalThis.fetch = original;
    }

    expect(sent).not.toBeNull();
    expect(sent!.reasoning_effort).toBe('none');
    // Die Flags, die Scaleway laut eigener Doku NICHT unterstützt, schicken wir
    // nicht mit — sie wurden gemessen ignoriert und lieferten leeren Inhalt.
    expect(sent!.chat_template_kwargs).toBeUndefined();
    expect(sent!.think).toBeUndefined();
  });

  it('lässt Nicht-Chat-Bodies unangetastet', async () => {
    let seen: string | null = null;
    const original = globalThis.fetch;
    globalThis.fetch = ((_input: unknown, init?: RequestInit) => {
      seen = String(init?.body);
      return Promise.resolve(new Response('{}', { status: 200 }));
    }) as typeof fetch;

    try {
      await scalewayFetchWithThinkingDisabled('https://example.invalid/files', {
        method: 'POST',
        body: 'nicht-json',
      });
    } finally {
      globalThis.fetch = original;
    }

    expect(seen).toBe('nicht-json');
  });

  it('heavy zeigt auf die Scaleway-Lane', () => {
    expect(intermediateLane('heavy')).toEqual({
      provider: 'scaleway',
      model: 'gemma-4-26b-a4b-it',
    });
  });
});

describe('KNOWN_PROVIDERS deckt jeden ProviderName ab', () => {
  it.each(ALL_PROVIDERS)('%s wird nicht still nach mistral degradiert', (provider) => {
    expect(KNOWN_PROVIDERS).toContain(provider);
    // Doppelter Boden: selbst wenn KNOWN je wieder auseinanderläuft, muss die
    // Normalisierung den Namen auf sich selbst abbilden.
    expect(normalizeProviderName(provider)).toBe(provider);
  });
});
