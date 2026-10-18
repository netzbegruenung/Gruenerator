import { type MarketplaceItem } from '@gruenerator/contracts';
import {
  MARKETPLACE_QUERY_KEY,
  canReport,
  toGalleryAsset,
  useMarketplaceLike,
  useMarketplaceSave,
} from '@gruenerator/shared/marketplace';
import { profilbildAssetParams } from '@gruenerator/shared/stickers';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Linking } from 'react-native';

import { routeWithParams } from '../../types/routes';
import { ReportSheet, type ReportTarget } from '../common/ReportSheet';

import { marketplaceOpenTarget } from './marketplaceTarget';

/** Runs a navigation; a sheet closes itself first and navigates once it is gone. */
export type Navigate = (run: () => void) => void;

const navigateNow: Navigate = (run) => run();

const showError = (error: Error) => Alert.alert('Fehler', error.message);

export interface MarketplaceActions {
  /** Detail page, web viewer or an external Vorlage's own URL. */
  open: (item: MarketplaceItem) => void;
  /** A new chat with the Agent, or with the Rezept's mention typed. */
  startChat: (item: MarketplaceItem) => void;
  /** A sticker or background into the Profilbild. */
  toProfilbild: (item: MarketplaceItem) => void;
  toggleLike: (item: MarketplaceItem) => void;
  /** „Zu meinen Grüneratoren" for Agents and Rezepte, „Merken" for the rest. */
  toggleSave: (item: MarketplaceItem) => void;
  report: (item: MarketplaceItem) => void;
  /** Goes once into the caller's tree. */
  sheets: ReactNode;
}

/** What a Marktplatz item can do, the same on the screen and in the sheet. */
export function useMarketplaceActions(navigate: Navigate = navigateNow): MarketplaceActions {
  const router = useRouter();
  const queryClient = useQueryClient();
  const like = useMarketplaceLike();
  const save = useMarketplaceSave();
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  const open = (item: MarketplaceItem) => {
    const target = marketplaceOpenTarget(item);
    if (target.type === 'route') navigate(() => router.push(target.href));
    else if (target.type === 'url')
      Linking.openURL(target.url).catch(() =>
        Alert.alert('Fehler', 'Die URL konnte nicht geöffnet werden.')
      );
    else if (item.kind === 'template')
      Alert.alert('Keine URL', 'Diese Vorlage hat keine verknüpfte URL.');
  };

  const startChat = (item: MarketplaceItem) => {
    if (item.kind === 'agent')
      navigate(() =>
        router.push(
          routeWithParams('/(focused)/chat-conversation', {
            threadId: 'new',
            agentId: item.agent.slug,
          })
        )
      );
    else if (item.kind === 'recipe')
      // A recipe is a composer mention: the chat opens with it typed.
      navigate(() =>
        router.push(
          routeWithParams('/(focused)/chat-conversation', {
            threadId: 'new',
            initialComposerText: `@${item.recipe.mention} `,
          })
        )
      );
  };

  const toProfilbild = (item: MarketplaceItem) => {
    if (item.kind !== 'sticker' && item.kind !== 'background') return;
    const params = profilbildAssetParams(toGalleryAsset(item));
    navigate(() => router.push({ pathname: '/(focused)/profilbild', params }));
  };

  return {
    open,
    startChat,
    toProfilbild,
    toggleLike: (item) => like.mutate(item, { onError: showError }),
    // A full „Meine Grüneratoren" answers 409 with the server's sentence — shown as is.
    toggleSave: (item) => save.mutate(item, { onError: showError }),
    report: (item) => {
      if (canReport(item)) setReportTarget({ kind: item.reportKind, targetId: item.ref });
    },
    sheets: (
      <ReportSheet
        target={reportTarget}
        onClose={() => setReportTarget(null)}
        onReported={() => void queryClient.invalidateQueries({ queryKey: MARKETPLACE_QUERY_KEY })}
      />
    ),
  };
}
