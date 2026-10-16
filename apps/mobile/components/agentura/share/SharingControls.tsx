import { type PublicOwnership } from '@gruenerator/contracts';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { colors } from '../../../theme';
import { ListGroup, ListRow, SkeletonRows } from '../../common';
import { DetailSection, Hint, detailStyles, shareLink } from '../detail/DetailParts';

import {
  OWNERSHIP_LABELS,
  SHARE_MODES,
  SHARE_MODE_LABELS,
  planListingToggle,
  type ShareMode,
} from './shareRules';

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
  authenticatedHint: string;
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
 * Die Freigabe eines eigenen Agents oder Rezepts — dieselben Achsen wie
 * `ShareAgentModal` und `RecipeSharingPanel` im Web: Sichtbarkeit, Projekte,
 * Listung unter „Öffentlich" samt Eigentumsfrage. Jede Änderung geht sofort an
 * den Server; ein Fehlschlag kommt als Alert mit dem Satz aus `describeError`.
 */
export function SharingControls(props: SharingControlsProps) {
  const { noun, settings, pending, describeError } = props;

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

  const toggleListing = (checked: boolean) => {
    const plan = planListingToggle(checked, shareMode, settings.public_ownership);
    const list = () => run(props.setListing(plan.listing));
    // Der Server listet nur aus „Mit Anmeldung" — erst heben, dann listen.
    const chain = plan.promote ? run(props.setMode('authenticated')).then(list) : list();
    chain.catch(() => {});
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={detailStyles.scrollContent}
    >
      <DetailSection title="Sichtbarkeit">
        <ListGroup>
          {SHARE_MODES.map((mode, i) => (
            <ListRow
              key={mode}
              dense
              title={SHARE_MODE_LABELS[mode]}
              selected={shareMode === mode}
              disabled={pending.mode}
              onPress={() => {
                if (mode !== shareMode) run(props.setMode(mode)).catch(() => {});
              }}
              last={i === SHARE_MODES.length - 1}
            />
          ))}
        </ListGroup>
        {shareMode === 'authenticated' ? <Hint>{props.authenticatedHint}</Hint> : null}
      </DetailSection>

      {shareMode === 'groups' ? (
        <DetailSection title="Projekte">
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
            <Hint>Noch keine Projekte hinzugefügt.</Hint>
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
            <Hint>{`Du bist noch in keinem Projekt. Tritt einem Projekt bei, um ${noun === 'Agent' ? 'Agents' : 'Rezepte'} zu teilen.`}</Hint>
          ) : null}
        </DetailSection>
      ) : null}

      <DetailSection title="Öffentlich">
        <ListGroup>
          {/* Kein onPress auf der Zeile: der Schalter sitzt im selben Pressable,
              ein Tipp hätte sonst zwei Wege (siehe ComposerActionSheet). */}
          <ListRow
            icon="globe-outline"
            title="Auf „Öffentlich“ listen"
            value={`Dein ${noun} erscheint dann in der Agentura unter „Öffentlich“ zum Entdecken.`}
            valueLines={3}
            last
            accessory={
              <Switch
                value={isPublic}
                onValueChange={toggleListing}
                disabled={listingBusy}
                accessibilityLabel="Auf „Öffentlich“ listen"
                trackColor={{ true: colors.primary[600], false: colors.grey[300] }}
              />
            }
          />
        </ListGroup>
        {!isPublic && shareMode !== 'authenticated' ? (
          <Hint>
            Beim Aktivieren wird die Sichtbarkeit auf „Mit Anmeldung — alle eingeloggten
            Nutzer*innen“ gesetzt.
          </Hint>
        ) : null}
      </DetailSection>

      {isPublic ? (
        <DetailSection title="Bitte bestätige">
          <ListGroup>
            {(['owner', 'public_data'] as const).map((choice, i) => (
              <ListRow
                key={choice}
                dense
                title={OWNERSHIP_LABELS[choice].title}
                value={OWNERSHIP_LABELS[choice].hint}
                valueLines={2}
                selected={settings.public_ownership === choice}
                disabled={pending.listing}
                onPress={() =>
                  run(props.setListing({ is_public: true, public_ownership: choice })).catch(
                    () => {}
                  )
                }
                last={i === 1}
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
          {shareMode === 'private'
            ? 'Solange die Sichtbarkeit „Privat“ ist, kannst nur du den Link öffnen.'
            : 'Der Link öffnet die Seite für alle, die nach der Sichtbarkeit Zugriff haben.'}
        </Hint>
      </DetailSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  remove: { padding: 2 },
  dimmed: { opacity: 0.5 },
});
