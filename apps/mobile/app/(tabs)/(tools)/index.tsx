import { View, Text, StyleSheet, ScrollView, useColorScheme } from 'react-native';

import { ScreenScaffold } from '../../../components/navigation/ScreenScaffold';
import { ToolCardList } from '../../../components/tools/ToolCardList';
import { TOOLS } from '../../../components/tools/toolsConfig';
import { spacing, lightTheme, darkTheme } from '../../../theme';

export default function ToolsLauncher() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <ScreenScaffold title="Tools">
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.welcomeSection}>
          <Text style={[styles.welcomeText, { color: theme.text }]}>
            Alles, was du für deine Arbeit brauchst
          </Text>
        </View>

        <View style={styles.gridSection}>
          <ToolCardList tools={TOOLS} />
        </View>
      </ScrollView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xxlarge,
  },
  welcomeSection: {
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.xlarge,
    paddingBottom: spacing.small,
  },
  welcomeText: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 28,
  },
  gridSection: {
    paddingTop: spacing.medium,
    paddingHorizontal: spacing.medium,
  },
});
