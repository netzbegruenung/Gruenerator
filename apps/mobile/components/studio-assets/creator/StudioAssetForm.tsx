import {
  STUDIO_ASSET_AUDIENCE_LABEL,
  STUDIO_ASSET_RIGHTS_LABEL,
  TITLE_MAX,
  type StudioAssetFormValues,
} from '@gruenerator/shared/studio-assets';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '../../../hooks/useTheme';
import { BODY_FONT, borderRadius, spacing } from '../../../theme';
import { SegmentedControl } from '../../common/SegmentedControl';

import { FieldLabel, SwitchRow } from './creatorParts';

/** Title, tags, public sharing, audience and rights — web's StudioAssetFormFields on the phone. */
export function StudioAssetForm({
  values,
  onChange,
  locale,
  disabled,
}: {
  values: StudioAssetFormValues;
  onChange: (next: StudioAssetFormValues) => void;
  locale: 'de-DE' | 'de-AT';
  disabled: boolean;
}) {
  const theme = useTheme();
  const set = (patch: Partial<StudioAssetFormValues>) => onChange({ ...values, ...patch });
  const input = [
    styles.input,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface },
  ];

  return (
    <View style={styles.root}>
      <View style={styles.field}>
        <FieldLabel>Titel</FieldLabel>
        <TextInput
          value={values.title}
          onChangeText={(title) => set({ title })}
          maxLength={TITLE_MAX}
          editable={!disabled}
          accessibilityLabel="Titel"
          returnKeyType="next"
          style={input}
        />
      </View>
      <View style={styles.field}>
        <FieldLabel>Schlagwörter (optional, mit Komma getrennt)</FieldLabel>
        <TextInput
          value={values.tags}
          onChangeText={(tags) => set({ tags })}
          editable={!disabled}
          autoCapitalize="none"
          accessibilityLabel="Schlagwörter"
          style={input}
        />
      </View>

      <SwitchRow
        label="Unter „Entdecken“ öffentlich teilen"
        value={values.visibility === 'public'}
        onChange={(on) => set({ visibility: on ? 'public' : 'private' })}
        disabled={disabled}
      >
        <View style={styles.field}>
          <FieldLabel>Sichtbar für</FieldLabel>
          <SegmentedControl
            accessibilityLabel="Sichtbar für"
            value={values.audience}
            onChange={(audience) => set({ audience: audience as typeof locale | 'all' })}
            options={([locale, 'all'] as const).map((value) => ({
              value,
              label: STUDIO_ASSET_AUDIENCE_LABEL[value],
              short: STUDIO_ASSET_AUDIENCE_LABEL[value],
              disabled,
            }))}
          />
        </View>
        <SwitchRow
          label={STUDIO_ASSET_RIGHTS_LABEL}
          value={values.rights}
          onChange={(rights) => set({ rights })}
          disabled={disabled}
        />
        {values.rights ? null : (
          <Text style={[styles.note, { color: theme.textSecondary }]}>
            Bestätige die Rechte, damit wir deinen Sticker öffentlich zeigen dürfen.
          </Text>
        )}
      </SwitchRow>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.medium },
  field: { gap: spacing.xsmall },
  input: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.large,
    paddingHorizontal: spacing.small,
    fontFamily: BODY_FONT,
    fontSize: 16,
  },
  note: { fontFamily: BODY_FONT, fontSize: 13 },
});
