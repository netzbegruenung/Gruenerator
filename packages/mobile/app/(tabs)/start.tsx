import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  Pressable,
  Modal,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@gruenerator/shared/hooks';
import { colors, spacing, lightTheme, darkTheme, borderRadius } from '../../theme';
import { useChatStore } from '../../stores/chatStore';

const QUICK_FEATURES = [
  { id: 'pressemitteilung', label: 'Pressemitteilung', icon: 'newspaper-outline' as const, route: '/(tabs)/(texte)/presse' },
  { id: 'instagram', label: 'Instagram', icon: 'logo-instagram' as const, route: '/(tabs)/(texte)/presse' },
  { id: 'antrag', label: 'Antrag', icon: 'document-text-outline' as const, route: '/(tabs)/(texte)/antrag' },
  { id: 'reel', label: 'Reel untertiteln', icon: 'videocam-outline' as const, route: '/(tabs)/(media)/reel' },
  { id: 'suche', label: 'Suche', icon: 'search-outline' as const, route: '/(tabs)/(tools)/suche' },
];

export default function StartScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [menuVisible, setMenuVisible] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const { sendMessage } = useChatStore();

  const firstName = user?.display_name?.split(' ')[0] || 'Grüner';

  const handleProfilePress = () => {
    setMenuVisible(false);
    router.push('/profile');
  };

  const handleFeaturePress = (route: string) => {
    router.push(route as any);
  };

  const handleChatSubmit = useCallback(() => {
    const trimmedInput = chatInput.trim();
    if (!trimmedInput) return;

    sendMessage(trimmedInput);
    setChatInput('');
    router.push('/(modals)/gruenerator-chat' as any);
  }, [chatInput, sendMessage, router]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Grünerator ai Studio</Text>
          <Pressable onPress={() => setMenuVisible(true)} style={styles.menuButton}>
            <Ionicons name="ellipsis-vertical" size={24} color={theme.text} />
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.badgesScroll}
            >
              {QUICK_FEATURES.map((feature) => (
                <Pressable
                  key={feature.id}
                  style={({ pressed }) => [
                    styles.badge,
                    {
                      backgroundColor: colorScheme === 'dark' ? colors.primary[900] : colors.primary[50],
                      opacity: pressed ? 0.7 : 1,
                    },
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
            </ScrollView>
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

        {/* Menu Modal */}
        <Modal
          visible={menuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuVisible(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setMenuVisible(false)}>
            <View style={[styles.menu, { backgroundColor: theme.surface }]}>
              <Pressable style={styles.menuItem} onPress={handleProfilePress}>
                <Ionicons name="person-outline" size={20} color={theme.text} />
                <Text style={[styles.menuItemText, { color: theme.text }]}>Profil</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
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
  menuButton: {
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
    paddingVertical: spacing.medium,
  },
  badgesScroll: {
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
    paddingHorizontal: spacing.medium,
    borderRadius: borderRadius.large,
    borderWidth: 1,
    fontSize: 16,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  menu: {
    marginTop: 60,
    marginRight: spacing.medium,
    borderRadius: 8,
    paddingVertical: spacing.xsmall,
    minWidth: 150,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.medium,
  },
  menuItemText: {
    fontSize: 16,
  },
});
