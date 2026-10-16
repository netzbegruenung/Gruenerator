import { Text } from 'react-native';

import { keyedMentionSegments } from './keyedMentionSegments';
import { useProjekteTone } from './projekteTone';

/** Text mit hervorgehobenen Erwähnungen (`@Name`, `@alle`) — innerhalb eines `<Text>`. */
export function GroupMentionText({ text }: { text: string }) {
  const tone = useProjekteTone();
  return keyedMentionSegments(text).map(({ key, segment: s }) => {
    if (s.kind === 'text') return <Text key={key}>{s.text}</Text>;
    return (
      <Text key={key} style={{ color: tone.accent, fontWeight: '600' }}>
        {s.kind === 'all' ? s.raw : `@${s.label}`}
      </Text>
    );
  });
}
