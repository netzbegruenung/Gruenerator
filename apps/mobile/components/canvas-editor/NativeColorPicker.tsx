import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { useCallback, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

// Brand colors duplicated from packages/canvas-editor/src/utils/shapes.ts
// Static arrays that rarely change — avoids cross-package web dependency
const BRAND_COLORS = [
  { id: 'tanne', name: 'Tanne', value: '#005538' },
  { id: 'klee', name: 'Klee', value: '#008939' },
  { id: 'grashalm', name: 'Grashalm', value: '#8ABD24' },
  { id: 'himmel', name: 'Himmel', value: '#0BA1DD' },
  { id: 'sand', name: 'Sand', value: '#F5F1E9' },
  { id: 'hellgruen', name: 'Hellgrün', value: '#6CCD87' },
  { id: 'dunkelgrau', name: 'Dunkelgrau', value: '#2E2E3D' },
  { id: 'white', name: 'Weiß', value: '#FFFFFF' },
  { id: 'black', name: 'Schwarz', value: '#000000' },
];

const FONT_COLORS = [
  { id: 'black', name: 'Schwarz', value: '#000000' },
  { id: 'white', name: 'Weiß', value: '#FFFFFF' },
  { id: 'tanne', name: 'Tanne', value: '#005538' },
  { id: 'sand', name: 'Sand', value: '#F5F1E9' },
  { id: 'klee', name: 'Klee', value: '#008939' },
];

interface NativeColorPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onColorSelect: (color: string) => void;
  currentColor: string;
  mode?: 'brand' | 'font';
}

export function NativeColorPicker({
  isOpen,
  onClose,
  onColorSelect,
  currentColor,
  mode = 'brand',
}: NativeColorPickerProps) {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const colors = mode === 'font' ? FONT_COLORS : BRAND_COLORS;

  const handleSelect = useCallback(
    (color: string) => {
      onColorSelect(color);
      bottomSheetRef.current?.close();
    },
    [onColorSelect]
  );

  if (!isOpen) return null;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      snapPoints={['30%']}
      enablePanDownToClose
      onClose={onClose}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetView style={styles.content}>
        <Text style={styles.title}>Farbe wählen</Text>
        <View style={styles.grid}>
          {colors.map((color) => {
            const isSelected = currentColor === color.value;
            return (
              <Pressable
                key={color.id}
                style={[styles.swatch, isSelected && styles.swatchSelected]}
                onPress={() => handleSelect(color.value)}
                accessibilityRole="button"
                accessibilityLabel={color.name}
                accessibilityState={{ selected: isSelected }}
              >
                <View
                  style={[
                    styles.swatchInner,
                    { backgroundColor: color.value },
                    color.value === '#FFFFFF' && styles.swatchWhiteBorder,
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  handleIndicator: {
    backgroundColor: '#D1D5DB',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    padding: 3,
  },
  swatchSelected: {
    borderWidth: 2,
    borderColor: '#005538',
    padding: 1,
  },
  swatchInner: {
    flex: 1,
    borderRadius: 20,
  },
  swatchWhiteBorder: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
});
