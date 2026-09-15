/**
 * Der Schalter des Loop-Reranks ist ein Default-AUS-Flag und damit das
 * Gegenteil der beiden anderen in derselben Datei. Genau das wird hier
 * gepinnt: ein versehentliches `!== 'false'` würde den Cross-Encoder
 * unbemerkt in JEDE Dokumentsuche des Chats hängen — inklusive der geteilten
 * GreenPT-Quote (600 Anfragen / 15 min pro Konto).
 */
import { afterEach, describe, expect, it } from 'vitest';

import { isAgenticLoopEnabled, isLoopRerankEnabled } from './flags.js';

const originalRerank = process.env.LOOP_RERANK_ENABLED;
const originalLoop = process.env.CHAT_AGENT_LOOP;

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  restore('LOOP_RERANK_ENABLED', originalRerank);
  restore('CHAT_AGENT_LOOP', originalLoop);
});

describe('isLoopRerankEnabled', () => {
  it('ist ohne gesetzte Variable aus', () => {
    delete process.env.LOOP_RERANK_ENABLED;
    expect(isLoopRerankEnabled()).toBe(false);
  });

  it('ist nur bei genau "true" an', () => {
    process.env.LOOP_RERANK_ENABLED = 'true';
    expect(isLoopRerankEnabled()).toBe(true);
  });

  it('bleibt bei jedem anderen Wert aus — auch bei "1" und bei leer', () => {
    process.env.LOOP_RERANK_ENABLED = '1';
    expect(isLoopRerankEnabled()).toBe(false);
    process.env.LOOP_RERANK_ENABLED = '';
    expect(isLoopRerankEnabled()).toBe(false);
    process.env.LOOP_RERANK_ENABLED = 'false';
    expect(isLoopRerankEnabled()).toBe(false);
  });

  it('lässt den Loop-Schalter daneben unberührt — der bleibt Default AN', () => {
    delete process.env.CHAT_AGENT_LOOP;
    delete process.env.LOOP_RERANK_ENABLED;
    expect(isAgenticLoopEnabled()).toBe(true);
    expect(isLoopRerankEnabled()).toBe(false);
  });
});
