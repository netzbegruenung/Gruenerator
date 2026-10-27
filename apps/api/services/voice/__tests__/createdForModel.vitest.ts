/**
 * What a call's agent hears back from a creating tool. The call's own wording
 * leads (the card is about to appear, no edits in the call), but a warning in
 * the chat tool's note must still reach the agent.
 */
import { describe, expect, it } from 'vitest';

import { VOICE_CREATED_NOTE, createdForModel } from '../voicePort.js';

const ARTIFACT = { kind: 'pdf' as const, title: 'Antrag', url: null, messageId: 'm-1' };

describe('createdForModel', () => {
  it('keeps a warning from the chat note behind the call note', () => {
    const out = createdForModel(
      { note: 'ACHTUNG: … eine NEUANLAGE aus deinem Auftrag, keine Überarbeitung.' },
      ARTIFACT
    );
    expect(out).toEqual({
      ok: true,
      erstellt: 'Antrag',
      note: `${VOICE_CREATED_NOTE} Hinweis des Werkzeugs: ACHTUNG: … eine NEUANLAGE aus deinem Auftrag, keine Überarbeitung.`,
    });
  });

  it('gives only the call note when the tool has none', () => {
    expect(createdForModel({}, ARTIFACT)).toEqual({
      ok: true,
      erstellt: 'Antrag',
      note: VOICE_CREATED_NOTE,
    });
  });

  it('passes the reason through when nothing was created', () => {
    expect(
      createdForModel({ error: 'zu lang', note: 'Es wurde KEIN Explainable erstellt.' }, null)
    ).toEqual({ ok: false, error: 'zu lang', note: 'Es wurde KEIN Explainable erstellt.' });
  });
});
