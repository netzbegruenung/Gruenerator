import { useAui, useAuiEvent } from '@assistant-ui/react-native';
import { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import { View, type FlatList, type LayoutChangeEvent, type ViewProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { spacing } from '../../theme';

import type { ThreadMessage } from '@assistant-ui/react-native';

/** Room left above the anchored question, so it does not touch the list's top edge. */
const ANCHOR_GAP = spacing.small;

type ReportCell = (index: number, y: number, height: number) => void;

const CellLayoutContext = createContext<ReportCell | null>(null);

type MessageCellProps = ViewProps & { index: number; cellKey?: string; item?: unknown };

/**
 * FlatList cell that reports where it sits in the content. The list knows these
 * frames but does not expose them, and the anchor needs the question's offset and
 * the bottom of the last row.
 */
function MessageCell({
  index,
  cellKey: _cellKey,
  item: _item,
  onLayout,
  ...props
}: MessageCellProps) {
  const report = useContext(CellLayoutContext);
  const handleLayout = (event: LayoutChangeEvent) => {
    report?.(index, event.nativeEvent.layout.y, event.nativeEvent.layout.height);
    onLayout?.(event);
  };
  return <View {...props} onLayout={handleLayout} />;
}

/**
 * ChatGPT's turn layout for the message list. A sent question scrolls to the top
 * of the list and the answer streams in below it, without the list following the
 * text; the reader scrolls on when they want to.
 *
 * Scrolling the question to the top needs content below it at least one viewport
 * tall, which a fresh answer does not have yet. The footer makes up the
 * difference and shrinks as the answer grows, like the min-height web gives the
 * last turn. Its height is a shared value, so a streamed token resizes it without
 * a React render.
 *
 * A thread opens at its newest message: the list starts rendering there
 * (`initialScrollIndex`, set by AssistantThread) and stays pinned to its end
 * while measured rows replace estimated heights, until the reader drags or sends. The
 * primitive's own `scrollToBottomOnInitialize` cannot do this: when the history
 * arrives after the list mounted, it settles on the empty list's content size
 * and scrolls to 0 (@assistant-ui/react-native 0.1.44 to 0.1.47).
 */
export function useTurnAnchor() {
  const aui = useAui();
  const listRef = useRef<FlatList<ThreadMessage>>(null);
  const footerHeight = useSharedValue(0);
  const state = useRef({
    anchorIndex: -1,
    pendingScroll: false,
    pinnedToEnd: true,
    viewportHeight: 0,
    contentHeight: 0,
    cells: new Map<number, { y: number; height: number }>(),
  });

  const update = useCallback(() => {
    const s = state.current;
    if (s.anchorIndex < 0 || s.viewportHeight === 0) return;
    const anchor = s.cells.get(s.anchorIndex);
    const last = s.cells.get(aui.thread.getState().messages.length - 1);
    if (!anchor || !last) return;
    const top = Math.max(0, anchor.y - ANCHOR_GAP);
    const turn = last.y + last.height - top;
    const footer = Math.max(0, Math.ceil(s.viewportHeight - turn));
    const resized = footer !== footerHeight.get();
    if (resized) footerHeight.set(footer);
    // A resized footer has to be laid out before the list can reach the offset,
    // so that scroll waits for onFooterLayout.
    if (s.pendingScroll && !resized) {
      s.pendingScroll = false;
      listRef.current?.scrollToOffset({ offset: top, animated: true });
    }
  }, [aui, footerHeight]);

  const reportCell = useCallback<ReportCell>(
    (index, y, height) => {
      state.current.cells.set(index, { y, height });
      update();
    },
    [update]
  );

  const onFooterLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const s = state.current;
      const anchor = s.cells.get(s.anchorIndex);
      if (!s.pendingScroll || !anchor || event.nativeEvent.layout.height < footerHeight.get()) {
        return;
      }
      s.pendingScroll = false;
      listRef.current?.scrollToOffset({
        offset: Math.max(0, anchor.y - ANCHOR_GAP),
        animated: true,
      });
    },
    [footerHeight]
  );

  const scrollToEndIfPinned = useCallback(() => {
    const s = state.current;
    if (!s.pinnedToEnd || s.viewportHeight === 0 || aui.thread.getState().messages.length === 0) {
      return;
    }
    listRef.current?.scrollToOffset({
      offset: Math.max(0, s.contentHeight - s.viewportHeight),
      animated: false,
    });
  }, [aui]);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      state.current.viewportHeight = event.nativeEvent.layout.height;
      scrollToEndIfPinned();
      update();
    },
    [scrollToEndIfPinned, update]
  );

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      state.current.contentHeight = height;
      scrollToEndIfPinned();
    },
    [scrollToEndIfPinned]
  );

  // `initialScrollIndex` lands on rows the list has not measured yet; without
  // getItemLayout that is reported here, and the estimated end is close enough
  // for the pin to correct.
  const onScrollToIndexFailed = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: false });
  }, []);

  const onScrollBeginDrag = useCallback(() => {
    state.current.pinnedToEnd = false;
  }, []);

  useAuiEvent('thread.runStart', () => {
    const messages = aui.thread.getState().messages;
    const s = state.current;
    s.pinnedToEnd = false;
    // An edit or regenerate truncates the thread; rows past it are gone.
    for (const index of s.cells.keys()) if (index >= messages.length) s.cells.delete(index);
    s.anchorIndex = messages.findLastIndex((m) => m.role === 'user');
    s.pendingScroll = s.anchorIndex >= 0;
    update();
  });

  useAuiEvent('threads.selectionChanged', () => {
    const s = state.current;
    s.anchorIndex = -1;
    s.pendingScroll = false;
    s.pinnedToEnd = true;
    s.cells.clear();
    footerHeight.set(0);
  });

  const footerStyle = useAnimatedStyle(() => ({ height: footerHeight.get() }));
  const footer = useMemo(
    () => <Animated.View style={footerStyle} onLayout={onFooterLayout} />,
    [footerStyle, onFooterLayout]
  );

  return {
    listRef,
    onLayout,
    onContentSizeChange,
    onScrollBeginDrag,
    onScrollToIndexFailed,
    footer,
    reportCell,
  };
}

export const TurnAnchorCellProvider = CellLayoutContext.Provider;
export { MessageCell };
