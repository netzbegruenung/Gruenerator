import {
  GRUENERATOR_FRIENDS,
  STARTER_FRIENDS,
  getRobotAvatarPath,
  type StarterElement,
} from '@gruenerator/shared/avatar';
import { toast } from '@gruenerator/ui';
import { fetchShareLinks, useShareLinks, wolkeKeys } from '@gruenerator/wolke';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Check, Lock } from 'lucide-react';

import { useOnboarding } from '../useOnboarding';

import { QUERY_KEYS, useProfile } from '@/features/auth/hooks/useProfileData';
import { profileApiService, type Profile } from '@/features/auth/services/profileApiService';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { cn } from '@/utils/cn';

export const prefetch = (queryClient: QueryClient) => {
  const userId = useAuthStore.getState().user?.id;
  if (userId) {
    void queryClient.prefetchQuery({
      queryKey: QUERY_KEYS.profile(userId),
      queryFn: profileApiService.getProfile,
      staleTime: 15 * 60 * 1000,
    });
  }
  // Decides whether Wolki renders unlocked — without it the tab paints a lock
  // it then has to take away again.
  void queryClient.prefetchQuery({
    queryKey: wolkeKeys.shareLinks(),
    queryFn: () => fetchShareLinks(),
    staleTime: 30_000,
  });
};

/**
 * Die Farben der drei Starter. Fest an der Figur, nicht an der Auswahl — die
 * Auswahl entscheidet nur, wie kräftig der Ring ausfällt. Ein Ring, der beim
 * Anklicken die Farbe wechselt, würde die Zuordnung Figur→Element auflösen,
 * die den Dreier überhaupt lesbar macht.
 *
 * Ganze Klassennamen, keine zusammengesetzten: Tailwind liest den Quelltext,
 * ein `ring-${farbe}-500` stünde am Ende in keinem Stylesheet.
 */
const STARTER_STYLE: Record<StarterElement, { ring: string; idle: string; tint: string }> = {
  feuer: { ring: 'ring-red-500', idle: 'ring-red-500/40', tint: 'bg-red-500/10' },
  natur: { ring: 'ring-emerald-500', idle: 'ring-emerald-500/40', tint: 'bg-emerald-500/10' },
  wasser: { ring: 'ring-sky-500', idle: 'ring-sky-500/40', tint: 'bg-sky-500/10' },
};

const NEUTRAL_STYLE = {
  ring: 'ring-primary-500',
  idle: 'ring-grey-200 dark:ring-grey-700',
  tint: 'bg-background-alt',
};

const FriendsTab = () => {
  const userId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();
  const updateAvatarOptimistic = useProfileStore((s) => s.updateAvatarOptimistic);
  const { data: profileData } = useProfile(userId);
  const profile = profileData as Profile | undefined;
  // Wolki stays locked until the user has connected their Wolke.
  const { data: shareLinks = [] } = useShareLinks();
  const wolkeConnected = shareLinks.length > 0;

  // Solange die Einrichtung läuft, steht nur der Dreier zur Wahl. Danach ist er
  // getroffen und die ganze Truppe kommt dazu — dieselbe Reihenfolge wie beim
  // Starter, den man zuerst wählt und dessen Gesellschaft man später sammelt.
  const { isActive: isOnboarding } = useOnboarding();
  const friends = isOnboarding ? STARTER_FRIENDS : GRUENERATOR_FRIENDS;

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
        {isOnboarding
          ? 'Such dir einen aus — Feuer, Natur oder Wasser. Dein Friend erscheint als Profilbild in Chats, Projekten und Kommentaren, und die übrige Truppe kannst du später hier wechseln.'
          : 'Wähle, wer dich im Grünerator vertritt. Dein Friend erscheint als Profilbild in Chats, Projekten und Kommentaren.'}
      </p>

      <div
        className={cn('grid gap-sm', isOnboarding ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-4')}
      >
        {friends.map((friend) => {
          const isLocked = friend.unlock === 'wolke' && !wolkeConnected;
          const isSelected = selectedId === friend.id;
          const style = friend.starter ? STARTER_STYLE[friend.starter] : NEUTRAL_STYLE;

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
                'flex flex-col items-center gap-2 rounded-lg p-2 text-center transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30',
                isLocked ? 'cursor-not-allowed opacity-40' : 'hover:bg-background-alt'
              )}
            >
              <div
                className={cn(
                  'relative aspect-square w-full rounded-full p-1.5 transition-all',
                  style.tint,
                  isSelected && !isLocked ? cn('ring-4', style.ring) : cn('ring-2', style.idle)
                )}
              >
                <img
                  src={getRobotAvatarPath(friend.id)}
                  alt=""
                  className={cn('size-full object-contain', isLocked && 'grayscale')}
                  width={88}
                  height={88}
                  loading="lazy"
                  decoding="async"
                />
                {isSelected && !isLocked && (
                  <span className="absolute right-0 bottom-0 flex size-5 items-center justify-center rounded-full bg-primary-500 text-white ring-2 ring-background">
                    <Check className="size-3" />
                  </span>
                )}
                {isLocked && (
                  <span className="absolute right-0 bottom-0 flex size-5 items-center justify-center rounded-full bg-grey-400 text-white ring-2 ring-background dark:bg-grey-600">
                    <Lock className="size-3" />
                  </span>
                )}
              </div>
              <span className="text-xs font-medium text-foreground">{friend.name}</span>
              {isOnboarding && (
                <span className="text-[0.6875rem] leading-snug text-grey-500 dark:text-grey-400">
                  {friend.tagline}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default FriendsTab;
