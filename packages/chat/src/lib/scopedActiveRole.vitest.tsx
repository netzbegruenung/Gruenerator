import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { ChatSurfaceProvider } from '../context/ChatSurfaceContext';
import { useChatConfigStore } from '../stores/chatConfigStore';
import { useUserProfileStore } from '../stores/userProfileStore';

import { useScopedSetActiveRole } from './useScopedAgentState';

import type { ReactNode } from 'react';

/**
 * Die Konto-Voreinstellung darf nicht aus einer eingebetteten Fläche heraus
 * geschrieben werden — Docs, Boards, Sheets und Präsentationen halten ihren
 * Rollenzustand bewusst bei sich.
 *
 * Heute ist der Pfad dorthin unsichtbar, weil alle vier `showToolToggles={false}`
 * setzen und `includeModes` das Rollen-Untermenü mit verbirgt. Das ist ein
 * fremdes UI-Flag, keine Bereichsprüfung: diese Zusicherungen halten die
 * Trennung fest, auch wenn eine künftige Fläche die Werkzeug-Schalter braucht.
 */

const LGS = { ebene: 'land', rolle: 'Mitarbeiter*in Landesgeschäftsstelle' };

function surfaceWrapper({ children }: { children: ReactNode }) {
  return <ChatSurfaceProvider>{children}</ChatSurfaceProvider>;
}

let persistActiveRole: Mock;

beforeEach(() => {
  useUserProfileStore.getState().reset();
  persistActiveRole = vi.fn();
  useChatConfigStore.setState({ persistActiveRole });
});

describe('useScopedSetActiveRole', () => {
  it('schreibt ohne aktive Fläche die Konto-Voreinstellung', () => {
    const { result } = renderHook(() => useScopedSetActiveRole());

    result.current(LGS);

    expect(persistActiveRole).toHaveBeenCalledWith(LGS);
    expect(useUserProfileStore.getState().activeRole).toEqual(LGS);
  });

  it('schreibt in einer eingebetteten Fläche nichts', () => {
    const { result } = renderHook(() => useScopedSetActiveRole(), { wrapper: surfaceWrapper });

    result.current(LGS);

    expect(persistActiveRole).not.toHaveBeenCalled();
    expect(useUserProfileStore.getState().activeRole).toBeNull();
    // Und „nie gewählt" bleibt „nie gewählt": sonst verlöre die Person die
    // Vorauswahl ihrer einzigen Rolle durch einen Klick im Dokumenten-Chat.
    expect(useUserProfileStore.getState().hasChosenRole).toBe(false);
  });

  it('behält die Identität über Renders — der Aufrufer merkt sich sie', () => {
    const { result, rerender } = renderHook(() => useScopedSetActiveRole(), {
      wrapper: surfaceWrapper,
    });
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
