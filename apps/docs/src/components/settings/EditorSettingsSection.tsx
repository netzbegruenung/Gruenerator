import { useEditorPreferencesStore, type ToolbarMode, useIsTouchDevice } from '@gruenerator/docs';
import { FiEdit3 } from 'react-icons/fi';

const TOOLBAR_OPTIONS: { label: string; value: ToolbarMode }[] = [
  { label: 'Schwebend', value: 'floating' },
  { label: 'Fixiert', value: 'fixed' },
];

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
        <div className="inline-flex w-full rounded-lg bg-grey-100 p-1 dark:bg-grey-800">
          {TOOLBAR_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setToolbarMode(option.value)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                toolbarMode === option.value
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-grey-600 hover:text-grey-800 dark:text-grey-400 dark:hover:text-grey-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-grey-500">
          {toolbarMode === 'floating'
            ? 'Die Formatierungsleiste erscheint bei Textauswahl.'
            : 'Die Formatierungsleiste ist immer sichtbar — wie in Word oder Google Docs.'}
        </p>
      </div>
    </section>
  );
}
