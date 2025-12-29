import { View, StyleSheet } from 'react-native';
import { Bubble, InputToolbar, Composer, Send } from 'react-native-gifted-chat';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';

type Theme = typeof lightTheme | typeof darkTheme;

export function createChatRenderers(theme: Theme) {
  const renderBubble = (props: any) => (
    <Bubble
      {...props}
      wrapperStyle={{
        right: {
          backgroundColor: colors.primary[600],
          borderRadius: borderRadius.large,
          marginVertical: spacing.xxsmall,
        },
        left: {
          backgroundColor: theme.surface,
          borderRadius: borderRadius.large,
          marginVertical: spacing.xxsmall,
        },
      }}
      textStyle={{
        right: {
          color: colors.white,
        },
        left: {
          color: theme.text,
        },
      }}
    />
  );

  const renderInputToolbar = (props: any) => (
    <InputToolbar
      {...props}
      containerStyle={[
        styles.inputToolbar,
        {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
        },
      ]}
    />
  );

  const renderComposer = (props: any) => (
    <Composer
      {...props}
      textInputStyle={[
        styles.composer,
        {
          color: theme.text,
          backgroundColor: theme.surface,
        },
      ]}
      placeholderTextColor={theme.textSecondary}
    />
  );

  const renderSend = (props: any) => (
    <Send {...props} containerStyle={styles.sendContainer}>
      <View style={[styles.sendButton, { backgroundColor: colors.primary[600] }]}>
        <Ionicons name="send" size={18} color={colors.white} />
      </View>
    </Send>
  );

  return {
    renderBubble,
    renderInputToolbar,
    renderComposer,
    renderSend,
  };
}

export const styles = StyleSheet.create({
  inputToolbar: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
  },
  composer: {
    borderRadius: borderRadius.large,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    fontSize: 16,
    marginRight: spacing.xsmall,
  },
  sendContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.xsmall,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
