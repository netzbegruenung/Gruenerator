import { View, Text, StyleSheet, useColorScheme, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@gruenerator/shared/hooks';
import { colors, spacing, lightTheme, darkTheme, borderRadius } from '../../theme';
import { ProfileAvatar } from '../../components/common';
import { route, type AppRoute } from '../../types/routes';

interface QuickFeature {
  id: string;
  label: string;
  icon:
    | 'newspaper-outline'
    | 'document-text-outline'
    | 'videocam-outline'
    | 'search-outline'
    | 'image-outline'
    | 'create-outline'
    | 'construct-outline';
  route: AppRoute;
}

const QUICK_FEATURES: QuickFeature[] = [
  {
    id: 'presse',
    label: 'Öffentlichkeitsarbeit kreieren',
    icon: 'newspaper-outline',
    route: '/(tabs)/(texte)/presse',
  },
  {
    id: 'antrag',
    label: 'Antrag erstellen',
    icon: 'document-text-outline',
    route: '/(tabs)/(texte)/antrag',
  },
  {
    id: 'universal',
    label: 'Weitere Textformen',
    icon: 'create-outline',
    route: '/(tabs)/(texte)/universal',
  },
  {
    id: 'reel',
    label: 'Reel untertiteln',
    icon: 'videocam-outline',
    route: '/(tabs)/(media)/reel',
  },
  {
    id: 'image-studio',
    label: 'Bild erstellen',
    icon: 'image-outline',
    route: '/(tabs)/(media)/image-studio',
  },
  {
    id: 'suche',
    label: 'Programm durchsuchen',
    icon: 'search-outline',
    route: '/(tabs)/(tools)/suche',
  },
  {
    id: 'tools',
    label: 'Weitere Tools',
    icon: 'construct-outline',
    route: '/(tabs)/(tools)/barrierefreiheit',
  },
];

export default function StartScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const { user } = useAuth();

  const firstName = user?.display_name?.split(' ')[0] || 'Grüner';

  const handleFeaturePress = (featureRoute: AppRoute) => {
    router.push(route(featureRoute));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={
          colorScheme === 'dark'
            ? [colors.grey[950], colors.grey[950]]
            : [colors.secondary[50], colors.white]
        }
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 0.4 }}
      />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
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
    flexDirection: 'column',
    paddingVertical: spacing.medium,
    paddingHorizontal: spacing.medium,
    gap: spacing.small,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
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
});
