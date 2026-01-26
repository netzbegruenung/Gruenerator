import { View, Text, StyleSheet, ScrollView, useColorScheme, Share, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Button } from './common';
import { colors, typography, spacing, borderRadius, lightTheme, darkTheme } from '../theme';

interface GeneratedTextDisplayProps {
  text: string;
  onNewGeneration: () => void;
}

export function GeneratedTextDisplay({ text, onNewGeneration }: GeneratedTextDisplayProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: text,
      });
    } catch (error) {
      console.error('[Share] Error:', error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Grünerierter Text</Text>
        <View style={styles.actions}>
          <Pressable
            onPress={handleCopy}
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: theme.surface, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.actionText, { color: theme.text }]}>
              {copied ? 'Kopiert!' : 'Kopieren'}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleShare}
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: theme.surface, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.actionText, { color: theme.text }]}>Teilen</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={[
          styles.textContainer,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
        contentContainerStyle={styles.textContent}
      >
        <Text style={[styles.text, { color: theme.text }]} selectable>
          {text}
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <Button variant="outline" onPress={onNewGeneration}>
          Neuen Text grünerieren
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.medium,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.medium,
  },
  title: {
    ...typography.h3,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.small,
  },
  actionButton: {
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.small,
  },
  actionText: {
    ...typography.bodySmall,
  },
  textContainer: {
    flex: 1,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
  },
  textContent: {
    padding: spacing.medium,
  },
  text: {
    ...typography.body,
    lineHeight: 24,
  },
  footer: {
    marginTop: spacing.medium,
  },
});
