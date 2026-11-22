import { buildGroupInviteUrl } from '@gruenerator/shared/groups';
import { Platform, Share } from 'react-native';

/** Opens the native share sheet with the project's invite link; no-op without a join token. */
export function shareProjectInvite(
  group: { name: string; join_token?: string | null },
  onError: (error: Error) => void
): void {
  if (!group.join_token) return;
  const url = buildGroupInviteUrl(group.join_token);
  const title = group.name;
  void Share.share(Platform.OS === 'ios' ? { url, title } : { message: url, title }).catch(onError);
}
