import { parseSharepicChatProps, type SharepicSpec } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useCallback, useMemo } from 'react';
import { create } from 'zustand';

import { notifyError } from '../lib/notify';
import { type SharepicDesignChoice } from '../lib/sharepicDesign';
import { useChatConfigStore } from '../stores/chatConfigStore';
import { useAgentStore } from '../stores/chatStore';

import type { SharepicVariant } from './useChatGraphStream';

interface Picked {
  /** The spec the choices apply to: the variant's as it was when the first one was made. */
  base: SharepicSpec;
  choice: SharepicDesignChoice;
}

/** Shared by the inline card and the docked panel, which render the same variant. */
const useDesignStore = create<{
  picked: Record<string, Picked>;
  pick: (variantId: string, picked: Picked) => void;
}>((set) => ({
  picked: {},
  pick: (variantId, picked) => set((s) => ({ picked: { ...s.picked, [variantId]: picked } })),
}));

/** The variant's props with another spec, for the card and every page of a carousel. */
export function withCreatorSpec(
  props: Record<string, unknown>,
  spec: SharepicSpec | null
): Record<string, unknown> {
  return spec ? { ...props, creatorSpec: spec } : props;
}

/**
 * Design variations of a creator sharepic on its chat card. Each choice
 * re-renders locally and is stored on the variant, so the next chat edit and
 * a reload start from it. Not for template sharepics, and not once the card
 * has been opened in the editor: its canvas is then what it shows.
 */
export function useSharepicDesign(variant: SharepicVariant, canvasId: string | null) {
  const design = useChatConfigStore((s) => s.sharepicDesign);
  const picked = useDesignStore((s) => s.picked[variant.id]);
  const drafted = useMemo(
    () => parseSharepicChatProps(variant.initialProps)?.creatorSpec ?? null,
    [variant.initialProps]
  );
  const base = picked?.base ?? drafted;
  const choice = useMemo(() => picked?.choice ?? {}, [picked]);
  const enabled = !!design && !!base && !canvasId;

  const spec = useMemo(
    () => (enabled && base && Object.keys(choice).length ? design.apply(base, choice) : null),
    [enabled, base, choice, design]
  );
  const tweaks = useMemo(
    () => (enabled && base ? design.tweaks(base, choice) : []),
    [enabled, base, choice, design]
  );

  const show = useCallback(
    (next: SharepicDesignChoice) => {
      if (!enabled || !base) return;
      useDesignStore.getState().pick(variant.id, { base, choice: next });
      const threadId = useAgentStore.getState().currentThreadId;
      if (!threadId) return;
      void getContractsClient()
        .threads.updateSharepicVariant({
          params: { threadId, variantId: variant.id },
          body: { creatorSpec: design.apply(base, next) },
        })
        .then((res) => {
          if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        })
        .catch((err) => {
          console.warn('[useSharepicDesign] Speichern fehlgeschlagen:', err);
          notifyError('Die Gestaltung konnte nicht gespeichert werden');
        });
    },
    [enabled, base, design, variant.id]
  );

  return {
    tweaks,
    /** The spec to render instead of the stored one; null when nothing was switched. */
    spec,
    tweaked: spec !== null,
    choose: useCallback(
      (id: string, value: string) => show({ ...choice, [id]: value }),
      [show, choice]
    ),
    reset: useCallback(() => show({}), [show]),
  };
}
