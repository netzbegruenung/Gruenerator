import { LinearGradient } from 'expo-linear-gradient';
import { View, Text, StyleSheet, ScrollView, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileMenu } from '../../../components/navigation/ProfileMenu';
import { SidebarMenuButton } from '../../../components/navigation/SidebarMenuButton';
import { ToolGrid } from '../../../components/tools/ToolGrid';
import { TOOLS } from '../../../components/tools/toolsConfig';
import { colors, spacing, lightTheme, darkTheme } from '../../../theme';

export default function ToolsLauncher() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={
          colorScheme === 'dark'
            ? [colors.grey[950], colors.grey[950]]
            : [colors.white, 'rgba(95, 133, 117, 0.05)']
        }
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
      <View style={styles.header}>
        <View style={styles.headerSide}>
          <SidebarMenuButton color={theme.text} size={24} />
        </View>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Tools</Text>
        <View style={[styles.headerSide, styles.headerSideRight]}>
          <ProfileMenu />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.welcomeSection}>
          <Text style={[styles.welcomeText, { color: theme.text }]}>Werkzeuge</Text>
          <Text style={[styles.welcomeSubtitle, { color: theme.textSecondary }]}>
            Tippe ein Werkzeug an · halte gedrückt für Favoriten
          </Text>
        </View>

        <View style={styles.gridSection}>
          <ToolGrid tools={TOOLS} large />
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
    alignItems: 'center',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  headerSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSideRight: {
    justifyContent: 'flex-end',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  scrollContent: {
    paddingBottom: spacing.xxlarge,
  },
  welcomeSection: {
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.xlarge,
    paddingBottom: spacing.small,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: '700',
  },
  welcomeSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  gridSection: {
    paddingTop: spacing.large,
    paddingHorizontal: spacing.small,
  },
});
