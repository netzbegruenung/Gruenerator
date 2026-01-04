import React, { useEffect, useRef } from 'react';

interface SelectAllCheckboxItem {
  source_type?: string;
  [key: string]: unknown;
}

interface SelectAllCheckboxProps {
  enabled?: boolean;
  disabledWhenRemote?: boolean;
  isRemoteActive?: boolean;
  filteredItems?: SelectAllCheckboxItem[];
  itemType?: 'document' | 'notebook';
  selectedItemIds?: Set<string>;
  onToggleAll?: (isSelected: boolean) => void;
}

const SelectAllCheckbox = ({
  enabled = false,
  disabledWhenRemote = false,
  isRemoteActive = false,
  filteredItems = [],
  itemType = 'document',
  selectedItemIds = new Set(),
  onToggleAll,
}: SelectAllCheckboxProps) => {
  const checkboxRef = useRef<HTMLInputElement>(null);

  const selectableItems = filteredItems.filter(
    (item) => itemType !== 'document' || item.source_type !== 'wolke'
  );
  const allSelected = selectedItemIds.size > 0 && selectedItemIds.size === selectableItems.length;
  const isIndeterminate = selectedItemIds.size > 0 && selectedItemIds.size < selectableItems.length;

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = isIndeterminate;
    }
  }, [isIndeterminate]);

  if (!enabled) return null;
  if (disabledWhenRemote && isRemoteActive) return null;
  if (selectableItems.length === 0) return null;

  return (
    <div className="document-overview-select-all">
      <input
        ref={checkboxRef}
        type="checkbox"
        id="select-all-checkbox"
        checked={allSelected}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onToggleAll?.(e.target.checked)}
      />
    </div>
  );
};

export default SelectAllCheckbox;

