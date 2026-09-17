/**
 * `text_uebersetzen` against an injected facade — no DeepL, no Redis, no key.
 */
import { describe, expect, it, vi } from 'vitest';

import { DeepLError } from '../../../services/translation/DeepLService.js';
import { TranslationQuotaExceededError } from '../../../services/translation/translationQuota.js';

import { makeTranslateTool } from './translationTools.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

type ToolResult = Record<string, unknown>;

const state = { agentConfig: { userId: 'u1' } } as unknown as ChatGraphState;
const opts = { toolCallId: 't1', messages: [] };

async function run(tool: ReturnType<typeof makeTranslateTool>, input: Record<string, unknown>) {
  return (await tool.execute!(input, opts)) as ToolResult;
}

describe('text_uebersetzen', () => {
  it('passes the arguments through and maps the result to German keys', async () => {
    const translate = vi.fn().mockResolvedValue({
      text: 'Hello world',
      detectedSourceLang: 'de',
      targetLang: 'EN-GB',
      billedCharacters: 10,
      glossaryApplied: true,
      quota: { used: 10, limit: 200000 },
    });
    const tool = makeTranslateTool({ state, translate });

    const result = await run(tool, {
      text: 'Hallo Welt',
      zielsprache: 'EN-GB',
      quellsprache: 'DE',
      formalitaet: 'less',
    });

    expect(translate).toHaveBeenCalledWith({
      userId: 'u1',
      text: 'Hallo Welt',
      targetLang: 'EN-GB',
      sourceLang: 'DE',
      formality: 'less',
    });
    expect(result).toEqual({
      uebersetzung: 'Hello world',
      erkannteQuellsprache: 'de',
      zielsprache: 'EN-GB',
      zeichen: 10,
      glossarAngewendet: true,
    });
  });

  it('leaves source and formality to DeepL when the model omits them', async () => {
    const translate = vi.fn().mockResolvedValue({
      text: 'x',
      detectedSourceLang: 'en',
      targetLang: 'DE',
      billedCharacters: 1,
      glossaryApplied: false,
      quota: { used: 1, limit: 1 },
    });
    await run(makeTranslateTool({ state, translate }), { text: 'x', zielsprache: 'DE' });
    expect(translate).toHaveBeenCalledWith(
      expect.objectContaining({ sourceLang: null, formality: null })
    );
  });

  it('returns the budget refusal as a readable error instead of throwing', async () => {
    const translate = vi
      .fn()
      .mockRejectedValue(new TranslationQuotaExceededError({ used: 200000, limit: 200000 }));
    const result = await run(makeTranslateTool({ state, translate }), {
      text: 'x',
      zielsprache: 'DE',
    });
    expect(result.error).toMatch(/Tagesbudget/);
  });

  it('turns a DeepL outage into a German sentence', async () => {
    const translate = vi.fn().mockRejectedValue(new DeepLError('DeepL 503: down', 503));
    const result = await run(makeTranslateTool({ state, translate }), {
      text: 'x',
      zielsprache: 'DE',
    });
    expect(result.error).toMatch(/nicht erreichbar/);
  });

  it('refuses without a user session', async () => {
    const translate = vi.fn();
    const result = await run(
      makeTranslateTool({ state: {} as unknown as ChatGraphState, translate }),
      { text: 'x', zielsprache: 'DE' }
    );
    expect(result.error).toMatch(/Sitzung/);
    expect(translate).not.toHaveBeenCalled();
  });
});
