/**
 * SubtitleOverlay Component
 * Displays the active subtitle text over the video
 */

import { useMemo } from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import type {
  SubtitleSegment,
  SubtitleStylePreference,
  SubtitleHeightPreference,
} from '@gruenerator/shared/subtitle-editor';
import { getStyleConfig, HEIGHT_BOTTOM_PERCENT } from '@gruenerator/shared/subtitle-editor';
import { useAuthStore } from '@gruenerator/shared/stores';

interface SubtitleOverlayProps {
  segments: SubtitleSegment[];
  currentTime: number;
  stylePreference: SubtitleStylePreference;
  heightPreference: SubtitleHeightPreference;
}

export function SubtitleOverlay({
  segments,
  currentTime,
  stylePreference,
  heightPreference,
}: SubtitleOverlayProps) {
  const locale = useAuthStore((state) => state.locale) ?? 'de-DE';

  const activeSegment = useMemo(() => {
    return (
      segments.find(
        (segment) => currentTime >= segment.startTime && currentTime <= segment.endTime
      ) || null
    );
  }, [segments, currentTime]);

  const styleConfig = useMemo(() => {
    return getStyleConfig(stylePreference, locale);
  }, [stylePreference, locale]);

  const bottomPercent = HEIGHT_BOTTOM_PERCENT[heightPreference];

  if (!activeSegment) {
    return null;
  }

  const textShadowStyle = styleConfig.textShadow
    ? parseTextShadow(styleConfig.textShadow)
    : undefined;

  return (
    <View style={[styles.container, { bottom: `${bottomPercent}%` }]} pointerEvents="none">
      <View
        style={[
          styles.textContainer,
          {
            backgroundColor: styleConfig.backgroundColor,
            paddingHorizontal: styleConfig.padding !== '0' ? 8 : 0,
            paddingVertical: styleConfig.padding !== '0' ? 4 : 0,
            borderRadius: styleConfig.borderRadius !== '0' ? 4 : 0,
          },
        ]}
      >
        <Text
          style={[
            styles.text,
            {
              color: styleConfig.textColor,
              ...textShadowStyle,
            },
          ]}
        >
          {activeSegment.text}
        </Text>
      </View>
    </View>
  );
}

function parseTextShadow(shadowString: string):
  | {
      textShadowColor?: string;
      textShadowOffset?: { width: number; height: number };
      textShadowRadius?: number;
    }
  | undefined {
  if (!shadowString || shadowString === 'none') {
    return undefined;
  }

  if (shadowString.includes('rgba(0, 0, 0')) {
    return {
      textShadowColor: 'rgba(0, 0, 0, 0.8)',
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 4,
    };
  }

  if (shadowString.includes('#000')) {
    return {
      textShadowColor: '#000',
      textShadowOffset: { width: 1, height: 1 },
      textShadowRadius: 0,
    };
  }

  return undefined;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  textContainer: {
    maxWidth: '90%',
  },
  text: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 22,
  },
});
