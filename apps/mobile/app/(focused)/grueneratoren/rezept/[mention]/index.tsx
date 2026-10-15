import {
  useSkillFavoritesStore,
  useUserLandesverbaende,
  type AgentListItem,
} from '@gruenerator/chat';
import { type PublicTextForm, type TextForm } from '@gruenerator/contracts';
import {
  SKILL_CATEGORY_LABELS,
  isLandesverbandIdentifier,
  landesverbandLabel,
} from '@gruenerator/shared/agents';
import { errMessage } from '@gruenerator/shared/groups';
import {
  classifyRecipeMention,
  useDeleteRecipe,
  type RecipeSource,
} from '@gruenerator/shared/grueneratoren';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, ScrollView, View } from 'react-native';

import {
  exampleCountLabel,
  exampleCountOf,
  recipeLibraryRef,
  recipeOriginLine,
  recipeShareUrl,
} from '../../../../../components/agentura/detail/detailFacts';
import {
  DetailHero,
  DetailSection,
  DetailState,
  HeaderButtons,
  HeaderIconButton,
  Hint,
  TextCard,
  detailStyles,
  shareLink,
} from '../../../../../components/agentura/detail/DetailParts';
import { LibraryToggleButton } from '../../../../../components/agentura/detail/LibraryToggleButton';
import { useSkillPrompt } from '../../../../../components/agentura/detail/useSkillPrompt';
import { Button, ListGroup, ListRow, SkeletonRows } from '../../../../../components/common';
import { useRecipeByMention } from '../../../../../hooks/agents/useRecipeByMention';
import { useTheme } from '../../../../../hooks/useTheme';
import { colors } from '../../../../../theme';
import { routeWithParams } from '../../../../../types/routes';
import { goBackOr } from '../../../../../utils/navigation';

/**
 * Die Detailseite eines Rezepts — Katalog, eigenes, aus einem Projekt geteilt
 * oder öffentlich (`useRecipeByMention`), wie `RecipeDetailPage` im Web.
 */
export default function RecipeDetailScreen() {
  const { mention = '' } = useLocalSearchParams<{ mention: string }>();
  const lookup = useRecipeByMention(mention);

  if (lookup.status === 'loading') {
    return (
      <>
        <Stack.Screen options={{ title: '' }} />
        <DetailState kind="loading" />
      </>
    );
  }
  if (lookup.status === 'missing') {
    return (
      <>
        <Stack.Screen options={{ title: 'Rezept' }} />
        <DetailState
          kind="message"
          message={
            // Eine gescheiterte Liste ist kein gelöschtes Rezept.
            lookup.isError
              ? 'Die Rezepte konnten gerade nicht geladen werden. Bitte versuch es später noch einmal.'
              : 'Dieses Rezept ist nicht (mehr) da.'
          }
          actionLabel="Zurück"
          onAction={() => goBackOr('/(focused)/agents')}
        />
      </>
    );
  }
  if (lookup.source === 'system' && lookup.skill) {
    return <SystemRecipe skill={lookup.skill} ownOverride={lookup.ownOverride} />;
  }
  if (lookup.form) return <UserRecipe form={lookup.form} source={lookup.source} />;
  return null;
}

function useOpenRecipeChat() {
  const router = useRouter();
  return (mention: string) =>
    router.push(
      routeWithParams('/(focused)/chat-conversation', {
        threadId: 'new',
        initialComposerText: `@${mention} `,
      })
    );
}

function FavoriteButton({ mention }: { mention: string }) {
  const isFavorite = useSkillFavoritesStore((s) => s.favorites.includes(mention.toLowerCase()));
  const toggle = useSkillFavoritesStore((s) => s.toggleFavorite);
  const theme = useTheme();
  return (
    <HeaderIconButton
      icon={isFavorite ? 'star' : 'star-outline'}
      label={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
      color={isFavorite ? colors.secondary[600] : theme.text}
      onPress={() => toggle(mention)}
    />
  );
}

// ── Katalog ──────────────────────────────────────────────────────────────────

function SystemRecipe({
  skill,
  ownOverride,
}: {
  skill: AgentListItem;
  ownOverride: TextForm | null;
}) {
  const router = useRouter();
  const openChat = useOpenRecipeChat();
  const { lvIds } = useUserLandesverbaende();
  // Der Anleitungstext ist nicht im Bundle; er kommt angemeldet von der API.
  const prompt = useSkillPrompt(skill.mention);

  // Anpassen lässt sich nur ein Preset oder ein Landesverbands-Rezept, dem die
  // Person zugeteilt ist — alles andere lehnte der Server beim Speichern ab.
  const classification = classifyRecipeMention(skill.mention, lvIds);
  const canOverride =
    classification.kind === 'preset' ||
    (classification.kind === 'recipe' && classification.entitled);

  const category = isLandesverbandIdentifier(skill.identifier)
    ? landesverbandLabel(skill.identifier)
    : SKILL_CATEGORY_LABELS[skill.skillCategory ?? 'sonstiges'];

  return (
    <>
      <Stack.Screen
        options={{
          title: skill.title,
          headerRight: () => (
            <HeaderButtons>
              <FavoriteButton mention={skill.mention} />
              <HeaderIconButton
                icon="share-outline"
                label="Link teilen"
                onPress={() => shareLink(recipeShareUrl(skill.mention), skill.title)}
              />
            </HeaderButtons>
          ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={detailStyles.scrollContent}
      >
        <DetailHero
          iconKey={skill.iconKey}
          title={skill.title}
          lines={[`Offizielles Rezept · ${category}`, `@${skill.mention}`]}
        />

        <View style={detailStyles.actions}>
          <Button onPress={() => openChat(skill.mention)}>Im Chat verwenden</Button>
          <LibraryToggleButton kind="recipe" itemRef={skill.mention} />
          {canOverride ? (
            <Button
              variant="outline"
              onPress={() =>
                router.push({
                  pathname: '/(focused)/grueneratoren/rezept-editor',
                  params: { mention: skill.mention },
                })
              }
            >
              {ownOverride ? 'Angepassten Stil bearbeiten' : 'Mit eigenen Beispielen anpassen'}
            </Button>
          ) : null}
        </View>

        {ownOverride ? <Hint>Du nutzt einen angepassten Stil.</Hint> : null}

        {skill.description ? (
          <DetailSection title="Über dieses Rezept">
            <TextCard text={skill.description} />
          </DetailSection>
        ) : null}

        {skill.promptTemplate ? (
          <DetailSection title="Vorlage">
            <TextCard text={skill.promptTemplate} />
          </DetailSection>
        ) : null}

        {prompt.isPending ? (
          <DetailSection title="Anleitung">
            <SkeletonRows count={2} leading={0} />
          </DetailSection>
        ) : prompt.data ? (
          <DetailSection title="Anleitung">
            <TextCard text={prompt.data} />
          </DetailSection>
        ) : null}
      </ScrollView>
    </>
  );
}

// ── Eigene, geteilte und öffentliche Zeilen ─────────────────────────────────

function UserRecipe({ form, source }: { form: TextForm | PublicTextForm; source: RecipeSource }) {
  const router = useRouter();
  const openChat = useOpenRecipeChat();
  const deleteRecipe = useDeleteRecipe();
  const isOwn = source === 'own';
  const libraryRef = recipeLibraryRef(source, form.mention, form.id);

  const confirmDelete = () =>
    Alert.alert(
      'Rezept löschen?',
      `„${form.title}“ liegt danach 30 Tage im Papierkorb und lässt sich dort wiederherstellen.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () =>
            deleteRecipe.mutate(form.mention, {
              onSuccess: () => goBackOr('/(focused)/agents'),
              onError: (error) => Alert.alert('Fehler', errMessage(error)),
            }),
        },
      ]
    );

  return (
    <>
      <Stack.Screen
        options={{
          title: form.title,
          headerRight: () => (
            <HeaderButtons>
              <FavoriteButton mention={form.mention} />
              <HeaderIconButton
                icon="share-outline"
                label={isOwn ? 'Teilen' : 'Link teilen'}
                onPress={() =>
                  isOwn
                    ? router.push({
                        pathname: '/(focused)/grueneratoren/rezept/[mention]/teilen',
                        params: { mention: form.mention },
                      })
                    : shareLink(recipeShareUrl(form.mention), form.title)
                }
              />
            </HeaderButtons>
          ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={detailStyles.scrollContent}
      >
        <DetailHero
          iconKey={form.iconKey ?? 'PiSparkle'}
          title={form.title}
          lines={[recipeOriginLine(form, source) ?? 'Eigenes Rezept', `@${form.mention}`]}
        />

        <View style={detailStyles.actions}>
          <Button onPress={() => openChat(form.mention)}>Im Chat verwenden</Button>
          {libraryRef ? <LibraryToggleButton kind="recipe" itemRef={libraryRef} /> : null}
          {isOwn ? (
            <Button
              variant="outline"
              onPress={() =>
                router.push({
                  pathname: '/(focused)/grueneratoren/rezept-editor',
                  params: { mention: form.mention },
                })
              }
            >
              Bearbeiten
            </Button>
          ) : null}
        </View>

        {form.description ? (
          <DetailSection title="Über dieses Rezept">
            <TextCard text={form.description} />
          </DetailSection>
        ) : null}

        <DetailSection title="Anleitung">
          {form.styleBlock ? (
            <TextCard text={form.styleBlock} />
          ) : (
            <Hint>Für dieses Rezept ist noch keine Anleitung hinterlegt.</Hint>
          )}
        </DetailSection>

        {/* Die Beispieltexte selbst bleiben verborgen — sie sind das eigene
            Schreiben der Person; veröffentlicht wird die Anleitung. */}
        <DetailSection title="Beispiele">
          <Hint>{exampleCountLabel(exampleCountOf(form))}</Hint>
        </DetailSection>

        {isOwn ? (
          <ListGroup>
            <ListRow
              icon="trash-outline"
              title="Rezept löschen"
              value="Liegt danach 30 Tage im Papierkorb."
              destructive
              disabled={deleteRecipe.isPending}
              onPress={confirmDelete}
              last
            />
          </ListGroup>
        ) : null}
      </ScrollView>
    </>
  );
}
