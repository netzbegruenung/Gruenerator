import React, { useState, useEffect, useMemo, memo, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import Select from 'react-select';
import debounce from 'lodash.debounce';
import FormFieldWrapper from '../Form/Input/FormFieldWrapper';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import useApiSubmit from '../../hooks/useApiSubmit';
import { HiOutlineOfficeBuilding, HiDocument, HiDocumentText } from 'react-icons/hi';
import './BundestagDocumentSelector.css';

// Document type icons
const BundestagIcon = memo(({ type, size = 16 }) => {
  const iconClass = "bundestag-option__icon";
  
  switch (type) {
    case 'drucksache':
      return <HiDocument className={iconClass} size={size} />;
    case 'plenarprotokoll':
      return <HiDocumentText className={iconClass} size={size} />;
    case 'vorgang':
      return <HiOutlineOfficeBuilding className={iconClass} size={size} />;
    default:
      return <HiDocument className={iconClass} size={size} />;
  }
});

BundestagIcon.propTypes = {
  type: PropTypes.string,
  size: PropTypes.number
};

/**
 * BundestagDocumentSelector component for searching and selecting parliamentary documents
 */
const BundestagDocumentSelector = ({ 
  onDocumentSelection,
  disabled = false,
  tabIndex,
  searchQuery = '' // Auto-populate search from form data
}) => {
  const { bundestagApiEnabled } = useOptimizedAuth();
  
  // API hook for Bundestag search
  const { submitForm: searchBundestag, loading: isSearching, error: searchError } = useApiSubmit('/bundestag/search');
  
  // Store search function in ref to avoid recreation
  const searchFunctionRef = useRef();
  
  // Component state
  const [searchTerm, setSearchTerm] = useState(searchQuery);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Update search function ref when it changes
  useEffect(() => {
    searchFunctionRef.current = searchBundestag;
  }, [searchBundestag]);

  // Auto-populate search term when form data changes
  useEffect(() => {
    if (searchQuery && searchQuery !== searchTerm) {
      setSearchTerm(searchQuery);
    }
  }, [searchQuery, searchTerm]);

  // Debounced search function - stable dependencies
  const debouncedSearch = useMemo(
    () => debounce(async (query) => {
      if (!bundestagApiEnabled || !query || query.trim().length < 3) {
        setSearchResults([]);
        setHasSearched(false);
        return;
      }

      setHasSearched(true);

      try {
        const data = await searchFunctionRef.current({ 
          query: query.trim(),
          includeDrucksachen: true,
          includePlenarprotokolle: true,
          includeVorgaenge: false,
          maxDrucksachen: 5,
          maxPlenarprotokolle: 3
        });
        
        if (data && data.success && data.results) {
          // Flatten all document types into single array with proper formatting
          const allDocuments = [
            ...data.results.drucksachen.map(doc => ({
              ...doc,
              value: `drucksache_${doc.id}`,
              label: doc.title,
              type: 'drucksache',
              subtitle: `${doc.nummer || 'N/A'} • ${doc.wahlperiode || 'N/A'}. WP • ${doc.date || 'N/A'}`
            })),
            ...data.results.plenarprotokolle.map(doc => ({
              ...doc,
              value: `plenarprotokoll_${doc.id}`,
              label: doc.title,
              type: 'plenarprotokoll', 
              subtitle: `Nr. ${doc.nummer || 'N/A'} • ${doc.wahlperiode || 'N/A'}. WP • ${doc.date || 'N/A'}`
            }))
          ];

          setSearchResults(allDocuments);
        } else {
          setSearchResults([]);
        }
      } catch (error) {
        console.error('Bundestag search error:', error);
        setSearchResults([]);
      }
    }, 300, { leading: false, trailing: true }),
    [bundestagApiEnabled] // Only depend on stable values
  );

  // Trigger search when searchTerm changes
  useEffect(() => {
    if (searchTerm) {
      debouncedSearch(searchTerm);
    } else {
      setSearchResults([]);
      setHasSearched(false);
    }
  }, [searchTerm, debouncedSearch]);

  // Cleanup debounced function on unmount
  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  // Handle document selection changes
  const handleDocumentChange = useCallback((selectedOptions) => {
    const newSelection = selectedOptions || [];
    setSelectedDocuments(newSelection);
    
    // Notify parent component
    if (onDocumentSelection) {
      onDocumentSelection(newSelection);
    }
  }, [onDocumentSelection]);

  // Format option labels with highlighting
  const formatOptionLabel = useCallback(({ type, label, subtitle }, { context }) => {
    if (context === 'menu') {
      return (
        <div className="bundestag-option">
          <BundestagIcon type={type} size={16} />
          <div className="bundestag-option__content">
            <span className="bundestag-option__label">{label}</span>
            {subtitle && (
              <span className="bundestag-option__subtitle">{subtitle}</span>
            )}
          </div>
        </div>
      );
    }
    return <span>{label}</span>;
  }, []);

  // Hide component if Bundestag API is not enabled
  if (!bundestagApiEnabled) {
    return null;
  }

  return (
    <div className="bundestag-selector__wrapper">
      <div className="bundestag-selector">
        <FormFieldWrapper
          label="Parlamentarische Dokumente"
          helpText="Suche und wähle relevante Drucksachen und Plenarprotokolle aus dem Bundestag aus"
          htmlFor="bundestag-search"
        >
          <Select
            inputId="bundestag-search"
            classNamePrefix="bundestag-select"
            isMulti
            options={searchResults}
            placeholder="Suchbegriff eingeben (mind. 3 Zeichen)..."
            isDisabled={disabled}
            isLoading={isSearching}
            formatOptionLabel={formatOptionLabel}
            filterOption={() => true} // Disable default filtering
            onInputChange={(inputValue) => {
              setSearchTerm(inputValue);
            }}
            inputValue={searchTerm}
            value={selectedDocuments}
            onChange={handleDocumentChange}
            closeMenuOnSelect={false}
            hideSelectedOptions={true}
            isClearable={false}
            isSearchable={true}
            blurInputOnSelect={true}
            openMenuOnFocus={false}
            tabSelectsValue={true}
            tabIndex={tabIndex}
            menuPortalTarget={document.body}
            styles={{
              menuPortal: (base) => ({ 
                ...base, 
                zIndex: 9999 
              })
            }}
            noOptionsMessage={() => {
              if (isSearching) {
                return 'Suche läuft...';
              }
              if (searchError) {
                return `Fehler: ${searchError}`;
              }
              if (!hasSearched || !searchTerm || searchTerm.length < 3) {
                return 'Gib mindestens 3 Zeichen ein, um zu suchen';
              }
              return 'Keine Dokumente gefunden';
            }}
          />
        </FormFieldWrapper>
      </div>

      {/* Show selection count and types */}
      {selectedDocuments.length > 0 && (
        <div className="bundestag-selector__status">
          <span className="bundestag-selector__count">
            {selectedDocuments.length} Dokument{selectedDocuments.length !== 1 ? 'e' : ''} ausgewählt
          </span>
          <div className="bundestag-selector__types">
            {selectedDocuments.some(doc => doc.type === 'drucksache') && (
              <span className="bundestag-selector__type">
                <HiDocument size={14} /> Drucksachen
              </span>
            )}
            {selectedDocuments.some(doc => doc.type === 'plenarprotokoll') && (
              <span className="bundestag-selector__type">
                <HiDocumentText size={14} /> Plenarprotokolle
              </span>
            )}
          </div>
        </div>
      )}

      {/* Information notice */}
      <div className="bundestag-selector__info">
        <small>
          Die ausgewählten parlamentarischen Dokumente werden zur Fundierung deines Antrags verwendet. 
          Die Inhalte stammen aus dem offiziellen DIP (Dokumentations- und Informationssystem für Parlamentsmaterialien) des Bundestags.
        </small>
      </div>
    </div>
  );
};

BundestagDocumentSelector.propTypes = {
  onDocumentSelection: PropTypes.func,
  disabled: PropTypes.bool,
  tabIndex: PropTypes.number,
  searchQuery: PropTypes.string
};

BundestagDocumentSelector.displayName = 'BundestagDocumentSelector';

// Memoize the component
const areEqual = (prevProps, nextProps) => {
  return (
    prevProps.disabled === nextProps.disabled &&
    prevProps.onDocumentSelection === nextProps.onDocumentSelection &&
    prevProps.tabIndex === nextProps.tabIndex &&
    prevProps.searchQuery === nextProps.searchQuery
  );
};

export default memo(BundestagDocumentSelector, areEqual);