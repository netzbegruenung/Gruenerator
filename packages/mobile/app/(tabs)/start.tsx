import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@gruenerator/shared/hooks';
import { colors, spacing, lightTheme, darkTheme, borderRadius } from '../../theme';
import { ProfileAvatar } from '../../components/common';
import { FLOATING_TAB_BAR_HEIGHT } from '../../components/navigation';
import { useChatStore } from '../../stores/chatStore';
import { route, type AppRoute } from '../../types/routes';

interface QuickFeature {
  id: string;
  label: string;
  icon: 'newspaper-outline' | 'logo-instagram' | 'document-text-outline' | 'videocam-outline' | 'search-outline';
  route: AppRoute;
}

const QUICK_FEATURES: QuickFeature[] = [
  { id: 'pressemitteilung', label: 'Pressemitteilung', icon: 'newspaper-outline', route: '/(tabs)/(texte)/presse' },
  { id: 'instagram', label: 'Instagram', icon: 'logo-instagram', route: '/(tabs)/(texte)/presse' },
  { id: 'antrag', label: 'Antrag', icon: 'document-text-outline', route: '/(tabs)/(texte)/antrag' },
  { id: 'reel', label: 'Reel untertiteln', icon: 'videocam-outline', route: '/(tabs)/(media)/reel' },
  { id: 'suche', label: 'Suche', icon: 'search-outline', route: '/(tabs)/(tools)/suche' },
];

export default function StartScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [chatInput, setChatInput] = useState('');
  const { sendMessage } = useChatStore();

  const firstName = user?.display_name?.split(' ')[0] || 'Grüner';

  const handleFeaturePress = (featureRoute: AppRoute) => {
    router.push(route(featureRoute));
  };

  const handleChatSubmit = useCallback(() => {
    const trimmedInput = chatInput.trim();
    if (!trimmedInput) return;

    sendMessage(trimmedInput);
    setChatInput('');
    router.push(route('/(modals)/gruenerator-chat'));
  }, [chatInput, sendMessage, router]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={colorScheme === 'dark'
          ? [colors.grey[950], colors.grey[950]]
          : [colors.secondary[50], colors.white]
        }
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 0.4 }}
      />
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Grünerator</Text>
          <Pressable onPress={() => router.push('/profile')} style={styles.profileButton}>
            <ProfileAvatar
              avatarRobotId={user?.avatar_robot_id}
              displayName={user?.display_name}
              email={user?.email}
              size="small"
            />
          </Pressable>
        </View>

        {/* Main Content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Welcome Section */}
          <View style={styles.welcomeSection}>
            <Text style={[styles.welcomeText, { color: theme.text }]}>
              Willkommen in der App, {firstName}
            </Text>
            <Text style={[styles.welcomeSubtitle, { color: theme.textSecondary }]}>
              Was möchtest du heute erstellen?
            </Text>
          </View>

          {/* Feature Badges */}
          <View style={styles.badgesSection}>
            {QUICK_FEATURES.map((feature) => (
              <Pressable
                key={feature.id}
                style={({ pressed }) => [
                  styles.badge,
                  {
                    backgroundColor: colorScheme === 'dark' ? colors.primary[900] : colors.white,
                    opacity: pressed ? 0.7 : 1,
                  },
                  colorScheme === 'light' && styles.badgeShadow,
                ]}
                onPress={() => handleFeaturePress(feature.route)}
              >
                <Ionicons
                  name={feature.icon}
                  size={16}
                  color={colorScheme === 'dark' ? colors.primary[200] : colors.primary[700]}
                />
                <Text
                  style={[
                    styles.badgeText,
                    { color: colorScheme === 'dark' ? colors.primary[200] : colors.primary[700] },
                  ]}
                >
                  {feature.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* Chat Input (Fixed Bottom) */}
        <View
          style={[
            styles.chatInputContainer,
            {
              backgroundColor: theme.surface,
              borderTopColor: theme.border,
              paddingBottom: Math.max(insets.bottom, spacing.medium),
              marginBottom: FLOATING_TAB_BAR_HEIGHT,
            },
          ]}
        >
          <View style={styles.chatInputRow}>
            <TextInput
              style={[
                styles.chatInput,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
              placeholder="Frag mich etwas..."
              placeholderTextColor={theme.textSecondary}
              value={chatInput}
              onChangeText={setChatInput}
              multiline
            />
            <Pressable
              style={[
                styles.sendButton,
                { backgroundColor: colors.primary[600], opacity: chatInput.trim() ? 1 : 0.5 },
              ]}
              disabled={!chatInput.trim()}
              onPress={handleChatSubmit}
            >
              <Ionicons name="send" size={18} color={colors.white} />
            </Pressable>
          </View>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  profileButton: {
    padding: spacing.xsmall,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  welcomeSection: {
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.large,
    paddingBottom: spacing.medium,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: '600',
  },
  welcomeSubtitle: {
    fontSize: 16,
    marginTop: spacing.xsmall,
  },
  badgesSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: spacing.medium,
    paddingHorizontal: spacing.medium,
    gap: spacing.small,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.medium,
    borderRadius: borderRadius.full,
  },
  badgeShadow: {
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '500',
  },
  chatInputContainer: {
    borderTopWidth: 1,
    paddingTop: spacing.medium,
    paddingHorizontal: spacing.medium,
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.small,
  },
  chatInput: {
    flex: 1,
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.large,
    borderRadius: borderRadius.pill,
    borderWidth: 0.5,
    fontSize: 16,
    maxHeight: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
