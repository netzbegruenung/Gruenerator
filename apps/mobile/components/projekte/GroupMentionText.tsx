import { groupMentionSegments } from '@gruenerator/shared/utils';
import { Text } from 'react-native';

import { useTheme } from '../../hooks/useTheme';

/** Text mit hervorgehobenen Erwähnungen (`@Name`, `@alle`) — innerhalb eines `<Text>`. */
export function GroupMentionText({ text }: { text: string }) {
  const theme = useTheme();
  let offset = 0;
  return groupMentionSegments(text).map((s) => {
    const key = `m-${offset}`;
    offset += s.kind === 'text' ? s.text.length : s.raw.length;
    if (s.kind === 'text') return <Text key={key}>{s.text}</Text>;
    return (
      <Text key={key} style={{ color: theme.textGreen, fontWeight: '600' }}>
        {s.kind === 'all' ? s.raw : `@${s.label}`}
      </Text>
    );
  });
}
