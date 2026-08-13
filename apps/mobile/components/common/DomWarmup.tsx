import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDomWarmupStore } from '../../stores/domWarmupStore';
import DocEditorDOM from '../docs/DocEditorDOM';

import type { ReactNode } from 'react';

/** Delay after the first interactions settle, so app start keeps the CPU. */
const START_DELAY_MS = 2000;
/** Move on even if `onWarm` never arrives (bundle error, offline, slow device). */
const GIVE_UP_MS = 30000;

const noop = async () => {};

interface WarmupTarget {
  /** Stable id — screens use it in `completeDomWarmup(id)`. */
  id: string;
  /**
   * Render the DOM component in warmup mode. It must be the SAME component the
   * screen renders later: every `use dom` file gets its own bundle, so a
   * stand-in would warm a bundle nobody goes on to use.
   */
  render: (onWarm: () => Promise<void>) => ReactNode;
}

/**
 * The `use dom` components worth preloading, warmed one after another.
 *
 * Worth adding: heavy web dependencies behind a screen the user opens by hand
 * (editors, viewers). Not worth adding: small DOM components that mount as part
 * of content anyway — warming those spends a WebView boot to save little.
 */
const TARGETS: WarmupTarget[] = [
  {
    id: 'docs-editor',
    render: (onWarm) => (
      <DocEditorDOM
        warmup
        onWarm={onWarm}
        documentId=""
        authToken=""
        userId=""
        userName=""
        userEmail=""
        initialTitle=""
        hocuspocusUrl=""
        apiBaseUrl=""
        colorScheme="light"
        onConnectionStatusChange={noop}
        onTitleChange={noop}
        onCanEditChange={noop}
        onDocumentLoaded={noop}
        onChatMessagesChange={noop}
        onLocalUserIdChange={noop}
        onTypingUsersChange={noop}
        pendingAction={null}
        actionCounter={0}
        dom={{ scrollEnabled: false, style: { width: 1, height: 1 } }}
      />
    ),
  },
];

/**
 * Preloads `use dom` components off screen.
 *
 * A DOM component is slow exactly once per app start: the first mount boots the
 * WebView (Chromium provider plus a sandboxed renderer process) and then parses
 * that component's bundle — for the docs editor that is BlockNote, ProseMirror,
 * Yjs and their CSS. Everything afterwards is much quicker, because the WebView
 * process and the compiled bundle are already there. So the user paid several
 * seconds of skeleton the first time they opened a document.
 *
 * This does that work a couple of seconds after the app has settled, in a 1×1
 * off-screen view, with the component's `warmup` flag set so it stops before any
 * network or editor work. Targets are warmed one at a time and each is dropped
 * as soon as it reports back; opening the real screen retires its target too, so
 * a hidden instance never competes with the one on screen.
 *
 * Mounted once, at the app root, for signed-in users.
 */
export function DomWarmup() {
  const started = useDomWarmupStore((s) => s.started);
  const done = useDomWarmupStore((s) => s.done);
  const current = started ? TARGETS.find((t) => !done.includes(t.id)) : undefined;

  useEffect(() => {
    if (started) return;
    const timer = setTimeout(() => useDomWarmupStore.getState().start(), START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [started]);

  useEffect(() => {
    if (!current) return;
    const id = current.id;
    const timer = setTimeout(() => useDomWarmupStore.getState().complete(id), GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [current]);

  if (!current) return null;

  return (
    <View style={styles.offscreen} pointerEvents="none" accessibilityElementsHidden>
      {current.render(async () => useDomWarmupStore.getState().complete(current.id))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Off screen rather than `display: none` or zero-sized: the WebView has to be
  // laid out to load its page at all.
  offscreen: {
    position: 'absolute',
    left: -10000,
    top: 0,
    width: 1,
    height: 1,
    opacity: 0,
  },
});
