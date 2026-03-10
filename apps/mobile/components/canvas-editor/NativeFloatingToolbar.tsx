import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { View, Pressable, StyleSheet, Text } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInUp, SlideOutUp } from 'react-native-reanimated';

import { useCanvasEditorBridgeStore } from '../../stores/canvasEditorBridgeStore';

import { NativeColorPicker } from './NativeColorPicker';

import type { ToolbarAction } from './types';

function ToolbarButton({
  icon,
  onPress,
  disabled,
  label,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  label: string;
  color?: string;
}) {
  return (
    <Pressable
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Ionicons name={icon} size={22} color={disabled ? '#9CA3AF' : color || '#374151'} />
    </Pressable>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

export function NativeFloatingToolbar() {
  const selectedElement = useCanvasEditorBridgeStore((s) => s.selectedElement);
  const history = useCanvasEditorBridgeStore((s) => s.history);
  const dispatchAction = useCanvasEditorBridgeStore((s) => s.dispatchAction);

  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

  const dispatch = useCallback(
    (action: ToolbarAction) => {
      dispatchAction(action);
    },
    [dispatchAction]
  );

  const handleColorSelect = useCallback(
    (color: string) => {
      dispatch({ type: 'colorChange', color });
      setIsColorPickerOpen(false);
    },
    [dispatch]
  );

  const hasElement = selectedElement !== null;
  const elementType = selectedElement?.type;
  const showColor =
    elementType === 'text' ||
    elementType === 'shape' ||
    elementType === 'icon' ||
    elementType === 'illustration' ||
    elementType === 'asset' ||
    (elementType === 'image' && selectedElement?.fill !== undefined) ||
    (elementType === 'background' && selectedElement?.fill !== undefined);
  const showFontSize = elementType === 'text';
  const currentColor = selectedElement?.fill || selectedElement?.color || '#000000';

  return (
    <>
      <Animated.View
        style={styles.container}
        entering={SlideInUp.duration(200).springify()}
        exiting={SlideOutUp.duration(150)}
      >
        <View style={styles.toolbar}>
          {/* Undo / Redo — always visible */}
          <ToolbarButton
            icon="arrow-undo"
            onPress={() => dispatch({ type: 'undo' })}
            disabled={!history.canUndo}
            label="Rückgängig"
          />
          <ToolbarButton
            icon="arrow-redo"
            onPress={() => dispatch({ type: 'redo' })}
            disabled={!history.canRedo}
            label="Wiederholen"
          />

          {/* Layer controls — when element selected */}
          {hasElement && (
            <>
              <Divider />
              <ToolbarButton
                icon="layers-outline"
                onPress={() => dispatch({ type: 'moveLayer', direction: 'up' })}
                disabled={!selectedElement.canMoveUp}
                label="Ebene nach oben"
              />
              <ToolbarButton
                icon="layers-outline"
                onPress={() => dispatch({ type: 'moveLayer', direction: 'down' })}
                disabled={!selectedElement.canMoveDown}
                label="Ebene nach unten"
              />
            </>
          )}

          {/* Color picker trigger */}
          {showColor && (
            <>
              <Divider />
              <Pressable
                style={styles.colorButton}
                onPress={() => setIsColorPickerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Farbe ändern"
              >
                <View style={[styles.colorSwatch, { backgroundColor: currentColor }]} />
              </Pressable>
            </>
          )}

          {/* Font size controls */}
          {showFontSize && (
            <>
              <Divider />
              <ToolbarButton
                icon="remove-outline"
                onPress={() => dispatch({ type: 'fontSizeChange', delta: -2 })}
                label="Schrift kleiner"
              />
              <Text style={styles.fontSizeLabel}>{selectedElement?.fontSize ?? '–'}</Text>
              <ToolbarButton
                icon="add-outline"
                onPress={() => dispatch({ type: 'fontSizeChange', delta: 2 })}
                label="Schrift größer"
              />
            </>
          )}
        </View>
      </Animated.View>

      <NativeColorPicker
        isOpen={isColorPickerOpen}
        onClose={() => setIsColorPickerOpen(false)}
        onColorSelect={handleColorSelect}
        currentColor={currentColor}
        mode={elementType === 'text' ? 'font' : 'brand'}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    zIndex: 50,
    alignItems: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    gap: 2,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.35,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 4,
  },
  colorButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  fontSizeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    minWidth: 28,
    textAlign: 'center',
  },
});
