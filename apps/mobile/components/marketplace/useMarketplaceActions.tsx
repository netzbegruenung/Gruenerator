import { type MarketplaceItem } from '@gruenerator/contracts';
import { toGalleryAsset, useMarketplaceSave } from '@gruenerator/shared/marketplace';
import { profilbildAssetParams } from '@gruenerator/shared/stickers';
import { useRouter } from 'expo-router';
import { Alert, Linking } from 'react-native';

import { routeWithParams } from '../../types/routes';

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
  /** „Zu meinen Grüneratoren" for Agents and Rezepte, „Merken" for the rest. */
  toggleSave: (item: MarketplaceItem) => void;
}

/**
 * What a Marktplatz item can do, the same on the screen and in the sheet. Like
 * and report sit in the item's interaction block (`MarketplaceDiscussion`).
 */
export function useMarketplaceActions(navigate: Navigate = navigateNow): MarketplaceActions {
  const router = useRouter();
  const save = useMarketplaceSave();

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
    // A full „Meine Grüneratoren" answers 409 with the server's sentence — shown as is.
    toggleSave: (item) => save.mutate(item, { onError: showError }),
  };
}
