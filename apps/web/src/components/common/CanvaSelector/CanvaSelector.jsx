import React, { lazy, Suspense, useState, useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useQuery } from '@tanstack/react-query';
const Select = lazy(() => import('react-select'));
import { HiRefresh, HiExclamationCircle, HiCheck, HiTemplate } from 'react-icons/hi';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import * as canvaUtils from '../../../components/utils/canvaUtils';
import FormFieldWrapper from '../Form/Input/FormFieldWrapper';
import './CanvaSelector.css';

const CanvaSelector = ({ onImageSelect, selectedImageId, loading: externalLoading, variant = 'dropdown' }) => {
  const { isAuthenticated } = useOptimizedAuth();
  const [selectedDesign, setSelectedDesign] = useState(null);
  const [currentSearchTerm, setCurrentSearchTerm] = useState('');
  const [canvaConnectionStatus, setCanvaConnectionStatus] = useState({
    connected: false,
    user: null,
    loading: true
  });

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

  const {
    data: designs = [],
    isLoading: designsLoading,
    error: designsError,
    refetch: refetchDesigns
  } = useQuery({
    queryKey: ['canva-designs-for-alttext', isAuthenticated, canvaConnectionStatus.connected],
    queryFn: () => canvaUtils.fetchRecentCanvaDesigns(canvaConnectionStatus.connected, isAuthenticated, 50),
    enabled: isAuthenticated && canvaConnectionStatus.connected && !canvaConnectionStatus.loading,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const calculateRelevanceScore = useCallback((design, searchTerm) => {
    if (!searchTerm) return 0;

    const title = (design.title || '').toLowerCase();
    const searchTermLower = searchTerm.toLowerCase();

    let score = 0;

    if (title === searchTermLower) {
      score += 100;
    } else if (title.startsWith(searchTermLower)) {
      score += 80;
    } else if (title.includes(searchTermLower)) {
      score += 50;
    }

    return score;
  }, []);

  const designOptions = useMemo(() => {
    let filteredDesigns = designs.filter(design =>
      design.thumbnail_url && design.thumbnail_url !== ''
    );

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

  const handleDesignSelect = useCallback(async (designOrOption) => {
    if (externalLoading) return;

    const design = designOrOption.design || designOrOption;
    if (!design.thumbnail_url) return;

    setSelectedDesign(design);

    try {
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

  if (designsError) {
    const errorContent = (
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
    );

    return variant === 'dropdown' ? (
      <div className="canva-selector-dropdown">
        <FormFieldWrapper
          label="Canva-Design auswählen"
          helpText="Fehler beim Laden der Canva-Designs"
          htmlFor="canva-design-select"
        >
          {errorContent}
        </FormFieldWrapper>
      </div>
    ) : (
      <div className="canva-selector">{errorContent}</div>
    );
  }

  if (designsLoading) {
    const loadingContent = (
      <div className="canva-selector-loading">
        <div className="loading-spinner"></div>
        <p>Lade deine Canva-Designs...</p>
      </div>
    );

    return variant === 'dropdown' ? (
      <div className="canva-selector-dropdown">
        <FormFieldWrapper
          label="Canva-Design auswählen"
          helpText="Lädt deine Canva-Designs..."
          htmlFor="canva-design-select"
        >
          {loadingContent}
        </FormFieldWrapper>
      </div>
    ) : (
      <div className="canva-selector">{loadingContent}</div>
    );
  }

  if (designs.length === 0) {
    const emptyContent = (
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
    );

    return variant === 'dropdown' ? (
      <div className="canva-selector-dropdown">
        <FormFieldWrapper
          label="Canva-Design auswählen"
          helpText="Keine Designs in deinem Canva-Konto gefunden"
          htmlFor="canva-design-select"
        >
          {emptyContent}
        </FormFieldWrapper>
      </div>
    ) : (
      <div className="canva-selector">{emptyContent}</div>
    );
  }

  if (variant === 'grid') {
    return (
      <div className="canva-selector">
        <div className="canva-selector-header">
          <div className="header-info">
            <h4>Wähle ein Canva-Design</h4>
            <p>Klicke auf ein Design, um es auszuwählen</p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="refresh-button small"
            title="Designs aktualisieren"
          >
            <HiRefresh />
          </button>
        </div>

        <div className="canva-designs-grid">
          {designOptions.map((option) => {
            const design = option.design;
            const isSelected = selectedDesign?.id === design.id || selectedImageId === design.id;
            const hasValidThumbnail = design.thumbnail_url && design.thumbnail_url !== '';

            return (
              <div
                key={design.id}
                className={`canva-design-card ${isSelected ? 'selected' : ''} ${!hasValidThumbnail ? 'no-image' : ''} ${externalLoading ? 'disabled' : ''}`}
                onClick={() => hasValidThumbnail && handleDesignSelect(design)}
                role="button"
                tabIndex={hasValidThumbnail && !externalLoading ? 0 : -1}
                onKeyPress={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && hasValidThumbnail && !externalLoading) {
                    e.preventDefault();
                    handleDesignSelect(design);
                  }
                }}
              >
                <div className="design-image-wrapper">
                  {hasValidThumbnail ? (
                    <>
                      <img
                        src={design.thumbnail_url}
                        alt={design.title || 'Canva Design'}
                        className="design-image"
                        loading="lazy"
                      />
                      {isSelected && (
                        <div className="selection-overlay">
                          <HiCheck className="check-icon" />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="no-image-placeholder">
                      <HiTemplate className="placeholder-icon" />
                      <span>Kein Bild</span>
                    </div>
                  )}
                  {externalLoading && (
                    <div className="loading-overlay">
                      <div className="loading-spinner small"></div>
                    </div>
                  )}
                </div>

                <div className="design-info">
                  <h5 className="design-title" title={design.title}>
                    {design.title || 'Untitled Design'}
                  </h5>
                  {design.created_at && (
                    <span className="design-date">
                      {new Date(design.created_at).toLocaleDateString('de-DE')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const selectedOption = selectedDesign ? designOptions.find(option => option.value === selectedDesign.id) : null;

  return (
    <div className="canva-selector-dropdown">
      <FormFieldWrapper
        label="Canva-Design auswählen"
        helpText="Suche und wähle ein Design aus deinem Canva-Konto"
        htmlFor="canva-design-select"
      >
        <div className="canva-selector-dropdown__header">
          <Suspense fallback={<div>Loading...</div>}>
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
              filterOption={() => true}
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
          </Suspense>

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
  loading: PropTypes.bool,
  variant: PropTypes.oneOf(['dropdown', 'grid'])
};

export default CanvaSelector;
