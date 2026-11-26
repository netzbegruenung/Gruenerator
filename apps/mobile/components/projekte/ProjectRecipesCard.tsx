import { landesverbandTitle } from '@gruenerator/shared/agents';
import { type GroupFeedItem } from '@gruenerator/shared/groups';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { type ShareItemActions } from '../../hooks/useShareItemActions';
import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT } from '../../theme';

import { landesverbandRecipes } from './knowledgeMenu';
import { ProjectKnowledgeList } from './ProjectKnowledgeList';
import { useProjekteTone } from './projekteTone';

interface ProjectRecipesCardProps {
  groupId: string;
  /** Rezepte dieses Projekts (Feed-Einträge der Art `recipe`). */
  items: GroupFeedItem[];
  /** Darf die Person hier etwas ablegen? Sonst kein „+ Rezept“. */
  canAdd: boolean;
  /** Der Landesverband des Projekts: seine Rezepte gelten hier von selbst. */
  landesverband: string | null;
  onOpen: (item: GroupFeedItem) => void;
  shareActions: ShareItemActions | null;
  onDiscuss: ((item: GroupFeedItem) => void) | null;
}

/**
 * „Rezepte“ wie im Web (`ProjectRecipesCard`): die ins Projekt geteilten
 * Rezepte — Chats im Projekt laden sie vorab (`services/groups/projectRecipes.ts`) —
 * und darunter, was der Landesverband des Projekts mitbringt. „+ Rezept“ legt
 * ein neues an und teilt es beim Speichern hierher; das Rezept gehört aber der
 * Person und bleibt auch ohne Projekt bestehen.
 */
export function ProjectRecipesCard({
  groupId,
  items,
  canAdd,
  landesverband,
  onOpen,
  shareActions,
  onDiscuss,
}: ProjectRecipesCardProps) {
  const router = useRouter();
  const theme = useTheme();
  const tone = useProjekteTone();
  const lvRecipes = landesverbandRecipes(landesverband, items);
  const lvTitle = landesverband ? landesverbandTitle(landesverband) : null;

  const openRecipe = (mention: string) =>
    router.push({ pathname: '/(focused)/grueneratoren/rezept/[mention]', params: { mention } });

  return (
    <ProjectKnowledgeList
      title="Rezepte"
      searchLabel="In Rezepten suchen"
      singleKind
      items={items}
      onOpen={onOpen}
      shareActions={shareActions}
      onDiscuss={onDiscuss}
      emptyText={
        lvRecipes.length === 0
          ? 'Halte fest, wie Texte in diesem Projekt gelingen. Chats hier nutzen die Rezepte von selbst.'
          : null
      }
      headerAction={
        canAdd ? (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(focused)/grueneratoren/rezept/neu',
                params: { projekt: groupId },
              })
            }
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Neues Rezept für dieses Projekt"
            style={styles.add}
          >
            <Ionicons name="add" size={18} color={tone.accent} />
            <Text style={[styles.addText, { color: tone.accent }]}>Rezept</Text>
          </Pressable>
        ) : null
      }
      footer={
        lvRecipes.length > 0 ? (
          <Text style={[styles.lv, { color: theme.textSecondary }]}>
            {`Vom Landesverband ${lvTitle ?? ''}: `}
            {lvRecipes.map((recipe, i) => (
              <Text key={recipe.mention}>
                {i > 0 ? ', ' : ''}
                <Text
                  onPress={() => openRecipe(recipe.mention)}
                  accessibilityRole="link"
                  style={{ color: tone.accent }}
                >
                  {recipe.title}
                </Text>
              </Text>
            ))}
          </Text>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  add: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 36, paddingLeft: 4 },
  addText: { fontFamily: BODY_FONT, fontSize: 15, fontWeight: '600' },
  lv: { fontFamily: BODY_FONT, fontSize: 14, lineHeight: 20, paddingTop: 4 },
});
