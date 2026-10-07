import { useLocalSearchParams } from 'expo-router';

import { BildEditorScreen } from '../../components/image-studio/bild-editor/BildEditorScreen';

export default function BildEditorRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  return <BildEditorScreen initialMode={mode === 'sharepic' ? 'sharepic' : 'erstellen'} />;
}
