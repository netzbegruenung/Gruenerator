import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Markdown, { type MarkdownProps } from 'react-native-markdown-display';

import { colors, spacing } from '../../theme';

import { CitationModal } from './CitationModal';

import type { NotebookSource } from '../../stores/notebookChatStore';

interface CitationTextRendererProps {
  text: string;
  citations?: NotebookSource[];
  markdownStyles?: MarkdownProps['style'];
}

export function CitationTextRenderer({
  text,
  citations = [],
  markdownStyles,
}: CitationTextRendererProps) {
  const [selectedCitation, setSelectedCitation] = useState<NotebookSource | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<string>('');
  const [modalVisible, setModalVisible] = useState(false);

  const citationMap = useMemo(() => {
    const map = new Map<string, NotebookSource>();
    citations.forEach((citation) => {
      if (citation.index !== undefined) {
        map.set(citation.index.toString(), citation);
      }
    });
    return map;
  }, [citations]);

  const cleanedText = useMemo(() => {
    if (!text) return '';
    return text.replace(/⚡CITE(\d+)⚡/g, '**[$1]**');
  }, [text]);

  const usedCitationIndices = useMemo(() => {
    const indices = new Set<string>();
    const pattern = /⚡CITE(\d+)⚡/g;
    let match;
    while ((match = pattern.exec(text || '')) !== null) {
      indices.add(match[1]);
    }
    return Array.from(indices).sort((a, b) => parseInt(a) - parseInt(b));
  }, [text]);

  const handleCitationPress = (index: string) => {
    const citation = citationMap.get(index);
    if (citation) {
      setSelectedCitation(citation);
      setSelectedIndex(index);
      setModalVisible(true);
    }
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setSelectedCitation(null);
    setSelectedIndex('');
  };

  return (
    <View style={styles.container}>
      <Markdown style={markdownStyles}>{cleanedText}</Markdown>

      {usedCitationIndices.length > 0 && (
        <View style={styles.citationList}>
          <View style={styles.citationBadges}>
            {usedCitationIndices.map((index) => {
              const citation = citationMap.get(index);
              return (
                <Pressable
                  key={index}
                  style={({ pressed }) => [
                    styles.citationBadge,
                    pressed && styles.citationBadgePressed,
                  ]}
                  onPress={() => handleCitationPress(index)}
                  accessibilityLabel={`Quelle ${index}: ${citation?.title || ''}`}
                >
                  <Text style={styles.citationBadgeText}>{index}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <CitationModal
        visible={modalVisible}
        onClose={handleCloseModal}
        citation={selectedCitation}
        citationIndex={selectedIndex}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  citationList: {
    marginTop: spacing.small,
  },
  citationBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xsmall,
  },
  citationBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  citationBadgePressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  citationBadgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
});
