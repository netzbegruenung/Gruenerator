import {
  fitScaleForRatio,
  getPresentationBrandTheme,
  PRESENTATION_FONT_SIZE_SCALE,
  type Slide,
} from '@gruenerator/contracts';
import { Image } from 'expo-image';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Markdown from 'react-native-markdown-display';

import { SLIDE_H, SLIDE_W, resolveSlideBackground, slideAccent } from './slideStyles';

const INK = '#262a28';

/** Vertical padding of the surface (mirrors `styles.surface`). */
const PAD_Y = 64;
/** Column gap between title and body (mirrors `styles.surface`). */
const GAP = 20;
/** Height the content column has to fit into at the 960×540 design size. */
const CONTENT_H = SLIDE_H - PAD_Y * 2;

// Logo PNGs live in the web app's public root; derive the origin from the API
// env (same value chatConfig uses), stripping a trailing /api.
const ASSET_ORIGIN = (process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu').replace(
  /\/api\/?$/,
  ''
);

/**
 * One slide rendered natively at the fixed 960×540 design size, then uniformly
 * scaled to the parent width (mirrors the web ScaledSlide). Layouts/variants
 * from gruene-deck.css are approximated: backgrounds, accent title, quote rule,
 * code panel and title decorations are faithful; the fancier content variants
 * (card grid / numbered circles) and split columns fall back to the base list.
 * Country brand (DE/AT) drives colours and the title-slide logo; the CI fonts
 * are not bundled in the app (follow-up) — system fonts render the text.
 *
 * Slides on "Auto" shrink to fit like they do on the web: both renderers work
 * in the same 960×540 design space and share the ladder from contracts, so a
 * deck lands on the same step on either client. The step can still differ by
 * one where wrapping is non-linear — the web probes each step, this computes
 * from one measurement — and the error is conservative (never clipped).
 */
export function SlideView({
  slide,
  accent,
  brand,
  showLogo,
}: {
  slide: Slide;
  accent?: string | null;
  brand?: string | null;
  showLogo?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const theme = getPresentationBrandTheme(brand);
  const bg = resolveSlideBackground(slide, accent, brand);
  const deckAccent = slideAccent(accent, brand);
  const textColor = bg.dark ? '#ffffff' : INK;
  const titleColor = bg.dark ? '#ffffff' : deckAccent;
  const scale = width / SLIDE_W;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const isTitle = slide.layout === 'title';
  const isQuote = slide.layout === 'quote';
  const isCode = slide.layout === 'code';
  const variant = slide.variant ?? 0;

  // Font scale: an explicit preset, else auto-fit. Auto-fit is a single
  // measuring pass — the viewer is read-only, so unlike the web editor there is
  // nothing to re-fit against. Yoga has no `scrollHeight`: a body with
  // `flexShrink: 1` gets compressed rather than reported as overflowing, so the
  // pass renders with `flexShrink: 0` (natural height, clipped by the box) and
  // invisible, then derives the step from the measured ratio. Code slides are
  // excluded, matching the web hook.
  const preset = slide.fontSize ? PRESENTATION_FONT_SIZE_SCALE[slide.fontSize] : null;
  const [autoScale, setAutoScale] = useState<number | null>(null);
  const measuring = preset == null && !isCode && autoScale == null;
  const fs = preset ?? autoScale ?? 1;

  const hasTitle = slide.title.trim() !== '';
  const measured = useRef<{ title: number | null; body: number | null }>({
    title: null,
    body: null,
  });
  const reportHeight = useCallback(
    (key: 'title' | 'body', height: number) => {
      measured.current[key] = height;
      const { title, body } = measured.current;
      // Both boxes must have reported before the column height is known.
      if (body === null || (hasTitle && title === null)) return;
      const total = (title ?? 0) + body + (title && body ? GAP : 0);
      // A zero/invalid total degrades to scale 1 (fitScaleForRatio guards it).
      setAutoScale(fitScaleForRatio(CONTENT_H / total));
    },
    [hasTitle]
  );

  const surfaceAlign: {
    alignItems?: 'center' | 'flex-start';
    justifyContent?: 'center' | 'flex-start';
  } =
    isTitle && variant === 0
      ? { alignItems: 'center', justifyContent: 'center' }
      : isTitle || isQuote
        ? {
            alignItems: variant === 1 && isQuote ? 'center' : 'flex-start',
            justifyContent: 'center',
          }
        : { justifyContent: 'flex-start' };

  const mdStyles = {
    body: { fontSize: 28 * fs, color: textColor, lineHeight: 28 * 1.4 * fs },
    paragraph: { marginTop: 0, marginBottom: 12 * fs },
    bullet_list_icon: { color: deckAccent, fontSize: 28 * fs },
    ordered_list_icon: { color: deckAccent, fontSize: 28 * fs },
    list_item: { marginBottom: 10 * fs },
    heading1: { color: titleColor, fontSize: 40 * fs, fontWeight: '700' as const },
    heading2: { color: titleColor, fontSize: 34 * fs, fontWeight: '700' as const },
    link: { color: bg.dark ? 'rgba(255,255,255,0.85)' : theme.colors.accent },
    strong: { fontWeight: '700' as const },
    code_inline: {
      backgroundColor: bg.dark ? 'rgba(255,255,255,0.15)' : '#eef3f0',
      color: textColor,
      borderRadius: 4,
    },
  };

  return (
    <View style={styles.box} onLayout={onLayout}>
      {width > 0 && (
        <View
          style={[
            styles.surface,
            { backgroundColor: bg.backgroundColor, transform: [{ scale }] },
            surfaceAlign,
            // Hide the measuring pass: it renders unshrunk and may overflow.
            measuring && styles.measuring,
          ]}
        >
          {bg.imageUri && (
            <Image
              source={{ uri: bg.imageUri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          )}

          {isTitle && variant === 2 && (
            <View style={[styles.titleBar, { backgroundColor: deckAccent }]} />
          )}
          {isTitle && variant === 1 && (
            <View style={[styles.sidePanel, { backgroundColor: deckAccent }]} />
          )}

          {hasTitle && (
            <Text
              onLayout={
                measuring ? (e) => reportHeight('title', e.nativeEvent.layout.height) : undefined
              }
              style={[
                styles.title,
                {
                  color: titleColor,
                  fontSize: (isTitle ? 56 : 44) * fs,
                  lineHeight: (isTitle ? 56 : 44) * 1.15 * fs,
                },
              ]}
            >
              {slide.title}
            </Text>
          )}

          {isCode ? (
            <View style={styles.codePanel}>
              <Text style={[styles.codeText, { fontSize: 20 * fs, lineHeight: 20 * 1.45 * fs }]}>
                {slide.body}
              </Text>
            </View>
          ) : (
            <View
              onLayout={
                measuring ? (e) => reportHeight('body', e.nativeEvent.layout.height) : undefined
              }
              style={[
                styles.body,
                isQuote && styles.quoteBody,
                isQuote &&
                  variant !== 1 && {
                    borderLeftColor: bg.dark ? theme.colors.onDarkSoft : deckAccent,
                  },
                isTitle && { flexGrow: 0 },
                isTitle && variant === 1 && { paddingRight: SLIDE_W * 0.42 },
                // Natural height while measuring — flexShrink would compress it
                // and hide exactly the overflow we are trying to detect.
                measuring && styles.bodyMeasuring,
              ]}
            >
              <Markdown style={mdStyles as never}>{slide.body}</Markdown>
            </View>
          )}

          {isTitle && showLogo !== false && (
            <Image
              source={{
                uri: `${ASSET_ORIGIN}/${
                  // Variant 1 (Geteilt): the accent side panel sits bottom-right
                  // where the logo lands → on-dark variant even on light bg.
                  bg.dark || variant === 1 ? theme.logo.dark.apiFile : theme.logo.light.apiFile
                }`,
              }}
              style={{
                position: 'absolute',
                right: 40,
                bottom: 36,
                height: theme.logo.heightPx,
                width: theme.logo.heightPx * theme.logo.aspect,
              }}
              contentFit="contain"
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: '100%',
    aspectRatio: SLIDE_W / SLIDE_H,
    overflow: 'hidden',
  },
  surface: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SLIDE_W,
    height: SLIDE_H,
    transformOrigin: 'top left',
    paddingVertical: 64,
    paddingHorizontal: 72,
    flexDirection: 'column',
    gap: 20,
  },
  title: {
    fontWeight: '700',
  },
  body: {
    flexShrink: 1,
  },
  bodyMeasuring: {
    flexShrink: 0,
  },
  measuring: {
    opacity: 0,
  },
  quoteBody: {
    borderLeftWidth: 6,
    paddingLeft: 28,
  },
  titleBar: {
    width: 64,
    height: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  sidePanel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '36%',
  },
  codePanel: {
    flex: 1,
    backgroundColor: '#1e2420',
    borderRadius: 8,
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 20,
    lineHeight: 20 * 1.45,
    color: '#e8efe9',
  },
});
