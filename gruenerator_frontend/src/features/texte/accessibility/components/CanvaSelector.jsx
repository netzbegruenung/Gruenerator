import React, { useState, useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useQuery } from '@tanstack/react-query';
import Select from 'react-select';
import { HiRefresh, HiExclamationCircle, HiTemplate } from 'react-icons/hi';
import { useOptimizedAuth } from '../../../../hooks/useAuth';
import * as canvaUtils from '../../../../components/utils/canvaUtils';
import FormFieldWrapper from '../../../../components/common/Form/Input/FormFieldWrapper';

const CanvaSelector = ({ onImageSelect, selectedImageId, loading: externalLoading }) => {
  const { isAuthenticated } = useOptimizedAuth();
  const [selectedDesign, setSelectedDesign] = useState(null);
  const [currentSearchTerm, setCurrentSearchTerm] = useState('');
  const [canvaConnectionStatus, setCanvaConnectionStatus] = useState({
    connected: false,
    user: null,
    loading: true
  });

  // Check Canva connection status
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const status = await canvaUtils.checkCanvaConnectionStatus(isAuthenticated);
        setCanvaConnectionStatus({
          connected: status.connected,
          user: status.user,
          loading: false
        });
      } catch (error) {
        console.error('[CanvaSelector] Error checking connection:', error);
        setCanvaConnectionStatus({
          connected: false,
          user: null,
          loading: false
        });
      }
    };

    if (isAuthenticated) {
      checkConnection();
    } else {
      setCanvaConnectionStatus({
        connected: false,
        user: null,
        loading: false
      });
    }
  }, [isAuthenticated]);

  // Fetch recent Canva designs with increased limit for better search/pagination
  const { 
    data: designs = [], 
    isLoading: designsLoading, 
    error: designsError,
    refetch: refetchDesigns 
  } = useQuery({
    queryKey: ['canva-designs-for-alttext', isAuthenticated, canvaConnectionStatus.connected],
    queryFn: () => canvaUtils.fetchRecentCanvaDesigns(canvaConnectionStatus.connected, isAuthenticated, 50), // Increased limit
    enabled: isAuthenticated && canvaConnectionStatus.connected && !canvaConnectionStatus.loading,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false
  });

  // Search functionality for designs
  const calculateRelevanceScore = useCallback((design, searchTerm) => {
    if (!searchTerm) return 0;
    
    const title = (design.title || '').toLowerCase();
    const searchTermLower = searchTerm.toLowerCase();
    
    let score = 0;
    
    // Exact title match
    if (title === searchTermLower) {
      score += 100;
    }
    // Title starts with search term
    else if (title.startsWith(searchTermLower)) {
      score += 80;
    }
    // Title contains search term
    else if (title.includes(searchTermLower)) {
      score += 50;
    }
    
    return score;
  }, []);

  // Convert designs to dropdown options with search support
  const designOptions = useMemo(() => {
    let filteredDesigns = designs.filter(design => 
      design.thumbnail_url && design.thumbnail_url !== ''
    );

    // Apply search filtering and sorting
    if (currentSearchTerm && currentSearchTerm.trim() !== '') {
      const searchTerm = currentSearchTerm.trim();
      
      filteredDesigns = filteredDesigns
        .map(design => ({
          ...design,
          relevanceScore: calculateRelevanceScore(design, searchTerm)
        }))
        .filter(design => design.relevanceScore > 0)
        .sort((a, b) => b.relevanceScore - a.relevanceScore);
    } else {
      // Sort by creation date (newest first) when no search
      filteredDesigns = filteredDesigns.sort((a, b) => {
        const aDate = new Date(a.created_at || 0);
        const bDate = new Date(b.created_at || 0);
        return bDate - aDate;
      });
    }

    return filteredDesigns.map(design => ({
      value: design.id,
      label: design.title || 'Untitled Design',
      design: design,
      thumbnail_url: design.thumbnail_url,
      created_at: design.created_at
    }));
  }, [designs, currentSearchTerm, calculateRelevanceScore]);

  const handleDesignSelect = useCallback(async (selectedOption) => {
    if (externalLoading || !selectedOption) return;

    const design = selectedOption.design;
    if (!design.thumbnail_url) return;

    setSelectedDesign(design);
    
    try {
      // Pass the design data to parent with thumbnail URL
      // The parent will handle the image conversion
      await onImageSelect({
        type: 'canva',
        design: design,
        imageUrl: design.thumbnail_url,
        title: design.title
      });
    } catch (error) {
      console.error('[CanvaSelector] Error selecting design:', error);
      setSelectedDesign(null);
    }
  }, [onImageSelect, externalLoading]);

  // Custom option formatter with thumbnail preview
  const formatOptionLabel = useCallback((option, { context }) => {
    if (context === 'menu') {
      return (
        <div className="canva-option">
          <div className="canva-option__thumbnail">
            <img 
              src={option.thumbnail_url} 
              alt={option.label}
              className="canva-option__image"
              loading="lazy"
            />
          </div>
          <div className="canva-option__content">
            <span className="canva-option__label">{option.label}</span>
            {option.created_at && (
              <span className="canva-option__date">
                {new Date(option.created_at).toLocaleDateString('de-DE')}
              </span>
            )}
          </div>
        </div>
      );
    }
    
    // For selected value, just show the label
    return <span>{option.label}</span>;
  }, []);

  const handleRefresh = useCallback(() => {
    refetchDesigns();
  }, [refetchDesigns]);

  const handleCanvaLogin = useCallback(async () => {
    try {
      await canvaUtils.initiateCanvaLogin((error) => {
        console.error('[CanvaSelector] Canva login error:', error);
      });
    } catch (error) {
      console.error('[CanvaSelector] Error initiating Canva login:', error);
    }
  }, []);

  // Loading state
  if (canvaConnectionStatus.loading) {
    return (
      <div className="canva-selector">
        <div className="canva-selector-loading">
          <div className="loading-spinner"></div>
          <p>Überprüfe Canva-Verbindung...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <div className="canva-selector">
        <div className="canva-selector-message">
          <HiExclamationCircle className="icon" />
          <h4>Anmeldung erforderlich</h4>
          <p>Melde dich an, um deine Canva-Designs zu verwenden.</p>
        </div>
      </div>
    );
  }

  // Not connected to Canva
  if (!canvaConnectionStatus.connected) {
    return (
      <div className="canva-selector">
        <div className="canva-selector-message">
          <HiTemplate className="icon" />
          <h4>Canva verbinden</h4>
          <p>Verbinde dein Canva-Konto, um deine Designs auszuwählen.</p>
          <button 
            type="button" 
            onClick={handleCanvaLogin}
            className="canva-connect-button"
          >
            Mit Canva verbinden
          </button>
        </div>
      </div>
    );
  }

  // Error loading designs
  if (designsError) {
    return (
      <div className="canva-selector-dropdown">
        <FormFieldWrapper
          label="Canva-Design auswählen"
          helpText="Fehler beim Laden der Canva-Designs"
          htmlFor="canva-design-select"
        >
          <div className="canva-selector-message error">
            <HiExclamationCircle className="icon" />
            <h4>Fehler beim Laden</h4>
            <p>Deine Canva-Designs konnten nicht geladen werden.</p>
            <button 
              type="button" 
              onClick={handleRefresh}
              className="refresh-button"
            >
              <HiRefresh /> Erneut versuchen
            </button>
          </div>
        </FormFieldWrapper>
      </div>
    );
  }

  // Loading designs
  if (designsLoading) {
    return (
      <div className="canva-selector-dropdown">
        <FormFieldWrapper
          label="Canva-Design auswählen"
          helpText="Lädt deine Canva-Designs..."
          htmlFor="canva-design-select"
        >
          <div className="canva-selector-loading">
            <div className="loading-spinner"></div>
            <p>Lade deine Canva-Designs...</p>
          </div>
        </FormFieldWrapper>
      </div>
    );
  }

  // No designs found
  if (designs.length === 0) {
    return (
      <div className="canva-selector-dropdown">
        <FormFieldWrapper
          label="Canva-Design auswählen"
          helpText="Keine Designs in deinem Canva-Konto gefunden"
          htmlFor="canva-design-select"
        >
          <div className="canva-selector-message">
            <HiTemplate className="icon" />
            <h4>Keine Designs gefunden</h4>
            <p>Du hast noch keine Designs in deinem Canva-Konto erstellt.</p>
            <button 
              type="button" 
              onClick={handleRefresh}
              className="refresh-button"
            >
              <HiRefresh /> Aktualisieren
            </button>
          </div>
        </FormFieldWrapper>
      </div>
    );
  }

  // Get currently selected option for the dropdown
  const selectedOption = selectedDesign ? designOptions.find(option => option.value === selectedDesign.id) : null;

  return (
    <div className="canva-selector-dropdown">
      <FormFieldWrapper
        label="Canva-Design auswählen"
        helpText="Suche und wähle ein Design aus deinem Canva-Konto"
        htmlFor="canva-design-select"
      >
        <div className="canva-selector-dropdown__header">
          <Select
            inputId="canva-design-select"
            classNamePrefix="canva-select"
            className="canva-select"
            options={designOptions}
            value={selectedOption}
            onChange={handleDesignSelect}
            formatOptionLabel={formatOptionLabel}
            placeholder="Canva-Design suchen und auswählen..."
            isDisabled={externalLoading}
            isSearchable={true}
            isClearable={true}
            filterOption={() => true} // Disable default filtering since we handle it
            onInputChange={(inputValue) => {
              setCurrentSearchTerm(inputValue);
            }}
            menuPortalTarget={document.body}
            menuPosition="fixed"
            noOptionsMessage={() => {
              if (currentSearchTerm && currentSearchTerm.trim()) {
                return `Keine Designs für "${currentSearchTerm}" gefunden`;
              }
              return 'Keine Designs verfügbar';
            }}
          />
          
          <button 
            type="button" 
            onClick={handleRefresh}
            className="canva-refresh-button"
            title="Designs aktualisieren"
            disabled={designsLoading}
          >
            <HiRefresh className={designsLoading ? 'spinning' : ''} />
          </button>
        </div>
        
        {designsLoading && (
          <div className="canva-selector-dropdown__loading">
            Lade Canva-Designs...
          </div>
        )}
      </FormFieldWrapper>
    </div>
  );
};

CanvaSelector.propTypes = {
  onImageSelect: PropTypes.func.isRequired,
  selectedImageId: PropTypes.string,
  loading: PropTypes.bool
};

export default CanvaSelector;