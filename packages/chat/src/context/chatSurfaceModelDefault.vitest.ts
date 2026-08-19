/**
 * Die Editor-Seitenleisten (Board, Tabelle, Präsentation, Dokument) bekommen
 * ihren eigenen Surface-Store. Startete `selectedModel` dort auf `null`, war das
 * für den Modellwähler kein bekanntes Modell — er fiel auf den ERSTEN
 * Katalogeintrag zurück („Klein") und schrieb ihn per Effekt zurück in den
 * Store. Ergebnis: jede Seitenleiste stand nach jedem Reload auf Klein, obwohl
 * „Automatisch" überall die Vorgabe ist.
 */
import { describe, expect, it } from 'vitest';

import { AUTO_MODEL_ID } from '../lib/resolveAutoModel';

import { createChatSurfaceStore } from './ChatSurfaceContext';

describe('createChatSurfaceStore — Modellvorgabe', () => {
  it('startet ohne Vorgaben auf Automatisch', () => {
    expect(createChatSurfaceStore().getState().selectedModel).toBe(AUTO_MODEL_ID);
  });

  it('startet auch auf Automatisch, wenn Vorgaben ohne Modell kommen', () => {
    const store = createChatSurfaceStore({ selectedAgentId: 'board-agent', threadMode: 'chat' });
    expect(store.getState().selectedModel).toBe(AUTO_MODEL_ID);
  });

  it('respektiert eine ausdrückliche Modellvorgabe', () => {
    const store = createChatSurfaceStore({ selectedModel: 'gruenerator-ultra' });
    expect(store.getState().selectedModel).toBe('gruenerator-ultra');
  });

  it('behält eine Auswahl innerhalb der Sitzung', () => {
    const store = createChatSurfaceStore();
    store.getState().setSelectedModel('gruenerator-small');
    expect(store.getState().selectedModel).toBe('gruenerator-small');
  });
});
