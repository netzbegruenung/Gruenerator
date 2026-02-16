import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NotebookChat } from '../../components/notebooks';
import { lightTheme, darkTheme } from '../../theme';

export default function NotebookChatScreen() {
  const { notebookId } = useLocalSearchParams<{ notebookId: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  if (!notebookId) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <NotebookChat notebookId={notebookId} onBack={() => router.back()} />
    </SafeAreaView>
  );
}
