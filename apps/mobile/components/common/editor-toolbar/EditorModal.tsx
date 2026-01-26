/**
 * EditorModal Component
 * Reusable bottom sheet modal for editor tools
 * Used by image-studio and subtitle-editor for consistent modal behavior
 */

import {
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
  useCallback,
  type ReactNode,
} from 'react';
import { StyleSheet, useColorScheme, Keyboard } from 'react-native';
import BottomSheet, { BottomSheetScrollView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, lightTheme, darkTheme } from '../../../theme';

export interface EditorModalRef {
  open: () => void;
  close: () => void;
  snapToIndex: (index: number) => void;
}

export interface EditorModalProps {
  /** Content to render inside the modal */
  children: ReactNode;
  /** Callback when modal closes */
  onClose: () => void;
  /** Snap points for the bottom sheet (default: ['35%', '50%']) */
  snapPoints?: (string | number)[];
  /** Whether to enable pan down to close (default: true) */
  enablePanDownToClose?: boolean;
  /** Keyboard behavior (default: 'interactive') */
  keyboardBehavior?: 'interactive' | 'extend' | 'fillParent';
}

export const EditorModal = forwardRef<EditorModalRef, EditorModalProps>(function EditorModal(
  {
    children,
    onClose,
    snapPoints: customSnapPoints,
    enablePanDownToClose = true,
    keyboardBehavior = 'interactive',
  },
  ref
) {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();

  const snapPoints = useMemo(() => customSnapPoints ?? ['35%', '50%'], [customSnapPoints]);

  useImperativeHandle(ref, () => ({
    open: () => {
      bottomSheetRef.current?.snapToIndex(snapPoints.length - 1);
    },
    close: () => {
      Keyboard.dismiss();
      bottomSheetRef.current?.close();
    },
    snapToIndex: (index: number) => {
      bottomSheetRef.current?.snapToIndex(index);
    },
  }));

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        pressBehavior="close"
      />
    ),
    []
  );

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose={enablePanDownToClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: theme.background }}
      handleIndicatorStyle={{ backgroundColor: theme.border }}
      keyboardBehavior={keyboardBehavior}
      keyboardBlurBehavior="restore"
      onChange={handleSheetChange}
    >
      <BottomSheetScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.large }]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </BottomSheetScrollView>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.medium,
  },
});
