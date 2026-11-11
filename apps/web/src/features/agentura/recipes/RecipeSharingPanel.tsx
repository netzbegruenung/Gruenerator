/**
 * Die Freigabe eines eigenen Rezepts — die Rezept-Hooks im {@link SharingPanel}.
 * Zwei Aufrufer: {@link ShareRecipeModal} (Detailseite) und der Teilen-Tab des
 * {@link RecipeEditor}. Die Fehlertexte stammen vom Server (`useRecipeSharing`
 * trägt sie mit) — ein angepasstes System-Rezept ist keine eigene Textform, und
 * nur sein Satz erklärt, warum die Freigabe abgelehnt wird.
 *
 * Nur für Eigentümer*innen: Aufrufer prüfen das vorher.
 */
import {
  recipeSharePath,
  useMyGroupsForSharing,
  useRecipeGroupShares,
  useRecipeShareSettings,
  useSetRecipeIsPublic,
  useSetRecipeShareMode,
  useShareRecipeWithGroup,
  useUnshareRecipeFromGroup,
} from '@gruenerator/shared/grueneratoren';

import { SharingPanel } from '../components/SharingPanel';

import { getPublicAppOrigin } from '@/utils/platform';

interface RecipeSharingPanelProps {
  /** The recipe's mention — its handle on every sharing endpoint. */
  mention: string;
  /** Whether the surface holding the panel is on screen; gates the queries. */
  enabled: boolean;
}

export function RecipeSharingPanel({ mention, enabled }: RecipeSharingPanelProps) {
  const settingsQuery = useRecipeShareSettings(enabled ? mention : null);
  const groupShares = useRecipeGroupShares(enabled ? mention : null);
  const myGroupsQuery = useMyGroupsForSharing(enabled);

  const setShareMode = useSetRecipeShareMode(mention);
  const setIsPublic = useSetRecipeIsPublic(mention);
  const shareWithGroup = useShareRecipeWithGroup();
  const unshareFromGroup = useUnshareRecipeFromGroup();

  return (
    <SharingPanel
      noun="Rezept"
      settings={settingsQuery.data ?? null}
      settingsLoading={settingsQuery.isLoading}
      settingsError={settingsQuery.isError}
      groupShares={groupShares.map((g) => ({ id: g.groupId, name: g.groupName }))}
      myGroups={myGroupsQuery.data ?? null}
      authenticatedHint="Sichtbar nur für eingeloggte Nutzer*innen."
      shareUrl={`${getPublicAppOrigin()}${recipeSharePath(mention)}`}
      setMode={(mode) => setShareMode.mutateAsync(mode)}
      setListing={(input) => setIsPublic.mutateAsync(input)}
      addGroup={(groupId) => shareWithGroup.mutateAsync({ mention, groupId })}
      removeGroup={(groupId) => unshareFromGroup.mutateAsync({ mention, groupId })}
      pending={{
        mode: setShareMode.isPending,
        listing: setIsPublic.isPending,
        groups: shareWithGroup.isPending || unshareFromGroup.isPending,
      }}
    />
  );
}
