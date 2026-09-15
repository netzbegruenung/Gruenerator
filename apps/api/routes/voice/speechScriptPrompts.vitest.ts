/**
 * The script prompts are the whole feature: the lane only decides WHO writes,
 * this decides WHAT is asked for. Two things are worth guarding — that an empty
 * optional field never reaches the model as a placeholder to invent around, and
 * that an Austrian request does not get German organisational vocabulary.
 */
import { describe, it, expect } from 'vitest';

import { buildScriptPrompt } from './speechScriptPrompts.js';

describe('buildScriptPrompt', () => {
  it('asks for speakable text in every preset', () => {
    for (const body of [
      { preset: 'mailbox' as const, organisation: 'Büro', tone: 'freundlich' as const },
      { preset: 'vorlesefassung' as const, sourceText: 'Ein Antrag.' },
      { preset: 'audiodeskription' as const, visualDescription: 'Ein Plakat.' },
    ]) {
      const { system } = buildScriptPrompt(body, 'de-DE');
      expect(system).toMatch(/VORGELESEN/);
      expect(system).toMatch(/Keine Überschriften/);
    }
  });

  it('carries the filled mailbox fields and omits the empty ones', () => {
    const { prompt } = buildScriptPrompt(
      {
        preset: 'mailbox',
        organisation: 'Grünes Büro Musterstadt',
        person: null,
        reachability: 'Montag bis Donnerstag',
        alternative: '   ',
        tone: 'sachlich',
      },
      'de-DE'
    );

    expect(prompt).toContain('Grünes Büro Musterstadt');
    expect(prompt).toContain('Montag bis Donnerstag');
    // A labelled but empty line invites the model to fill the gap itself.
    expect(prompt).not.toMatch(/Name der Person/);
    expect(prompt).not.toMatch(/Alternative/);
  });

  it('picks the tone the person chose', () => {
    const friendly = buildScriptPrompt(
      { preset: 'mailbox', organisation: 'Büro', tone: 'freundlich' },
      'de-DE'
    ).system;
    const plain = buildScriptPrompt(
      { preset: 'mailbox', organisation: 'Büro', tone: 'sachlich' },
      'de-DE'
    ).system;

    expect(friendly).toMatch(/Freundlich und einladend/);
    expect(plain).toMatch(/Sachlich und knapp/);
  });

  it('keeps German organisational vocabulary out of an Austrian greeting', () => {
    const at = buildScriptPrompt(
      { preset: 'mailbox', organisation: 'Grüner Klub', tone: 'freundlich' },
      'de-AT'
    ).system;
    const de = buildScriptPrompt(
      { preset: 'mailbox', organisation: 'Grünes Büro', tone: 'freundlich' },
      'de-DE'
    ).system;

    expect(at).toMatch(/Österreich/);
    expect(at).toMatch(/Bezirksorganisation/);
    expect(de).not.toMatch(/Österreich/);
  });

  it('tells the vorlesefassung not to shorten', () => {
    const { system, prompt } = buildScriptPrompt(
      { preset: 'vorlesefassung', sourceText: 'Der volle Antragstext.' },
      'de-DE'
    );

    expect(system).toMatch(/NICHT tust: kürzen/);
    expect(prompt).toContain('Der volle Antragstext.');
  });

  it('holds the audiodeskription to observation, not interpretation', () => {
    const { system, prompt } = buildScriptPrompt(
      {
        preset: 'audiodeskription',
        visualDescription: 'Zwei Menschen vor einem Windrad.',
        context: 'Instagram',
      },
      'de-DE'
    );

    expect(system).toMatch(/Deute nicht/);
    expect(prompt).toContain('Zwei Menschen vor einem Windrad.');
    expect(prompt).toContain('Instagram');
  });
});
