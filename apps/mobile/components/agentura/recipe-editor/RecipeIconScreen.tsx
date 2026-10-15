import { router, Stack } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { useRecipeEditorStore } from '../../../stores/recipeEditorStore';
import { spacing } from '../../../theme';
import { IconPickerGrid } from '../IconPickerGrid';

/** Symbol des Rezepts im Entwurf; ein Tipp wählt und kehrt zurück. */
export function RecipeIconScreen() {
  const iconKey = useRecipeEditorStore((s) => s.form.iconKey);
  const update = useRecipeEditorStore((s) => s.update);

  return (
    <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <Stack.Screen options={{ title: 'Symbol' }} />
      <IconPickerGrid
        value={iconKey}
        onChange={(next) => {
          if (next !== iconKey) update({ iconKey: next });
          router.back();
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.medium },
});
