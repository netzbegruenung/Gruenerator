import { type JSX, useMemo } from 'react';
import { HiOutlineCloud, HiOutlineFolder } from 'react-icons/hi';

import { useShareLinks, useSyncStatuses } from '../../../features/wolke/hooks/useWolke';
import EnhancedSelect from '../EnhancedSelect';
import Spinner from '../Spinner';

import type { WolkeScope } from '../../../features/wolke/lib/wolkeApi';
import type { EnhancedSelectOption } from '../EnhancedSelect/EnhancedSelect';
import type { MultiValue, SingleValue, ActionMeta } from 'react-select';

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
  scope?: WolkeScope;
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
  scope = 'personal',
  scopeId = '',
  ...selectProps
}: WolkeSelectorProps): JSX.Element => {
  const {
    data: shareLinks = [],
    isLoading: shareLinksLoading,
    error: queryError,
  } = useShareLinks(scope, scopeId || undefined);

  const { data: syncStatuses = [] } = useSyncStatuses(scope, scopeId || undefined);

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

  const isLoadingData = shareLinksLoading;
  const currentError = error || (queryError ? String(queryError) : undefined);

  if (isLoadingData && wolkeOptions.length === 0) {
    return (
      <div className={`flex flex-col gap-xs ${className}`.trim()}>
        <label className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
        <div className="flex items-center gap-xs text-sm text-grey-400 py-sm">
          <Spinner size="small" />
          <span>Wolke-Ordner werden geladen...</span>
        </div>
        {helpText && <div className="text-xs text-grey-400">{helpText}</div>}
      </div>
    );
  }

  if (!isLoadingData && wolkeOptions.length === 0) {
    return (
      <div className={`flex flex-col gap-xs ${className}`.trim()}>
        <label className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
        <div className="flex flex-col items-center gap-xs py-md text-grey-400">
          <HiOutlineCloud size={48} />
          <p className="text-sm">Keine Wolke-Ordner verfügbar</p>
          <p className="text-xs">
            Fügen Sie erst Wolke-Links hinzu, um sie hier auswählen zu können.
          </p>
        </div>
        {helpText && <div className="text-xs text-grey-400">{helpText}</div>}
        {currentError && <div className="text-xs text-red-500">{currentError}</div>}
      </div>
    );
  }

  const displayValue = isMulti ? selectValue : selectValue[0] || null;

  return (
    <div className={className}>
      <EnhancedSelect
        label={label}
        helpText={helpText}
        required={required}
        error={currentError}
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
