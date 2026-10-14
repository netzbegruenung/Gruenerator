import {
  BADGE_DEFAULT_COLORS,
  BADGE_DEFAULT_TEXT,
  BADGE_LINE_HEIGHT,
  BADGE_MAX_LINES,
  BADGE_SHAPES,
  BADGE_TEXT_MAX,
  badgeGeometry,
  badgeLines,
  fitFontSize,
  stickerSwatches,
  swatchColor,
  type BadgeShapeId,
  type StickerLocale,
} from '@gruenerator/shared/stickers';
import { useTypeface, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import badgeFont from '../../../assets/fonts/Raleway_700Bold.ttf';
import { useTheme } from '../../../hooks/useTheme';
import { BODY_FONT, borderRadius, colors, spacing, typography } from '../../../theme';

import {
  FieldLabel,
  Hint,
  StickerPreview,
  SwatchRow,
  SwitchRow,
  usePreviewSize,
  type StickerDraft,
} from './creatorParts';
import { measureBadgeLine, renderBadge } from './stickerRender';

const RENDER_DELAY_MS = 150;

export function BadgeDesigner({
  locale,
  onDraft,
}: {
  locale: StickerLocale;
  onDraft: (draft: StickerDraft | null) => void;
}) {
  const theme = useTheme();
  const previewSize = usePreviewSize();
  const swatches = stickerSwatches(locale);
  // The CD headline faces exist as TTFs (apps/api/public/fonts) but are not
  // bundled into the app yet; its own bold heading face stands in until then.
  const typeface = useTypeface(badgeFont);
  const [text, setText] = useState(BADGE_DEFAULT_TEXT);
  const [shape, setShape] = useState<BadgeShapeId>('stoerer');
  const [background, setBackground] = useState(() =>
    swatchColor(swatches, BADGE_DEFAULT_COLORS[locale].background)
  );
  const [textColor, setTextColor] = useState(() =>
    swatchColor(swatches, BADGE_DEFAULT_COLORS[locale].text)
  );
  const [outlineOn, setOutlineOn] = useState(true);
  const [preview, setPreview] = useState<SkImage | null>(null);
  const [renderFailed, setRenderFailed] = useState(false);

  const lines = badgeLines(text);
  const linesKey = lines.join('\n');
  const tooManyLines = text.split('\n').filter((l) => l.trim()).length > BADGE_MAX_LINES;
  const shapeLabel = BADGE_SHAPES.find((s) => s.id === shape)?.label ?? '';

  useEffect(() => {
    if (!typeface || !linesKey) {
      onDraft(null);
      return;
    }
    const timer = setTimeout(() => {
      const geometry = badgeGeometry(shape);
      const badgeText = linesKey.split('\n');
      const lineHeight = BADGE_LINE_HEIGHT[locale];
      try {
        const image = renderBadge({
          geometry,
          lines: badgeText,
          fontSize: fitFontSize(
            badgeText,
            geometry.textBox,
            (line) => measureBadgeLine(typeface, line),
            lineHeight
          ),
          lineHeight,
          typeface,
          background,
          textColor,
          outline: outlineOn,
        });
        setRenderFailed(false);
        setPreview(image);
        onDraft({ image, suggestedTitle: badgeText.join(' ') });
      } catch {
        setRenderFailed(true);
        onDraft(null);
      }
    }, RENDER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [typeface, linesKey, shape, background, textColor, outlineOn, locale, onDraft]);

  return (
    <View style={styles.root}>
      <StickerPreview
        image={linesKey ? preview : null}
        size={previewSize}
        label={`Vorschau: ${shapeLabel}${lines.length ? ` mit „${lines.join(' ')}“` : ''}`}
        placeholder={
          !linesKey
            ? 'Schreib einen Text, dann erscheint hier dein Badge.'
            : renderFailed
              ? 'Der Badge konnte nicht erstellt werden.'
              : null
        }
      />
      <View style={styles.field}>
        <FieldLabel>Text</FieldLabel>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          maxLength={BADGE_TEXT_MAX}
          accessibilityLabel="Text"
          style={[
            styles.input,
            { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface },
          ]}
        />
        <Hint>
          {tooManyLines
            ? 'Nur die ersten drei Zeilen kommen auf den Sticker.'
            : 'Bis zu drei Zeilen – die Schrift passt sich der Form an.'}
        </Hint>
      </View>

      <View style={styles.field} accessibilityRole="radiogroup" accessibilityLabel="Form">
        <FieldLabel>Form</FieldLabel>
        <View style={styles.chips}>
          {BADGE_SHAPES.map((s) => {
            const selected = s.id === shape;
            return (
              <Pressable
                key={s.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => setShape(s.id)}
                style={[
                  styles.chip,
                  selected
                    ? { backgroundColor: colors.primary[600], borderColor: colors.primary[600] }
                    : { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <Text style={[styles.chipText, { color: selected ? colors.white : theme.text }]}>
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <SwatchRow
        label="Hintergrund"
        swatches={swatches}
        value={background}
        onChange={setBackground}
        disabledColor={textColor}
      />
      <SwatchRow
        label="Schrift"
        swatches={swatches}
        value={textColor}
        onChange={setTextColor}
        disabledColor={background}
      />
      <SwitchRow label="Weiße Kontur" value={outlineOn} onChange={setOutlineOn} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.medium },
  field: { gap: spacing.xsmall },
  input: {
    minHeight: 96,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.large,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.small,
    fontFamily: BODY_FONT,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xsmall },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.small,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { ...typography.bodyBold },
});
