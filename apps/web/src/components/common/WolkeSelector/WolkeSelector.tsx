import { type JSX, useState, useEffect, useMemo, ComponentType } from 'react';
import { HiOutlineCloud, HiOutlineFolder } from 'react-icons/hi';

import { useWolkeStore } from '../../../stores/wolkeStore';
import EnhancedSelect from '../EnhancedSelect';

import type { EnhancedSelectOption } from '../EnhancedSelect/EnhancedSelect';
import type { MultiValue, SingleValue, ActionMeta } from 'react-select';

// Wolke Selector Feature CSS - Loaded only when this feature is accessed
import '../../../assets/styles/components/common/wolke-selector.css';
// Import ProfileActionButton CSS for consistent button styling
import '../../../assets/styles/components/profile/profile-action-buttons.css';

/**
 * WolkeSelector - Component for selecting Wolke share links for Q&A collections
 * Uses EnhancedSelect with wolkeStore integration
 */
interface WolkeShareLink {
  id?: string;
  label?: string;
  display_name?: string;
  share_link?: string;
}

interface WolkeSelectorProps {
  label?: string;
  placeholder?: string;
  helpText?: string;
  isMulti?: boolean;
  value: WolkeShareLink[];
  onChange: (selectedLinks: WolkeShareLink[]) => void;
  className?: string;
  error?: string;
  required?: boolean;
  scope?: 'personal' | 'group';
  scopeId?: string;
}

interface WolkeOption extends EnhancedSelectOption {
  shareLink?: WolkeShareLink;
  documentCount?: number;
}

const WolkeSelector = ({
  label = 'Wolke-Ordner auswählen',
  placeholder = 'Wolke-Ordner suchen und auswählen...',
  helpText = 'Wählen Sie Wolke-Ordner aus, deren Dokumente in die Sammlung einbezogen werden sollen',
  isMulti = true,
  value = [],
  onChange,
  className = '',
  error,
  required = false,
  scope = 'personal', // 'personal' or 'group'
  scopeId = '', // group ID if scope is 'group'
  ...selectProps
}: WolkeSelectorProps): JSX.Element => {
  const {
    shareLinks,
    syncStatuses,
    isLoading,
    error: storeError,
    initialized,
    fetchShareLinks,
    fetchSyncStatuses,
    setScope,
  } = useWolkeStore();

  const [isInitializing, setIsInitializing] = useState(true);

  // Initialize the store with the correct scope
  useEffect(() => {
    const initializeStore = async () => {
      setIsInitializing(true);
      try {
        // Set the scope if it's different from current
        setScope(scope, scopeId);

        // Fetch data if not initialized
        if (!initialized || shareLinks.length === 0) {
          await fetchShareLinks();
        }

        // Fetch sync statuses to get document counts
        await fetchSyncStatuses();
      } catch (error) {
        console.error('[WolkeSelector] Error initializing:', error);
      } finally {
        setIsInitializing(false);
      }
    };

    void initializeStore();
  }, [scope, scopeId, initialized, fetchShareLinks, fetchSyncStatuses, setScope]);

  // Transform share links to EnhancedSelect options
  const wolkeOptions = useMemo((): WolkeOption[] => {
    return shareLinks
      .filter((shareLink) => shareLink.id)
      .map((shareLink) => {
        const syncStatus = syncStatuses.find((status) => status.share_link_id === shareLink.id);

        const documentCount = syncStatus?.files_processed || 0;
        const lastSync = syncStatus?.last_sync_at;
        const isAutoSync = syncStatus?.auto_sync_enabled || false;

        const subtitleParts: string[] = [];
        if (documentCount > 0) {
          subtitleParts.push(`${documentCount} Dokument(e)`);
        }
        if (lastSync) {
          subtitleParts.push(`Letzte Sync: ${new Date(lastSync).toLocaleDateString('de-DE')}`);
        }
        if (isAutoSync) {
          subtitleParts.push('Auto-Sync aktiv');
        }

        const option: WolkeOption = {
          value: shareLink.id,
          label: shareLink.label || shareLink.display_name || 'Unbenannter Ordner',
          iconType: 'folder',
          icon: HiOutlineFolder,
          subtitle: subtitleParts.join(' • ') || 'Noch nicht synchronisiert',
          tag: {
            label: scope === 'group' ? 'Gruppe' : 'Persönlich',
            variant: scope === 'group' ? 'group' : 'user',
            icon: HiOutlineCloud,
          },
          searchableContent:
            `${shareLink.label || shareLink.display_name || ''} ${shareLink.share_link}`.toLowerCase(),
          shareLink: shareLink,
          documentCount,
        };
        return option;
      });
  }, [shareLinks, syncStatuses, scope]);

  const handleChange = (
    newValue: MultiValue<EnhancedSelectOption> | SingleValue<EnhancedSelectOption>,
    _actionMeta: ActionMeta<EnhancedSelectOption>
  ): void => {
    const options = newValue
      ? ((Array.isArray(newValue) ? newValue : [newValue]) as WolkeOption[])
      : [];
    const wolkeShareLinks: WolkeShareLink[] = options
      .map((option) => option.shareLink)
      .filter((link): link is WolkeShareLink => link !== undefined);

    if (onChange) {
      onChange(wolkeShareLinks);
    }
  };

  const selectValue = useMemo((): WolkeOption[] => {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((shareLink) => shareLink.id)
      .map((shareLink) => {
        const option = wolkeOptions.find((opt) => opt.value === shareLink.id);
        return (
          option || {
            value: shareLink.id as string,
            label: shareLink.label || shareLink.display_name || 'Unbekannter Ordner',
            shareLink: shareLink,
          }
        );
      });
  }, [value, wolkeOptions]);

  const isLoadingData = isLoading || isInitializing;
  const currentError = error || storeError;

  // Show loading state
  if (isLoadingData && wolkeOptions.length === 0) {
    return (
      <div className={`wolke-selector loading ${className}`.trim()}>
        <label className="form-label">
          {label}
          {required && <span className="required-indicator"> *</span>}
        </label>
        <div className="wolke-selector-loading">
          <div className="loading-spinner" />
          <span>Wolke-Ordner werden geladen...</span>
        </div>
        {helpText && <div className="help-text">{helpText}</div>}
      </div>
    );
  }

  // Show empty state
  if (!isLoadingData && wolkeOptions.length === 0) {
    return (
      <div className={`wolke-selector empty ${className}`.trim()}>
        <label className="form-label">
          {label}
          {required && <span className="required-indicator"> *</span>}
        </label>
        <div className="wolke-selector-empty">
          <HiOutlineCloud size={48} />
          <p>Keine Wolke-Ordner verfügbar</p>
          <p>Fügen Sie erst Wolke-Links hinzu, um sie hier auswählen zu können.</p>
        </div>
        {helpText && <div className="help-text">{helpText}</div>}
        {currentError && <div className="error-message">{currentError}</div>}
      </div>
    );
  }

  const displayValue = isMulti ? selectValue : selectValue[0] || null;

  return (
    <div className={`wolke-selector ${className}`.trim()}>
      <EnhancedSelect
        label={label}
        helpText={helpText}
        required={required}
        error={currentError || undefined}
        enableIcons={true}
        enableSubtitles={true}
        enableTags={true}
        isMulti={isMulti}
        isSearchable={true}
        placeholder={placeholder}
        options={wolkeOptions as EnhancedSelectOption[]}
        value={displayValue as EnhancedSelectOption | EnhancedSelectOption[] | null}
        onChange={handleChange}
        isLoading={isLoadingData}
        noOptionsMessage={() => 'Keine passenden Wolke-Ordner gefunden'}
        closeMenuOnSelect={!isMulti}
        hideSelectedOptions={false}
        menuPortalTarget={document.body}
        menuPosition="fixed"
        maxMenuHeight={300}
        className="wolke-select"
        classNamePrefix="wolke-select"
        {...selectProps}
      />
    </div>
  );
};

export default WolkeSelector;
export type { WolkeShareLink, WolkeSelectorProps };
