import { EditorSubPage } from '../../../../components/agentura/editor/EditorSubPage';
import { useRecipeChoices } from '../../../../components/agentura/editor/useEditorChoices';
import { FormSection } from '../../../../components/agentura/recipe-editor/FormParts';
import { ListRow, SkeletonRows } from '../../../../components/common';
import { useAgentEditorStore } from '../../../../stores/agentEditorStore';

/**
 * Das Rezept, das der Chat für diesen Agent lädt, wenn niemand eins wählt. Ein
 * System-Rezept zählt über seine Erwähnung, ein eigenes/öffentliches über die
 * Zeilen-Id — die übersteht eine Umbenennung (wie web `RecipePicker`).
 */
export default function AgentRecipePage() {
  const mention = useAgentEditorStore((s) => s.form.defaultRecipeMention);
  const recipeId = useAgentEditorStore((s) => s.form.defaultRecipeId);
  const patch = useAgentEditorStore((s) => s.patch);
  const { system, custom, customLoading } = useRecipeChoices();

  const choose = (next: { mention: string | null; id: string | null }) =>
    patch({ defaultRecipeMention: next.mention, defaultRecipeId: next.id });

  // Ein gespeichertes Rezept, das hier nicht (mehr) angeboten wird, bleibt sichtbar.
  const orphan =
    mention !== null &&
    !recipeId &&
    !system.some((s) => s.mention === mention) &&
    !custom.some((c) => c.mention === mention);

  return (
    <EditorSubPage title="Standard-Rezept">
      <FormSection footer="Wird geladen, wenn du im Chat kein Rezept wählst.">
        <ListRow
          dense
          title="Kein Standard-Rezept"
          selected={mention === null && recipeId === null}
          onPress={() => choose({ mention: null, id: null })}
          last={!orphan}
        />
        {orphan ? (
          <ListRow
            dense
            title={`@${mention}`}
            value="Nicht mehr in der Auswahl"
            selected
            onPress={() => choose({ mention, id: null })}
            last
          />
        ) : null}
      </FormSection>

      {customLoading ? (
        <SkeletonRows count={2} leading={0} meta={false} />
      ) : custom.length > 0 ? (
        <FormSection title="Meine Rezepte">
          {custom.map((o, i) => (
            <ListRow
              key={o.id}
              dense
              title={o.title}
              value={`@${o.mention}`}
              selected={recipeId === o.id}
              onPress={() => choose({ mention: o.mention, id: o.id })}
              last={i === custom.length - 1}
            />
          ))}
        </FormSection>
      ) : null}

      <FormSection title="Rezepte">
        {system.map((s, i) => (
          <ListRow
            key={s.mention}
            dense
            title={s.title}
            value={`@${s.mention}`}
            selected={!recipeId && mention === s.mention}
            onPress={() => choose({ mention: s.mention, id: null })}
            last={i === system.length - 1}
          />
        ))}
      </FormSection>
    </EditorSubPage>
  );
}
