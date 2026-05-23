import { useAuth } from '@gruenerator/shared/hooks';
import {
  AT_EBENEN,
  DE_EBENEN,
  AT_ROLLEN,
  DE_ROLLEN,
  AT_BUNDESLAENDER,
  DE_BUNDESLAENDER,
  NEEDS_BUNDESLAND,
  NEEDS_LOCAL_NAME,
  LOCAL_NAME_LABELS,
  LOCAL_NAME_PLACEHOLDERS,
  needsAbgeordneteName,
  searchMdBs,
  type UserRole,
} from '@gruenerator/shared/roles';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from 'react-native';

import { fetchRoles, persistRoles, generateRoleSystemPrompt } from '../../services/roles';
import { colors, spacing, borderRadius, typography, lightTheme, darkTheme } from '../../theme';

import type { Theme } from '../../theme/colors';

type WizardStep = 'ebene' | 'bundesland' | 'gliederung' | 'rolle' | 'instructions';

function SelectCard({
  icon,
  label,
  description,
  selected,
  onPress,
  theme,
}: {
  icon?: string;
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  theme: Theme;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectCard,
        {
          borderColor: selected ? colors.primary[600] : theme.border,
          backgroundColor: selected
            ? colors.primary[50]
            : pressed
              ? theme.surface
              : theme.background,
        },
      ]}
    >
      {icon ? <Text style={styles.selectCardIcon}>{icon}</Text> : null}
      <View style={styles.selectCardText}>
        <Text
          style={[styles.selectCardLabel, { color: selected ? colors.primary[700] : theme.text }]}
        >
          {label}
        </Text>
        {description ? (
          <Text style={[styles.selectCardDescription, { color: theme.textSecondary }]}>
            {description}
          </Text>
        ) : null}
      </View>
      {selected ? <Ionicons name="checkmark-circle" size={20} color={colors.primary[600]} /> : null}
    </Pressable>
  );
}

export default function RoleAddScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const { user } = useAuth();
  const isAustrian = user?.locale === 'de-AT';

  const ebenen = isAustrian ? AT_EBENEN : DE_EBENEN;
  const rollenMap = isAustrian ? AT_ROLLEN : DE_ROLLEN;
  const bundeslaender = isAustrian ? AT_BUNDESLAENDER : DE_BUNDESLAENDER;

  // Existing roles, so the new one is appended rather than replacing.
  const existingRoles = useRef<UserRole[]>([]);
  useEffect(() => {
    void (async () => {
      existingRoles.current = await fetchRoles();
    })();
  }, []);

  const [step, setStep] = useState<WizardStep>('ebene');
  const [ebene, setEbene] = useState<string | null>(null);
  const [bundesland, setBundesland] = useState<string | null>(null);
  const [bundeslandQuery, setBundeslandQuery] = useState('');
  const [gliederung, setGliederung] = useState('');
  const [rolle, setRolle] = useState<string | null>(null);
  const [customRolle, setCustomRolle] = useState('');
  const [abgeordnete, setAbgeordnete] = useState('');
  const [instructions, setInstructions] = useState('');
  const [generating, setGenerating] = useState(false);

  const handleEbene = useCallback((id: string) => {
    setEbene(id);
    setBundesland(null);
    setBundeslandQuery('');
    setGliederung('');
    setRolle(null);
    setCustomRolle('');
    setAbgeordnete('');
    setStep(NEEDS_BUNDESLAND.has(id) ? 'bundesland' : 'rolle');
  }, []);

  const handleBundesland = useCallback(
    (label: string) => {
      setBundesland(label);
      setBundeslandQuery(label);
      setStep(ebene && NEEDS_LOCAL_NAME.has(ebene) ? 'gliederung' : 'rolle');
    },
    [ebene]
  );

  const handleGliederungSubmit = useCallback(() => {
    if (gliederung.trim()) setStep('rolle');
  }, [gliederung]);

  const handleStepBack = useCallback(() => {
    if (step === 'instructions') setStep('rolle');
    else if (step === 'rolle') {
      if (ebene && NEEDS_LOCAL_NAME.has(ebene)) setStep('gliederung');
      else if (ebene && NEEDS_BUNDESLAND.has(ebene)) setStep('bundesland');
      else setStep('ebene');
    } else if (step === 'gliederung') setStep('bundesland');
    else if (step === 'bundesland') setStep('ebene');
  }, [step, ebene]);

  const selectRolle = useCallback((value: string) => {
    setRolle(value);
    setAbgeordnete('');
  }, []);

  const canAddRole = useMemo(() => {
    if (!rolle) return false;
    if (rolle === 'custom' && !customRolle.trim()) return false;
    const effective = rolle === 'custom' ? customRolle.trim() : rolle;
    if (needsAbgeordneteName(effective) && !abgeordnete.trim()) return false;
    return true;
  }, [rolle, customRolle, abgeordnete]);

  const bundeslandMatches = useMemo(() => {
    const q = bundeslandQuery.trim().toLowerCase();
    if (!q || bundesland === bundeslandQuery) return [];
    return bundeslaender.filter((bl) => bl.label.toLowerCase().includes(q));
  }, [bundeslandQuery, bundesland, bundeslaender]);

  const mdbMatches = useMemo(
    () => (isAustrian ? [] : searchMdBs(abgeordnete)),
    [isAustrian, abgeordnete]
  );

  const handleAddRole = useCallback(async () => {
    if (!canAddRole || !ebene) return;

    const ebeneLabel = ebenen.find((e) => e.id === ebene)?.label || '';
    const effectiveRolle = rolle === 'custom' ? customRolle.trim() : rolle!;

    const newRole: UserRole = { ebene, rolle: effectiveRolle };
    if (bundesland) newRole.bundesland = bundesland;
    if (gliederung.trim()) newRole.gliederung = gliederung.trim();
    if (abgeordnete.trim()) newRole.abgeordnete = abgeordnete.trim();
    if (instructions.trim()) newRole.instructions = instructions.trim();

    const lines = [`Ebene: ${ebeneLabel}`, `Rolle: ${effectiveRolle}`];
    if (bundesland) lines.push(`Bundesland: ${bundesland}`);
    if (gliederung.trim()) lines.push(`${ebeneLabel}: ${gliederung.trim()}`);
    if (abgeordnete.trim()) lines.push(`Abgeordnete*r: ${abgeordnete.trim()}`);
    if (isAustrian) lines.push('Land: Österreich (Die Grünen – Die Grüne Alternative)');
    if (instructions.trim()) lines.push(`Zusätzliche Anweisungen: ${instructions.trim()}`);

    setGenerating(true);
    const systemPrompt = await generateRoleSystemPrompt(lines.join('\n'));
    if (systemPrompt) newRole.systemPrompt = systemPrompt;

    const next = [...existingRoles.current, newRole];
    try {
      await persistRoles(next, isAustrian);
    } catch {
      // Best-effort: still close. RolesSection re-reads from server on focus.
    }
    setGenerating(false);
    router.back();
  }, [
    canAddRole,
    ebene,
    ebenen,
    rolle,
    customRolle,
    bundesland,
    gliederung,
    abgeordnete,
    instructions,
    isAustrian,
    router,
  ]);

  const showBackButton = step !== 'ebene' && !generating;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          title: 'Rolle hinzufügen',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Text style={{ color: colors.primary[600], ...typography.body }}>Abbrechen</Text>
            </Pressable>
          ),
        }}
      />

      {generating ? (
        <View style={styles.generating}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={[styles.generatingText, { color: theme.textSecondary }]}>
            System-Prompt wird generiert…
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {showBackButton && (
            <Pressable onPress={handleStepBack} hitSlop={8} style={styles.backRow}>
              <Ionicons name="arrow-back" size={18} color={theme.textSecondary} />
              <Text style={[styles.backText, { color: theme.textSecondary }]}>Zurück</Text>
            </Pressable>
          )}

          {step === 'ebene' && (
            <>
              <Text style={[styles.stepTitle, { color: theme.text }]}>
                Auf welcher Ebene bist du aktiv?
              </Text>
              {ebenen.map((e) => (
                <SelectCard
                  key={e.id}
                  icon={e.icon}
                  label={e.label}
                  selected={ebene === e.id}
                  onPress={() => handleEbene(e.id)}
                  theme={theme}
                />
              ))}
            </>
          )}

          {step === 'bundesland' && (
            <>
              <Text style={[styles.stepTitle, { color: theme.text }]}>In welchem Bundesland?</Text>
              <TextInput
                value={bundeslandQuery}
                onChangeText={(v) => {
                  setBundeslandQuery(v);
                  setBundesland(null);
                }}
                placeholder="Bundesland eingeben…"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.input,
                  { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border },
                ]}
                autoFocus
              />
              {bundeslandMatches.map((bl) => (
                <Pressable
                  key={bl.label}
                  onPress={() => handleBundesland(bl.label)}
                  style={({ pressed }) => [
                    styles.suggestionRow,
                    {
                      borderColor: theme.border,
                      backgroundColor: pressed ? theme.surface : theme.background,
                    },
                  ]}
                >
                  <Text style={[styles.suggestionText, { color: theme.text }]}>{bl.label}</Text>
                  {bl.notebookId ? (
                    <Text style={[styles.suggestionMeta, { color: colors.primary[600] }]}>
                      ● Notebook
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </>
          )}

          {step === 'gliederung' && (
            <>
              <Text style={[styles.stepTitle, { color: theme.text }]}>
                {LOCAL_NAME_LABELS[ebene || ''] || 'Name deiner Gliederung'}
              </Text>
              {bundesland ? (
                <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
                  {bundesland}
                </Text>
              ) : null}
              <TextInput
                value={gliederung}
                onChangeText={setGliederung}
                placeholder={LOCAL_NAME_PLACEHOLDERS[ebene || ''] || ''}
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.input,
                  { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border },
                ]}
                onSubmitEditing={handleGliederungSubmit}
                returnKeyType="next"
                autoFocus
              />
              <Pressable
                onPress={handleGliederungSubmit}
                disabled={!gliederung.trim()}
                style={[styles.primaryButton, { opacity: gliederung.trim() ? 1 : 0.5 }]}
              >
                <Text style={styles.primaryButtonText}>Weiter</Text>
              </Pressable>
            </>
          )}

          {step === 'rolle' && (
            <>
              <Text style={[styles.stepTitle, { color: theme.text }]}>Was ist deine Rolle?</Text>
              {ebene ? (
                <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
                  {ebenen.find((e) => e.id === ebene)?.label}
                  {bundesland ? ` · ${bundesland}` : ''}
                  {gliederung ? ` · ${gliederung}` : ''}
                </Text>
              ) : null}

              {ebene &&
                (rollenMap[ebene] || []).map((r) => (
                  <SelectCard
                    key={r}
                    label={r}
                    selected={rolle === r}
                    onPress={() => selectRolle(r)}
                    theme={theme}
                  />
                ))}
              <SelectCard
                label="Sonstige"
                description="Eigene Rolle eingeben"
                selected={rolle === 'custom'}
                onPress={() => setRolle('custom')}
                theme={theme}
              />

              {rolle === 'custom' && (
                <TextInput
                  value={customRolle}
                  onChangeText={setCustomRolle}
                  placeholder="z.B. Fraktionsgeschäftsführer*in"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.input,
                    {
                      color: theme.text,
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                />
              )}

              {rolle && rolle !== 'custom' && needsAbgeordneteName(rolle) && (
                <View>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                    Für welche*n Abgeordnete*n arbeitest du?
                  </Text>
                  <TextInput
                    value={abgeordnete}
                    onChangeText={setAbgeordnete}
                    placeholder={isAustrian ? 'z.B. Sigrid Maurer' : 'z.B. Lisa Badum'}
                    placeholderTextColor={theme.textSecondary}
                    autoComplete="off"
                    style={[
                      styles.input,
                      {
                        color: theme.text,
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                      },
                    ]}
                  />
                  {mdbMatches.map((mdb) => (
                    <Pressable
                      key={mdb.name}
                      onPress={() => setAbgeordnete(mdb.name)}
                      style={({ pressed }) => [
                        styles.suggestionRow,
                        {
                          borderColor: theme.border,
                          backgroundColor: pressed ? theme.surface : theme.background,
                        },
                      ]}
                    >
                      <Text style={[styles.suggestionText, { color: theme.text }]}>{mdb.name}</Text>
                      <Text style={[styles.suggestionMeta, { color: theme.textSecondary }]}>
                        {mdb.bundesland}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {canAddRole && (
                <Pressable onPress={() => setStep('instructions')} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>Weiter</Text>
                </Pressable>
              )}
            </>
          )}

          {step === 'instructions' && (
            <>
              <Text style={[styles.stepTitle, { color: theme.text }]}>Zusätzliche Anweisungen</Text>
              <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
                Optionale Hinweise für diese Rolle
              </Text>
              <TextInput
                value={instructions}
                onChangeText={setInstructions}
                placeholder="z.B. Schreibe Pressemitteilungen immer mit Zitat des Fraktionsvorsitzenden."
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                style={[
                  styles.input,
                  styles.textArea,
                  { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border },
                ]}
                autoFocus
              />
              <Pressable onPress={() => void handleAddRole()} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Rolle speichern</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setInstructions('');
                  void handleAddRole();
                }}
                style={styles.ghostButton}
              >
                <Text style={[styles.ghostButtonText, { color: colors.primary[600] }]}>
                  Überspringen
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.medium,
    gap: spacing.small,
  },
  generating: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.medium,
  },
  generatingText: {
    fontSize: 14,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    alignSelf: 'flex-start',
    paddingVertical: spacing.xsmall,
  },
  backText: {
    fontSize: 14,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: spacing.xsmall,
  },
  stepSubtitle: {
    fontSize: 13,
    marginTop: -spacing.xxsmall,
  },
  fieldLabel: {
    fontSize: 12,
    marginBottom: spacing.xsmall,
    marginTop: spacing.xsmall,
  },
  selectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.medium,
  },
  selectCardIcon: {
    fontSize: 20,
  },
  selectCardText: {
    flex: 1,
    gap: 1,
  },
  selectCardLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  selectCardDescription: {
    fontSize: 12,
  },
  input: {
    fontSize: 15,
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  textArea: {
    minHeight: 110,
    paddingTop: spacing.small,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.small,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  suggestionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  suggestionMeta: {
    fontSize: 11,
  },
  primaryButton: {
    backgroundColor: colors.secondary[600],
    borderRadius: borderRadius.buttonPill,
    paddingVertical: spacing.medium,
    alignItems: 'center',
    marginTop: spacing.xsmall,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  ghostButton: {
    paddingVertical: spacing.small,
    alignItems: 'center',
  },
  ghostButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
