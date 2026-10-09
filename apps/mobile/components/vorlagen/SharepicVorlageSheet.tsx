import {
  sharepicFormLabel,
  sharepicFormStichworte,
  type SharepicVorlage,
} from '@gruenerator/contracts';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { openUrl } from '../../services/share';
import { borderRadius, colors, spacing, typography } from '../../theme';
import { routeWithParams } from '../../types/routes';
import { BottomSheet } from '../common/BottomSheet';

import { vorlageAspectRatio, vorlageThumbSource } from './vorlageThumb';

const COUNTRY: Record<SharepicVorlage['locale'], string> = {
  'de-DE': 'Deutschland',
  'de-AT': 'Österreich',
};

interface SharepicVorlageSheetProps {
  vorlage: SharepicVorlage | null;
  token: string | null;
  onClose: () => void;
}

/**
 * A Grünerator-Vorlage up close, like web's `SharepicVorlageDialog`: copy it
 * into an editable canvas, or have the chat build one like it.
 *
 * The copy is made by the web page `/studio/vorlage/:id` — composing needs a
 * browser — so „Kopie bearbeiten" opens it in the web viewer.
 */
export function SharepicVorlageSheet({ vorlage, token, onClose }: SharepicVorlageSheetProps) {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();

  if (!vorlage) return null;

  const slides = vorlage.spec.slides.length;
  const slideWidth = Math.min(width - spacing.medium * 2, 420) * (slides > 1 ? 0.8 : 1);
  const slideHeight = slideWidth / vorlageAspectRatio(vorlage);
  const credits = vorlage.attributions.filter((a) => a !== null);
  const formLabel = sharepicFormLabel(vorlage.form);

  const editCopy = () => {
    onClose();
    router.push({
      pathname: '/(fullscreen)/web-viewer',
      params: { path: `/studio/vorlage/${vorlage.id}`, title: vorlage.titel },
    });
  };

  const openCreator = (prompt: string) => {
    onClose();
    router.push(routeWithParams('/(focused)/sharepic', { initialMessage: prompt }));
  };

  return (
    <BottomSheet visible onClose={onClose} maxHeight="90%">
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          {vorlage.titel}
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>{vorlage.beschreibung}</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={slideWidth + spacing.small}
          decelerationRate="fast"
          contentContainerStyle={styles.slides}
          accessibilityLabel={slides > 1 ? `${slides} Seiten` : undefined}
        >
          {Array.from({ length: slides }, (_, i) => (
            <View
              key={i}
              style={[
                styles.slide,
                { width: slideWidth, height: slideHeight, backgroundColor: theme.surface },
              ]}
            >
              {token ? (
                <Image
                  source={vorlageThumbSource(vorlage.id, i + 1, token)}
                  style={StyleSheet.absoluteFill}
                  contentFit="contain"
                  accessible
                  accessibilityLabel={
                    slides > 1
                      ? `Seite ${i + 1} von ${slides}: ${vorlage.titel}`
                      : `Vorschau: ${vorlage.titel}`
                  }
                />
              ) : null}
            </View>
          ))}
        </ScrollView>

        <Text style={[styles.meta, { color: theme.textSecondary }]}>
          {formLabel} · {COUNTRY[vorlage.locale]}
          {slides > 1 ? ` · ${slides} Seiten` : ''}
        </Text>
        {credits.length > 0 && (
          <View style={styles.credits}>
            <Text style={[styles.meta, { color: theme.textSecondary }]}>Foto: </Text>
            {credits.map((c, i) => (
              <Pressable
                key={c.photoUrl}
                onPress={() => void openUrl(c.photoUrl)}
                accessibilityRole="link"
                accessibilityLabel={`Foto von ${c.photographer} auf Unsplash öffnen`}
              >
                <Text style={[styles.meta, styles.link, { color: theme.textSecondary }]}>
                  {i > 0 ? ', ' : ''}
                  {c.photographer}
                </Text>
              </Pressable>
            ))}
            <Text style={[styles.meta, { color: theme.textSecondary }]}> auf Unsplash</Text>
          </View>
        )}

        <Pressable
          onPress={editCopy}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Kopie bearbeiten"
          accessibilityHint="Öffnet eine eigene Kopie dieser Vorlage im Editor"
        >
          <Ionicons name="pencil" size={16} color={colors.white} />
          <Text style={styles.primaryButtonText}>Kopie bearbeiten</Text>
        </Pressable>

        <View style={styles.headingRow}>
          <Ionicons name="chatbox-ellipses-outline" size={16} color={theme.text} />
          <Text style={[styles.heading, { color: theme.text }]} accessibilityRole="header">
            So erstellst du das im Chat
          </Text>
        </View>
        <Text style={[styles.body, { color: theme.text }]}>
          Schreib dem Sharepic-Creator, was drauf soll. Zum Beispiel:
        </Text>
        {vorlage.chat.prompts.map((prompt) => (
          <Pressable
            key={prompt}
            onPress={() => openCreator(prompt)}
            style={({ pressed }) => [
              styles.prompt,
              { borderColor: theme.border },
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Im Sharepic-Creator: ${prompt}`}
          >
            <Text style={[styles.body, { color: theme.text }]}>„{prompt}“</Text>
          </Pressable>
        ))}

        <Text style={[styles.body, { color: theme.text }]}>
          Mit diesen Wörtern bekommst du die Form „{formLabel}“:
        </Text>
        <View style={styles.chips} accessibilityLabel="Stichworte">
          {sharepicFormStichworte(vorlage.form).map((wort) => (
            <View key={wort} style={styles.chip}>
              <Text style={styles.chipText}>{wort}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.medium,
    gap: spacing.small,
  },
  title: {
    ...typography.h4,
  },
  heading: {
    ...typography.bodyBold,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    marginTop: spacing.medium,
  },
  body: {
    ...typography.bodySmall,
  },
  meta: {
    ...typography.caption,
  },
  link: {
    textDecorationLine: 'underline',
  },
  slides: {
    gap: spacing.small,
    paddingVertical: spacing.xsmall,
  },
  slide: {
    borderRadius: borderRadius.medium,
    overflow: 'hidden',
  },
  credits: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xsmall,
    minHeight: 48,
    marginTop: spacing.small,
    borderRadius: borderRadius.medium,
    backgroundColor: colors.primary[600],
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.white,
  },
  pressed: {
    opacity: 0.8,
  },
  prompt: {
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.small,
    minHeight: 44,
    justifyContent: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xsmall,
  },
  chip: {
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xxsmall,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary[100],
  },
  chipText: {
    ...typography.caption,
    color: colors.primary[700],
  },
});
