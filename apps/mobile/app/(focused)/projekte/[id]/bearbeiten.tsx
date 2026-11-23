import { type LandesverbandId } from '@gruenerator/contracts';
import {
  landesverbandOptions,
  GROUP_COLOR_KEYS,
  GROUP_COLOR_STYLES,
  resolveGroupColor,
  type GroupColor,
} from '@gruenerator/shared/groups';
import { useAuth } from '@gruenerator/shared/hooks';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { SheetHeader } from '../../../../components/projekte/SheetHeader';
import { useGroupDetails, useUpdateGroupInfo } from '../../../../hooks/useGroups';
import { useTheme } from '../../../../hooks/useTheme';
import { useNoticeStore } from '../../../../stores/noticeStore';
import { spacing, BODY_FONT } from '../../../../theme';

const NAME_MAX = 100;
const DESCRIPTION_MAX = 500;
/** Der Zähler erscheint erst kurz vor der Grenze. */
const COUNTER_FROM = 450;

/**
 * „Name und Beschreibung bearbeiten" als formSheet mit eigener Kopfleiste (`SheetHeader`) (nur Admins, der Server
 * prüft es noch einmal). Wie im Web geht beides über `updateInfo`; bei einem
 * Fehler bleibt der Entwurf stehen, geschlossen wird erst nach Erfolg.
 */
export default function ProjektBearbeitenScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const detailsQuery = useGroupDetails(id);
  const group = detailsQuery.data?.group;
  const { mutate, isPending } = useUpdateGroupInfo(id ?? '');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [landesverband, setLandesverband] = useState<LandesverbandId | null>(null);
  const [seeded, setSeeded] = useState(false);
  const { locale } = useAuth();
  const [color, setColor] = useState<GroupColor | null>(null);
  const dark = useColorScheme() === 'dark';

  useEffect(() => {
    if (group && !seeded) {
      setName(group.name ?? '');
      setDescription(group.description ?? '');
      setLandesverband(group.landesverband ?? null);
      setColor(resolveGroupColor(group.color));
      setSeeded(true);
    }
  }, [group, seeded]);

  const unchanged =
    name.trim() === (group?.name ?? '') &&
    description.trim() === (group?.description ?? '') &&
    landesverband === (group?.landesverband ?? null) &&
    color === resolveGroupColor(group?.color);
  const canSave = seeded && name.trim().length > 0 && !unchanged && !isPending && !!id;

  const save = () => {
    if (!canSave) return;
    mutate(
      { name: name.trim(), description: description.trim(), landesverband, color },
      {
        onSuccess: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
        },
        onError: (error: Error) => useNoticeStore.getState().show('error', error.message),
      }
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SheetHeader
        title="Projekt bearbeiten"
        onCancel={() => router.back()}
        actionLabel="Speichern"
        onAction={save}
        canAct={canSave}
        busy={isPending}
      />
      <KeyboardAvoidingView
        behavior="padding"
        style={[styles.flex, { backgroundColor: theme.background }]}
      >
        {detailsQuery.isPending ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : detailsQuery.isError || !group ? (
          <View style={styles.center}>
            <Text style={[styles.headerText, { color: theme.textSecondary }]}>
              Das Projekt konnte nicht geladen werden.
            </Text>
            <Pressable onPress={() => void detailsQuery.refetch()} accessibilityRole="button">
              <Text style={[styles.headerText, styles.save, { color: theme.text }]}>
                Erneut versuchen
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.form}>
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={NAME_MAX}
              placeholder="Name"
              placeholderTextColor={theme.textSecondary}
              accessibilityLabel="Name"
              editable={!isPending}
              returnKeyType="next"
              style={[styles.name, { color: theme.text, backgroundColor: theme.buttonBackground }]}
            />
            <TextInput
              value={description}
              onChangeText={setDescription}
              maxLength={DESCRIPTION_MAX}
              placeholder="Beschreibung"
              placeholderTextColor={theme.textSecondary}
              accessibilityLabel="Beschreibung"
              editable={!isPending}
              multiline
              textAlignVertical="top"
              style={[
                styles.description,
                { color: theme.text, backgroundColor: theme.buttonBackground },
              ]}
            />
            <Text style={[styles.label, { color: theme.textSecondary }]}>Landesverband</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
            >
              <View style={styles.chips}>
                {[
                  { id: null, title: 'Keiner' },
                  ...landesverbandOptions(group.audience, locale, landesverband),
                ].map((option) => {
                  const selected = option.id === landesverband;
                  return (
                    <Pressable
                      key={option.id ?? 'none'}
                      onPress={() => setLandesverband(option.id)}
                      disabled={isPending}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={[
                        styles.chip,
                        { backgroundColor: selected ? theme.text : theme.buttonBackground },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: selected ? theme.background : theme.text },
                        ]}
                      >
                        {option.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Farbe der Kachel</Text>
            <View accessibilityRole="radiogroup" style={styles.swatches}>
              {[null, ...GROUP_COLOR_KEYS].map((key) => {
                const tone = key ? GROUP_COLOR_STYLES[key][dark ? 'dark' : 'light'] : null;
                const selected = key === color;
                return (
                  <Pressable
                    key={key ?? 'standard'}
                    onPress={() => setColor(key)}
                    disabled={isPending}
                    accessibilityRole="radio"
                    accessibilityLabel={key ? GROUP_COLOR_STYLES[key].label : 'Standard'}
                    accessibilityState={{ checked: selected, disabled: isPending }}
                    style={[
                      styles.swatch,
                      {
                        backgroundColor: tone?.bg ?? theme.buttonBackground,
                        borderColor: selected ? theme.text : theme.cardBorder,
                        borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
                      },
                    ]}
                  >
                    {selected ? (
                      <Ionicons name="checkmark" size={18} color={tone?.title ?? theme.text} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            {description.length >= COUNTER_FROM ? (
              <Text style={[styles.counter, { color: theme.textSecondary }]}>
                {description.length} / {DESCRIPTION_MAX}
              </Text>
            ) : null}
          </View>
        )}
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.small },
  form: { flex: 1, padding: spacing.medium, gap: spacing.small },
  headerText: { fontFamily: BODY_FONT, fontSize: 16 },
  save: { fontWeight: '600' },
  name: {
    fontFamily: BODY_FONT,
    fontSize: 16,
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  description: {
    flex: 1,
    fontFamily: BODY_FONT,
    fontSize: 16,
    borderRadius: 12,
    padding: 12,
  },
  label: { fontFamily: BODY_FONT, fontSize: 13, marginTop: spacing.small },
  chipsScroll: { flexGrow: 0 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontFamily: BODY_FONT, fontSize: 14 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: { fontFamily: BODY_FONT, fontSize: 12, textAlign: 'right' },
});
