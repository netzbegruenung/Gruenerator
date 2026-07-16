import { type KiLabelMode } from '@gruenerator/contracts';
import { STYLE_VARIANTS } from '@gruenerator/shared/image-studio';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { type ReactNode, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  type BildEditorMobile,
  IMAGE_MODES,
} from '../../../hooks/image-studio/useBildEditorMobile';
import { BottomSheet } from '../../common';
import { ChipGroup } from '../../common/ChipGroup';

import { type BevPalette } from './palette';
import { type BevAspect, type BevMode } from './types';

const MODE_META: Record<
  BevMode,
  { label: string; icon: IoniconsIconName; placeholder: string; hint: string }
> = {
  erstellen: {
    label: 'Erstellen',
    icon: 'sparkles',
    placeholder: 'Beschreibe dein Bild …',
    hint: 'Neues Bild aus Text',
  },
  bearbeiten: {
    label: 'Bearbeiten',
    icon: 'color-wand',
    placeholder: 'Was soll geändert werden?',
    hint: 'Aktives Bild per Anweisung ändern',
  },
  'gruen-verwandeln': {
    label: 'Grün verwandeln',
    icon: 'leaf',
    placeholder: 'Optional: was soll grüner werden?',
    hint: 'In einen grünen, lebenswerten Raum verwandeln',
  },
  vergroessern: {
    label: 'Vergrößern',
    icon: 'expand',
    placeholder: 'Optional: Bildinhalt beschreiben …',
    hint: 'Bild in ein Format erweitern',
  },
  hintergrund: {
    label: 'Hintergrund entfernen',
    icon: 'cut',
    placeholder: 'Kein Text nötig – Motiv freistellen',
    hint: 'Motiv freistellen, Hintergrund transparent',
  },
};

const KI_LABEL_OPTIONS: Array<{ id: KiLabelMode; label: string }> = [
  { id: 'full', label: '„KI-Generiert mit dem Grünerator"' },
  { id: 'short', label: 'Nur „KI-Generiert"' },
  { id: 'none', label: 'Keine Kennzeichnung' },
];

const ASPECT_OPTIONS: Array<{ id: BevAspect; label: string }> = [
  { id: '1:1', label: '1:1' },
  { id: '4:3', label: '4:3' },
  { id: '3:4', label: '3:4' },
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
];

function SettingsSheet({
  bev,
  palette,
  visible,
  onClose,
}: {
  bev: BildEditorMobile;
  palette: BevPalette;
  visible: boolean;
  onClose: () => void;
}) {
  const { mode, settings, setSettings } = bev;
  return (
    <BottomSheet visible={visible} onClose={onClose} padded maxHeight="70%">
      <ScrollView>
        {mode === 'erstellen' && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: palette.muted }]}>Stil</Text>
            <ChipGroup
              options={STYLE_VARIANTS.map((v) => ({ id: v.id, label: v.label }))}
              selected={settings.variant}
              onSelect={(id) =>
                setSettings((s) => ({ ...s, variant: id as typeof settings.variant }))
              }
            />
          </View>
        )}

        {mode === 'vergroessern' && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: palette.muted }]}>Ziel-Format</Text>
            <ChipGroup
              options={ASPECT_OPTIONS}
              selected={settings.aspect}
              onSelect={(id) => setSettings((s) => ({ ...s, aspect: id as BevAspect }))}
            />
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: palette.muted }]}>KI-Kennzeichnung</Text>
          {KI_LABEL_OPTIONS.map((o) => {
            const active = settings.kiLabel === o.id;
            return (
              <Pressable
                key={o.id}
                onPress={() => setSettings((s) => ({ ...s, kiLabel: o.id }))}
                style={styles.radioRow}
              >
                <View
                  style={[
                    styles.radioOuter,
                    { borderColor: active ? palette.primary : palette.muted },
                  ]}
                >
                  {active && (
                    <View style={[styles.radioInner, { backgroundColor: palette.primary }]} />
                  )}
                </View>
                <Text style={[styles.radioLabel, { color: palette.ink }]}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

function ModeSheet({
  bev,
  palette,
  visible,
  onClose,
}: {
  bev: BildEditorMobile;
  palette: BevPalette;
  visible: boolean;
  onClose: () => void;
}) {
  const { setMode } = bev;
  return (
    <BottomSheet visible={visible} onClose={onClose} padded maxHeight="60%">
      {IMAGE_MODES.map((m) => (
        <Pressable
          key={m}
          onPress={() => {
            setMode(m);
            onClose();
          }}
          style={styles.modeRow}
        >
          <Ionicons name={MODE_META[m].icon} size={20} color={palette.primary} />
          <View style={styles.modeText}>
            <Text style={[styles.modeLabel, { color: palette.ink }]}>{MODE_META[m].label}</Text>
            <Text style={[styles.modeHint, { color: palette.muted }]}>{MODE_META[m].hint}</Text>
          </View>
        </Pressable>
      ))}
    </BottomSheet>
  );
}

function ReferenceRow({ bev, palette }: { bev: BildEditorMobile; palette: BevPalette }) {
  const { references, addReferenceFromGallery, removeReference, generating } = bev;
  return (
    <View style={styles.referenceRow}>
      {references.map((r, i) => (
        <View key={r.uri} style={[styles.refChip, { borderColor: palette.accentBorder }]}>
          <Text style={[styles.refChipText, { color: palette.ink }]} numberOfLines={1}>
            Referenz {i + 1}
          </Text>
          <Pressable onPress={() => removeReference(i)} hitSlop={6}>
            <Ionicons name="close" size={14} color={palette.muted} />
          </Pressable>
        </View>
      ))}
      <Pressable
        disabled={generating}
        onPress={() => void addReferenceFromGallery()}
        style={[
          styles.refAdd,
          { borderColor: palette.accentBorder, opacity: generating ? 0.5 : 1 },
        ]}
      >
        <Ionicons name="image" size={14} color={palette.chipInk} />
        <Text style={[styles.refAddText, { color: palette.chipInk }]}>Referenzbild</Text>
      </Pressable>
    </View>
  );
}

function TriggerButton({
  label,
  onPress,
  disabled,
  palette,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  palette: BevPalette;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.trigger, { backgroundColor: palette.primary, opacity: disabled ? 0.5 : 1 }]}
    >
      <Text style={styles.triggerText}>{label}</Text>
    </Pressable>
  );
}

export function BevComposer({ bev, palette }: { bev: BildEditorMobile; palette: BevPalette }) {
  const { mode, prompt, setPrompt, submit, generating, error, active, settings } = bev;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);

  const meta = MODE_META[mode];
  const showArrow = mode === 'erstellen' || mode === 'bearbeiten';
  const arrowDisabled = generating || prompt.trim().length < 3;

  let belowRow: ReactNode = null;
  if (mode === 'bearbeiten') {
    belowRow = <ReferenceRow bev={bev} palette={palette} />;
  } else if (mode === 'gruen-verwandeln') {
    belowRow = (
      <TriggerButton
        label="Grün verwandeln"
        onPress={() => void submit()}
        disabled={generating || !active}
        palette={palette}
      />
    );
  } else if (mode === 'vergroessern') {
    belowRow = (
      <TriggerButton
        label={`Auf ${settings.aspect} vergrößern`}
        onPress={() => void submit()}
        disabled={generating || !active}
        palette={palette}
      />
    );
  } else if (mode === 'hintergrund') {
    belowRow = (
      <TriggerButton
        label="Hintergrund entfernen"
        onPress={() => void submit()}
        disabled={generating || !active}
        palette={palette}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.pill,
          { backgroundColor: palette.cardBg, borderColor: palette.accentBorder },
        ]}
      >
        {mode !== 'hintergrund' && (
          <Pressable onPress={() => setSettingsOpen(true)} style={styles.iconBtn} hitSlop={6}>
            <Ionicons name="options" size={18} color={palette.muted} />
          </Pressable>
        )}
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          editable={!generating}
          placeholder={meta.placeholder}
          placeholderTextColor={palette.muted}
          style={[styles.input, { color: palette.ink }]}
          multiline
          onSubmitEditing={() => showArrow && void submit()}
        />
        {active ? (
          <Pressable
            onPress={() => setModeOpen(true)}
            disabled={generating}
            style={[styles.modeChip, { borderColor: palette.accentBorder }]}
          >
            <Ionicons name={meta.icon} size={14} color={palette.primary} />
            <Text style={[styles.modeChipText, { color: palette.ink }]}>{meta.label}</Text>
            <Ionicons name="chevron-down" size={13} color={palette.muted} />
          </Pressable>
        ) : (
          <View style={[styles.modeChip, { borderColor: palette.accentBorder }]}>
            <Ionicons name="sparkles" size={14} color={palette.primary} />
            <Text style={[styles.modeChipText, { color: palette.ink }]}>Erstellen</Text>
          </View>
        )}
        {showArrow && (
          <Pressable
            onPress={() => void submit()}
            disabled={arrowDisabled}
            style={[
              styles.arrow,
              { backgroundColor: palette.primary, opacity: arrowDisabled ? 0.4 : 1 },
            ]}
          >
            <Ionicons name="arrow-up" size={18} color="#fff" />
          </Pressable>
        )}
      </View>

      {belowRow}
      {error && <Text style={styles.error}>{error}</Text>}

      <SettingsSheet
        bev={bev}
        palette={palette}
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <ModeSheet
        bev={bev}
        palette={palette}
        visible={modeOpen}
        onClose={() => setModeOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    gap: 10,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    width: '100%',
    borderWidth: 1,
    borderRadius: 26,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontSize: 15,
    maxHeight: 120,
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  modeChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  arrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referenceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  refChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 140,
  },
  refChipText: {
    fontSize: 12,
  },
  refAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  refAddText: {
    fontSize: 12,
    fontWeight: '600',
  },
  trigger: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  triggerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  error: {
    color: '#D32F2F',
    fontSize: 13,
    textAlign: 'center',
  },
  section: {
    gap: 10,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  radioLabel: {
    fontSize: 14,
    flex: 1,
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  modeText: {
    flex: 1,
  },
  modeLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  modeHint: {
    fontSize: 12,
    marginTop: 2,
  },
});
