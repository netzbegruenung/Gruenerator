import { GRUENERATOR_FRIENDS, getRobotAvatarPath } from '@gruenerator/shared/avatar';
import { toast } from '@gruenerator/ui';
import { useShareLinks } from '@gruenerator/wolke';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Lock } from 'lucide-react';

import { useProfile } from '@/features/auth/hooks/useProfileData';
import { profileApiService, type Profile } from '@/features/auth/services/profileApiService';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { cn } from '@/utils/cn';

const FriendsTab = () => {
  const userId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();
  const updateAvatarOptimistic = useProfileStore((s) => s.updateAvatarOptimistic);
  const { data: profileData } = useProfile(userId);
  const profile = profileData as Profile | undefined;
  // Wolki stays locked until the user has connected their Wolke.
  const { data: shareLinks = [] } = useShareLinks();
  const wolkeConnected = shareLinks.length > 0;

  const selectedId = Number(profile?.avatar_robot_id ?? 1);

  const selectMutation = useMutation({
    mutationFn: async (friendId: number) => profileApiService.updateAvatar(friendId),
    onMutate: async (friendId: number) => {
      await queryClient.cancelQueries({ queryKey: ['profileData', userId] });
      const previous = queryClient.getQueryData<Profile>(['profileData', userId]);
      queryClient.setQueryData<Profile>(['profileData', userId], (old) =>
        old ? { ...old, avatar_robot_id: friendId } : { avatar_robot_id: friendId }
      );
      return { previous };
    },
    onSuccess: (_updated, friendId) => {
      void updateAvatarOptimistic(String(friendId));
      window.dispatchEvent(
        new CustomEvent('avatarUpdated', { detail: { avatarRobotId: friendId } })
      );
      const friend = GRUENERATOR_FRIENDS.find((f) => f.id === friendId);
      toast.success(`${friend?.name ?? 'Avatar'} ist jetzt dein Profilbild.`);
    },
    onError: (_error, _friendId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['profileData', userId], context.previous);
      }
      toast.error('Avatar konnte nicht gespeichert werden.');
    },
  });

  return (
    <div className="flex flex-col gap-lg">
      <p className="m-0 text-xs text-grey-500 dark:text-grey-400">
        Wähle, wer dich im Grünerator vertritt. Dein Friend erscheint als Profilbild in Chats,
        Projekten und Kommentaren.
      </p>

      <div className="grid grid-cols-3 gap-sm sm:grid-cols-4">
        {GRUENERATOR_FRIENDS.map((friend) => {
          const isLocked = friend.unlock === 'wolke' && !wolkeConnected;
          const isSelected = selectedId === friend.id;

          return (
            <button
              key={friend.id}
              type="button"
              onClick={() => !isLocked && selectMutation.mutate(friend.id)}
              disabled={isLocked || selectMutation.isPending}
              aria-pressed={isSelected}
              aria-label={
                isLocked
                  ? `${friend.name} — verbinde deine Wolke zum Freischalten`
                  : `${friend.name} auswählen`
              }
              title={isLocked ? 'Verbinde deine Wolke, um Wolki freizuschalten' : friend.tagline}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-lg border p-2 text-center transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30',
                isLocked
                  ? 'cursor-not-allowed border-transparent opacity-40'
                  : 'hover:bg-background-alt',
                isSelected && !isLocked
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20'
                  : 'border-grey-200 dark:border-grey-700'
              )}
            >
              <div className="relative aspect-square w-full">
                <img
                  src={getRobotAvatarPath(friend.id)}
                  alt={friend.name}
                  className={cn('size-full object-contain', isLocked && 'grayscale')}
                  width={88}
                  height={88}
                  loading="lazy"
                  decoding="async"
                />
                {isSelected && !isLocked && (
                  <span className="absolute top-0 right-0 flex size-4 items-center justify-center rounded-full bg-primary-500 text-white">
                    <Check className="size-2.5" />
                  </span>
                )}
                {isLocked && (
                  <span className="absolute top-0 right-0 flex size-4 items-center justify-center rounded-full bg-grey-400 text-white dark:bg-grey-600">
                    <Lock className="size-2.5" />
                  </span>
                )}
              </div>
              <span className="text-xs font-medium text-foreground">{friend.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default FriendsTab;
