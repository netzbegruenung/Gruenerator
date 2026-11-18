import { type PublicOwnership } from '@gruenerator/contracts';
import {
  OWNERSHIP_CHOICES,
  OWNERSHIP_LABELS,
  UNLIST,
  planListing,
  type ShareMode,
} from '@gruenerator/shared/grueneratoren';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { colors } from '../../../theme';
import { ListGroup, ListRow, SkeletonRows } from '../../common';
import { DetailSection, Hint, detailStyles, shareLink } from '../detail/DetailParts';

export interface ShareSettingsView {
  share_mode: ShareMode;
  is_public: boolean;
  public_ownership: PublicOwnership | null;
}

export interface SharingControlsProps {
  /** „Agent" oder „Rezept" — für die Sätze. */
  noun: 'Agent' | 'Rezept';
  settings: ShareSettingsView | null;
  settingsLoading: boolean;
  settingsError: boolean;
  groupShares: readonly { id: string; name: string }[];
  /** `null`, solange die eigenen Projekte laden. */
  myGroups: readonly { id: string; name: string }[] | null;
  shareUrl: string;
  shareTitle: string;
  setMode: (mode: ShareMode) => Promise<unknown>;
  setListing: (input: {
    is_public: boolean;
    public_ownership: PublicOwnership | null;
  }) => Promise<unknown>;
  addGroup: (groupId: string) => Promise<unknown>;
  removeGroup: (groupId: string) => Promise<unknown>;
  pending: { mode: boolean; listing: boolean; groups: boolean };
  describeError: (error: unknown) => string;
}

/**
 * Die Freigabe eines eigenen Agents oder Rezepts — dieselben drei Fragen wie
 * `SharingPanel` im Web: In welchen Projekten? Alle mit Anmeldung? Im
 * Marktplatz gelistet? `share_mode` leitet die Fläche ab (aus heisst `groups`,
 * solange Projekte da sind, sonst `private`). Jede Änderung geht sofort an den
 * Server; ein Fehlschlag kommt als Alert mit dem Satz aus `describeError`.
 */
export function SharingControls(props: SharingControlsProps) {
  const { noun, settings, pending, describeError } = props;
  // Schalter an, Eigentumsfrage noch offen: gelistet wird erst mit der Antwort.
  const [askingOwnership, setAskingOwnership] = useState(false);

  const run = (action: Promise<unknown>) =>
    action.catch((error: unknown) => {
      Alert.alert('Freigabe', describeError(error));
      // Abbrechen, damit eine Kette (Höherstufen → Listen) nicht weiterläuft.
      throw error;
    });

  if (props.settingsError) {
    return (
      <View style={detailStyles.scrollContent}>
        <Hint tone="error">Keine Berechtigung, die Freigabe-Einstellungen zu verwalten.</Hint>
      </View>
    );
  }
  if (props.settingsLoading || !settings) {
    return (
      <View style={detailStyles.scrollContent}>
        <SkeletonRows count={4} />
      </View>
    );
  }

  const shareMode = settings.share_mode;
  const isPublic = settings.is_public;
  const sharedIds = new Set(props.groupShares.map((g) => g.id));
  const available = (props.myGroups ?? []).filter((g) => !sharedIds.has(g.id));
  const listingBusy = pending.listing || pending.mode;
  const linkOpen = shareMode === 'authenticated';
  const thing = noun === 'Agent' ? 'den Agent' : 'das Rezept';

  const toggleLink = (checked: boolean) => {
    const next: ShareMode = checked
      ? 'authenticated'
      : props.groupShares.length > 0
        ? 'groups'
        : 'private';
    run(props.setMode(next)).catch(() => {});
  };

  const toggleListing = (checked: boolean) => {
    if (checked) {
      setAskingOwnership(true);
      return;
    }
    if (askingOwnership && !isPublic) {
      setAskingOwnership(false);
      return;
    }
    run(props.setListing(UNLIST))
      .then(() => setAskingOwnership(false))
      .catch(() => {});
  };

  const chooseOwnership = (choice: PublicOwnership) => {
    if (isPublic) {
      run(props.setListing({ is_public: true, public_ownership: choice })).catch(() => {});
      return;
    }
    const plan = planListing(shareMode, choice);
    const list = () => run(props.setListing(plan.listing));
    // Der Server listet nur aus „Mit Anmeldung" — erst heben, dann listen.
    const chain = plan.promote ? run(props.setMode('authenticated')).then(list) : list();
    chain.then(() => setAskingOwnership(false)).catch(() => {});
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={detailStyles.scrollContent}
    >
      <DetailSection title="Projekte und Gruppen">
        <Hint>{`Mitglieder dieser Projekte und Gruppen sehen ${thing} und können ${noun === 'Agent' ? 'ihn' : 'es'} im Chat nutzen.`}</Hint>
        {props.groupShares.length > 0 ? (
          <ListGroup>
            {props.groupShares.map((share, i) => (
              <ListRow
                key={share.id}
                icon="people-outline"
                title={share.name}
                last={i === props.groupShares.length - 1}
                accessory={
                  <Pressable
                    onPress={() => run(props.removeGroup(share.id)).catch(() => {})}
                    disabled={pending.groups}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`${share.name} entfernen`}
                    style={({ pressed }) => [
                      styles.remove,
                      (pressed || pending.groups) && styles.dimmed,
                    ]}
                  >
                    <Ionicons name="remove-circle-outline" size={24} color={colors.error[600]} />
                  </Pressable>
                }
              />
            ))}
          </ListGroup>
        ) : (
          <Hint>In keinem Projekt und keiner Gruppe.</Hint>
        )}
        {available.length > 0 ? (
          <ListGroup>
            {available.map((group, i) => (
              <ListRow
                key={group.id}
                icon="add-circle-outline"
                title={group.name}
                value="Hinzufügen"
                disabled={pending.groups}
                onPress={() => run(props.addGroup(group.id)).catch(() => {})}
                last={i === available.length - 1}
              />
            ))}
          </ListGroup>
        ) : props.myGroups && props.myGroups.length === 0 ? (
          <Hint>{`Du bist noch in keinem Projekt und keiner Gruppe. Tritt einem Projekt oder einer Gruppe bei, um ${noun === 'Agent' ? 'Agents' : 'Rezepte'} zu teilen.`}</Hint>
        ) : null}
      </DetailSection>

      <DetailSection title="Alle mit Anmeldung">
        <ListGroup>
          <ListRow
            icon="link-outline"
            title="Alle mit Anmeldung"
            value={`Alle eingeloggten Nutzer*innen mit dem Link können ${thing} öffnen und im Chat nutzen.`}
            valueLines={3}
            last
            accessory={
              <Switch
                value={linkOpen}
                onValueChange={toggleLink}
                disabled={pending.mode}
                accessibilityLabel="Alle mit Anmeldung"
                trackColor={{ true: colors.primary[600], false: colors.grey[300] }}
              />
            }
          />
        </ListGroup>
      </DetailSection>

      <DetailSection title="Marktplatz">
        <ListGroup>
          {/* Kein onPress auf der Zeile: der Schalter sitzt im selben Pressable,
              ein Tipp hätte sonst zwei Wege (siehe ComposerActionSheet). */}
          <ListRow
            icon="globe-outline"
            title="Im Marktplatz listen"
            value={`Dein ${noun} erscheint dann im Marktplatz unter „Öffentlich“.`}
            valueLines={3}
            last
            accessory={
              <Switch
                value={isPublic || askingOwnership}
                onValueChange={toggleListing}
                disabled={listingBusy}
                accessibilityLabel="Im Marktplatz listen"
                trackColor={{ true: colors.primary[600], false: colors.grey[300] }}
              />
            }
          />
        </ListGroup>
        {!isPublic && !linkOpen ? <Hint>Schaltet „Alle mit Anmeldung“ mit ein.</Hint> : null}
      </DetailSection>

      {isPublic || askingOwnership ? (
        <DetailSection title="Bitte bestätige">
          {!isPublic ? <Hint>Gelistet wird erst, wenn du eine Antwort wählst.</Hint> : null}
          <ListGroup>
            {OWNERSHIP_CHOICES.map((choice, i) => (
              <ListRow
                key={choice}
                dense
                title={OWNERSHIP_LABELS[choice].title}
                value={OWNERSHIP_LABELS[choice].hint}
                valueLines={2}
                selected={settings.public_ownership === choice}
                disabled={listingBusy}
                onPress={() => chooseOwnership(choice)}
                last={i === OWNERSHIP_CHOICES.length - 1}
              />
            ))}
          </ListGroup>
        </DetailSection>
      ) : null}

      <DetailSection title="Link">
        <ListGroup>
          <ListRow
            icon="share-outline"
            title="Link teilen"
            value={props.shareUrl}
            onPress={() => shareLink(props.shareUrl, props.shareTitle)}
            last
          />
        </ListGroup>
        <Hint>
          {linkOpen
            ? 'Alle Eingeloggten mit dem Link können die Seite öffnen.'
            : props.groupShares.length > 0
              ? 'Den Link öffnen nur du und die Mitglieder der Projekte und Gruppen oben.'
              : 'Den Link kannst nur du öffnen.'}
        </Hint>
      </DetailSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  remove: { padding: 2 },
  dimmed: { opacity: 0.5 },
});
