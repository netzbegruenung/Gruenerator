import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';

import { ResearchDocumentReader } from '../../components/notebook/ResearchDocumentReader';
import { darkTheme, lightTheme } from '../../theme';

import type { ModalRouteParams } from '../../types/routes';

export default function NotebookReaderScreen() {
  const { collectionId, sourceUrl, query, title } =
    useLocalSearchParams<ModalRouteParams['/(focused)/notebook-reader']>();
  const router = useRouter();
  const theme = useColorScheme() === 'dark' ? darkTheme : lightTheme;

  return (
    <ResearchDocumentReader
      collectionId={collectionId}
      sourceUrl={sourceUrl}
      query={query ?? ''}
      title={title ?? ''}
      theme={theme}
      onClose={() => router.back()}
    />
  );
}
