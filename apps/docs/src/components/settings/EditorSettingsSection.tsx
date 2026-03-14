import { useEditorPreferencesStore, type ToolbarMode, useIsTouchDevice } from '@gruenerator/docs';
import { SegmentedControl, Text } from '@mantine/core';
import { FiEdit3 } from 'react-icons/fi';

export function EditorSettingsSection() {
  const isTouchDevice = useIsTouchDevice();
  const toolbarMode = useEditorPreferencesStore((s) => s.toolbarMode);
  const setToolbarMode = useEditorPreferencesStore((s) => s.setToolbarMode);

  if (isTouchDevice) return null;

  return (
    <section className="settings-section">
      <div className="settings-section-header">
        <div className="settings-section-icon">
          <FiEdit3 size={20} />
        </div>
        <div>
          <h2 className="settings-section-title">Editor</h2>
          <p className="settings-section-description">
            Wähle, wie die Formatierungsleiste angezeigt wird.
          </p>
        </div>
      </div>

      <div className="settings-card">
        <SegmentedControl
          value={toolbarMode}
          onChange={(value) => setToolbarMode(value as ToolbarMode)}
          fullWidth
          color="var(--primary-600)"
          data={[
            { label: 'Schwebend', value: 'floating' },
            { label: 'Fixiert', value: 'fixed' },
          ]}
        />
        <Text size="xs" c="dimmed" mt="xs">
          {toolbarMode === 'floating'
            ? 'Die Formatierungsleiste erscheint bei Textauswahl.'
            : 'Die Formatierungsleiste ist immer sichtbar — wie in Word oder Google Docs.'}
        </Text>
      </div>
    </section>
  );
}
