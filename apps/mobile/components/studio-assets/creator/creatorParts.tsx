import { sameColor, type SolidSwatch } from '@gruenerator/shared/stickers';
import { Canvas, Image, Rect, type SkImage } from '@shopify/react-native-skia';
import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';

import { useTheme } from '../../../hooks/useTheme';
import { borderRadius, colors, spacing, typography } from '../../../theme';

/** What a designer hands to the save step. */
export interface StickerDraft {
  image: SkImage;
  suggestedTitle: string;
}

const CELL = 12;
const PREVIEW_MAX = 360;

export function usePreviewSize(): number {
  const { width } = useWindowDimensions();
  return Math.min(width - spacing.medium * 2, PREVIEW_MAX);
}

function Checkerboard({ size, dark }: { size: number; dark: boolean }) {
  const count = Math.ceil(size / CELL);
  const cells: { x: number; y: number }[] = [];
  for (let row = 0; row < count; row++)
    for (let col = row % 2; col < count; col += 2) cells.push({ x: col * CELL, y: row * CELL });
  return (
    <>
      <Rect x={0} y={0} width={size} height={size} color={dark ? '#2b2b2b' : '#ffffff'} />
      {cells.map((c) => (
        <Rect
          key={`${c.x}:${c.y}`}
          x={c.x}
          y={c.y}
          width={CELL}
          height={CELL}
          color={dark ? '#383838' : '#e8e8e8'}
        />
      ))}
    </>
  );
}

/** Checkerboard stage so transparent areas read as transparent. */
export function StickerPreview({
  image,
  size,
  label,
  placeholder = null,
}: {
  image: SkImage | null;
  size: number;
  label: string;
  /** Shown instead of the spinner when no image is coming. */
  placeholder?: string | null;
}) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const inset = spacing.medium;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[styles.preview, { width: size, height: size, borderColor: theme.cardBorder }]}
    >
      <Canvas style={{ width: size, height: size }}>
        <Checkerboard size={size} dark={dark} />
        {image ? (
          <Image
            image={image}
            x={inset}
            y={inset}
            width={size - 2 * inset}
            height={size - 2 * inset}
            fit="contain"
          />
        ) : null}
      </Canvas>
      {image ? null : (
        <View style={styles.previewBusy}>
          {placeholder ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.placeholder, { color: theme.text, backgroundColor: theme.background }]}
            >
              {placeholder}
            </Text>
          ) : (
            <ActivityIndicator color={theme.textGreen} />
          )}
        </View>
      )}
    </View>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.label, { color: theme.text }]}>{children}</Text>;
}

export function Hint({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.hint, { color: theme.textSecondary }]}>{children}</Text>;
}

export function SwatchRow({
  label,
  swatches,
  value,
  onChange,
  disabledColor = null,
}: {
  label: string;
  swatches: SolidSwatch[];
  value: string;
  onChange: (color: string) => void;
  /** A colour that may not be picked here, e.g. the one the text already uses. */
  disabledColor?: string | null;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <FieldLabel>{label}</FieldLabel>
      <View style={styles.swatches}>
        {swatches.map((s) => {
          const selected = sameColor(s.color, value);
          const disabled = disabledColor !== null && sameColor(disabledColor, s.color);
          return (
            <Pressable
              key={s.id}
              accessibilityRole="radio"
              accessibilityLabel={s.label}
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              onPress={() => onChange(s.color)}
              hitSlop={4}
              style={[
                styles.ring,
                { borderColor: selected ? theme.textGreen : 'transparent' },
                disabled && styles.disabled,
              ]}
            >
              <View
                style={[styles.swatch, { backgroundColor: s.color, borderColor: theme.cardBorder }]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function SwitchRow({
  label,
  value,
  onChange,
  disabled = false,
  children,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <View style={styles.switchRow}>
        <Text style={[styles.switchLabel, { color: theme.text }]}>{label}</Text>
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          accessibilityLabel={label}
          trackColor={{ true: colors.primary[600], false: colors.grey[300] }}
        />
      </View>
      {value ? children : null}
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    alignSelf: 'center',
    borderRadius: borderRadius.xlarge,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  previewBusy: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  placeholder: {
    ...typography.body,
    textAlign: 'center',
    margin: spacing.large,
    padding: spacing.small,
    borderRadius: borderRadius.large,
  },
  field: { gap: spacing.xsmall },
  label: { ...typography.bodyBold },
  hint: { ...typography.caption },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xsmall },
  ring: { borderWidth: 2, borderRadius: borderRadius.full, padding: 2 },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  disabled: { opacity: 0.3 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  switchLabel: { ...typography.bodyBold, flex: 1 },
});
