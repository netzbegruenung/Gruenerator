import { useEditorPreferencesStore, useIsTouchDevice } from '@gruenerator/docs';
import { FeatureToggle } from '@gruenerator/ui';
import { FiEdit3 } from 'react-icons/fi';

export function EditorSettingsSection() {
  const isTouchDevice = useIsTouchDevice();
  const toolbarMode = useEditorPreferencesStore((s) => s.toolbarMode);
  const setToolbarMode = useEditorPreferencesStore((s) => s.setToolbarMode);

  if (isTouchDevice) return null;

  const isFixed = toolbarMode === 'fixed';

  return (
    <section className="settings-section">
      <div className="settings-section-header">
        <div className="settings-section-icon">
          <FiEdit3 size={20} />
        </div>
        <div>
          <h2 className="settings-section-title">Editor</h2>
          <p className="settings-section-description">Passe das Verhalten des Editors an.</p>
        </div>
      </div>

      <div className="settings-card">
        <FeatureToggle
          isActive={isFixed}
          onToggle={(checked) => setToolbarMode(checked ? 'fixed' : 'floating')}
          label="Fixierte Formatierungsleiste"
          icon={FiEdit3}
          description={
            isFixed
              ? 'Die Leiste ist immer sichtbar — wie in Word oder Google Docs.'
              : 'Die Leiste erscheint nur bei Textauswahl.'
          }
          noBorder
        />
      </div>
    </section>
  );
}
