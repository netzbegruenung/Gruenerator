import { Text } from 'react-native';

import { useTheme } from '../../hooks/useTheme';

import { keyedMentionSegments } from './keyedMentionSegments';

/** Text mit hervorgehobenen Erwähnungen (`@Name`, `@alle`) — innerhalb eines `<Text>`. */
export function GroupMentionText({ text }: { text: string }) {
  const theme = useTheme();
  return keyedMentionSegments(text).map(({ key, segment: s }) => {
    if (s.kind === 'text') return <Text key={key}>{s.text}</Text>;
    return (
      <Text key={key} style={{ color: theme.textGreen, fontWeight: '600' }}>
        {s.kind === 'all' ? s.raw : `@${s.label}`}
      </Text>
    );
  });
}
