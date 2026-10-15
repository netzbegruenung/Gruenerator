import {
  useMyGroupsForSharing,
  useRecipeGroupShares,
  useRecipeShareSettings,
  useSetRecipeIsPublic,
  useSetRecipeShareMode,
  useShareRecipeWithGroup,
  useUnshareRecipeFromGroup,
} from '@gruenerator/shared/grueneratoren';
import { Stack, useLocalSearchParams } from 'expo-router';

import { recipeShareUrl } from '../../../../../components/agentura/detail/detailFacts';
import { DetailState } from '../../../../../components/agentura/detail/DetailParts';
import { shareErrorText } from '../../../../../components/agentura/share/shareRules';
import { SharingControls } from '../../../../../components/agentura/share/SharingControls';
import { useRecipeByMention } from '../../../../../hooks/agents/useRecipeByMention';
import { goBackOr } from '../../../../../utils/navigation';

/**
 * Freigabe eines eigenen Rezepts — wie `RecipeSharingPanel` im Web. Ein
 * angepasstes System-Rezept ist keine eigene Textform und lässt sich nicht
 * teilen; die Detailseite bietet dafür keinen Weg hierher.
 */
export default function RecipeShareScreen() {
  const { mention = '' } = useLocalSearchParams<{ mention: string }>();
  const lookup = useRecipeByMention(mention);

  if (lookup.status !== 'ready' || lookup.source !== 'own' || !lookup.form) {
    return (
      <>
        <Stack.Screen options={{ title: 'Teilen' }} />
        {lookup.status === 'loading' ? (
          <DetailState kind="loading" />
        ) : (
          <DetailState
            kind="message"
            message="Teilen lassen sich nur eigene Rezepte."
            actionLabel="Zurück"
            onAction={() => goBackOr('/(focused)/agents')}
          />
        )}
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Rezept teilen' }} />
      <RecipeSharing mention={lookup.form.mention} title={lookup.form.title} />
    </>
  );
}

function RecipeSharing({ mention, title }: { mention: string; title: string }) {
  const settings = useRecipeShareSettings(mention);
  const groupShares = useRecipeGroupShares(mention);
  const myGroups = useMyGroupsForSharing(true);
  const setMode = useSetRecipeShareMode(mention);
  const setListing = useSetRecipeIsPublic(mention);
  const share = useShareRecipeWithGroup();
  const unshare = useUnshareRecipeFromGroup();

  return (
    <SharingControls
      noun="Rezept"
      settings={settings.data ?? null}
      settingsLoading={settings.isLoading}
      settingsError={settings.isError}
      groupShares={groupShares.map((g) => ({ id: g.groupId, name: g.groupName }))}
      myGroups={myGroups.data ?? null}
      authenticatedHint="Sichtbar nur für eingeloggte Nutzer*innen."
      shareUrl={recipeShareUrl(mention)}
      shareTitle={title}
      setMode={(mode) => setMode.mutateAsync(mode)}
      setListing={(input) => setListing.mutateAsync(input)}
      addGroup={(groupId) => share.mutateAsync({ mention, groupId })}
      removeGroup={(groupId) => unshare.mutateAsync({ mention, groupId })}
      pending={{
        mode: setMode.isPending,
        listing: setListing.isPending,
        groups: share.isPending || unshare.isPending,
      }}
      describeError={shareErrorText}
    />
  );
}
