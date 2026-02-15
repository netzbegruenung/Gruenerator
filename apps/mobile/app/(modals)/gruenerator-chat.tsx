/**
 * Legacy chat modal — redirects to the new streaming Chat tab.
 * Kept as a redirect so any existing navigation links still work.
 */
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

export default function GrueneratorChatModal() {
  const router = useRouter();
  const { initialMessage } = useLocalSearchParams<{ initialMessage?: string }>();

  useEffect(() => {
    if (initialMessage) {
      router.replace({
        pathname: '/(tabs)/(chat)/new' as any,
        params: { initialMessage },
      });
    } else {
      router.replace('/(tabs)/(chat)' as any);
    }
  }, [router, initialMessage]);

  return null;
}
