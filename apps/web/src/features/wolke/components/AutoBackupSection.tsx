import { useWolkePreferencesStore, type BackupInterval } from '@gruenerator/wolke';
import { FiClock, FiFolder, FiPlus } from 'react-icons/fi';

import WolkeFolderBrowser from './WolkeFolderBrowser';

import { cn } from '@/utils/cn';

const INTERVALS: { value: BackupInterval; label: string }[] = [
  { value: 'hourly', label: 'Stündlich' },
  { value: 'daily', label: 'Täglich' },
];

const AutoBackupSection = () => {
  const autoBackup = useWolkePreferencesStore((s) => s.autoBackup);
  const setAutoBackupEnabled = useWolkePreferencesStore((s) => s.setAutoBackupEnabled);
  const setAutoBackupInterval = useWolkePreferencesStore((s) => s.setAutoBackupInterval);
  const setAutoBackupTarget = useWolkePreferencesStore((s) => s.setAutoBackupTarget);

  const handleFolderSelect = (folderPath: string, folderName: string) => {
    setAutoBackupTarget('', folderPath, folderName);
  };

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-col gap-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-sm">
            <FiClock className="w-4 h-4 text-grey-500 dark:text-grey-300" />
            <h3 className="text-sm font-medium text-grey-600 dark:text-grey-300 uppercase tracking-wide">
              Automatische Sicherung
            </h3>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={autoBackup.enabled}
              onChange={(e) => setAutoBackupEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-grey-200 dark:bg-grey-700 rounded-full peer peer-checked:bg-primary-500 peer-checked:dark:bg-primary-400 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
          </label>
        </div>
        <p className="text-xs text-grey-500 dark:text-grey-300 leading-relaxed">
          Sichere deine Dokumente automatisch in der Wolke. Änderungen werden im gewählten Intervall
          als DOCX-Datei in den gewählten Ordner exportiert — so hast du immer ein aktuelles Backup
          in deiner Wolke.
        </p>
      </div>

      {autoBackup.enabled && (
        <div className="flex flex-col gap-md pl-sm border-l-2 border-grey-200 dark:border-grey-700">
          <div className="flex flex-col gap-xxs">
            <span className="text-xs text-grey-500 dark:text-grey-300">Intervall</span>
            <div className="flex rounded-md border border-grey-200 dark:border-grey-700 overflow-hidden w-fit">
              {INTERVALS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAutoBackupInterval(opt.value)}
                  className={cn(
                    'px-sm py-xs text-xs transition-colors',
                    autoBackup.interval === opt.value
                      ? 'bg-grey-100 dark:bg-grey-800 text-foreground font-medium'
                      : 'text-grey-500 dark:text-grey-300 hover:text-foreground'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs text-grey-500 dark:text-grey-300">Ziel-Ordner</span>
              {autoBackup.folderName && (
                <span className="text-xs text-primary-600 dark:text-primary-400 flex items-center gap-xxs">
                  <FiFolder className="w-3 h-3" />
                  {autoBackup.folderPath || autoBackup.folderName}
                </span>
              )}
            </div>
            <div className="rounded-lg border border-grey-200 dark:border-grey-700 p-sm">
              <div className="flex items-center gap-xs px-sm py-xs mb-xs">
                <FiFolder className="w-3.5 h-3.5 text-grey-500" />
                <span className="text-xs text-foreground">Hauptordner</span>
                <button
                  type="button"
                  onClick={() => handleFolderSelect('', 'Hauptordner')}
                  className={cn(
                    'ml-auto shrink-0 px-xs py-0.5 rounded text-[0.65rem] font-medium transition-all',
                    autoBackup.folderPath === ''
                      ? 'bg-primary-500 text-white'
                      : 'text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/30'
                  )}
                >
                  {autoBackup.folderPath === '' ? 'Ausgewählt' : 'Auswählen'}
                </button>
              </div>
              <WolkeFolderBrowser onFolderSelect={handleFolderSelect} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutoBackupSection;
