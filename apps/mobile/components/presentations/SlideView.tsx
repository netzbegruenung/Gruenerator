import { type Slide } from '@gruenerator/contracts';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Markdown from 'react-native-markdown-display';

import { SLIDE_H, SLIDE_W, resolveSlideBackground, slideAccent } from './slideStyles';

const INK = '#262a28';
const KLEE = '#52907a';

/**
 * One slide rendered natively at the fixed 960×540 design size, then uniformly
 * scaled to the parent width (mirrors the web ScaledSlide). Layouts/variants
 * from gruene-deck.css are approximated: backgrounds, accent title, quote rule,
 * code panel and title decorations are faithful; the fancier content variants
 * (card grid / numbered circles) and split columns fall back to the base list.
 */
export function SlideView({ slide, accent }: { slide: Slide; accent?: string | null }) {
  const [width, setWidth] = useState(0);
  const bg = resolveSlideBackground(slide, accent);
  const deckAccent = slideAccent(accent);
  const textColor = bg.dark ? '#ffffff' : INK;
  const titleColor = bg.dark ? '#ffffff' : deckAccent;
  const scale = width / SLIDE_W;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const isTitle = slide.layout === 'title';
  const isQuote = slide.layout === 'quote';
  const isCode = slide.layout === 'code';
  const variant = slide.variant ?? 0;

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
    body: { fontSize: 28, color: textColor, lineHeight: 28 * 1.4 },
    paragraph: { marginTop: 0, marginBottom: 12 },
    bullet_list_icon: { color: deckAccent, fontSize: 28 },
    ordered_list_icon: { color: deckAccent, fontSize: 28 },
    list_item: { marginBottom: 10 },
    heading1: { color: titleColor, fontSize: 40, fontWeight: '700' as const },
    heading2: { color: titleColor, fontSize: 34, fontWeight: '700' as const },
    link: { color: bg.dark ? 'rgba(255,255,255,0.85)' : KLEE },
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

          {slide.title.trim() !== '' && (
            <Text style={[styles.title, { color: titleColor, fontSize: isTitle ? 56 : 44 }]}>
              {slide.title}
            </Text>
          )}

          {isCode ? (
            <View style={styles.codePanel}>
              <Text style={styles.codeText}>{slide.body}</Text>
            </View>
          ) : (
            <View
              style={[
                styles.body,
                isQuote && styles.quoteBody,
                isQuote && variant !== 1 && { borderLeftColor: bg.dark ? '#a9d3be' : deckAccent },
                isTitle && { flexGrow: 0 },
                isTitle && variant === 1 && { paddingRight: SLIDE_W * 0.42 },
              ]}
            >
              <Markdown style={mdStyles as never}>{slide.body}</Markdown>
            </View>
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
    lineHeight: 56 * 1.15,
  },
  body: {
    flexShrink: 1,
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
