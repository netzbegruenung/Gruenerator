import React, { useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useQuery } from '@tanstack/react-query';
import { HiRefresh, HiExclamationCircle, HiCheck, HiTemplate } from 'react-icons/hi';
import { useOptimizedAuth } from '../../../../hooks/useAuth';
import * as canvaUtils from '../../../../components/utils/canvaUtils';

const CanvaSelector = ({ onImageSelect, selectedImageId, loading: externalLoading }) => {
  const { isAuthenticated } = useOptimizedAuth();
  const [selectedDesign, setSelectedDesign] = useState(null);
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

  // Fetch recent Canva designs
  const { 
    data: designs = [], 
    isLoading: designsLoading, 
    error: designsError,
    refetch: refetchDesigns 
  } = useQuery({
    queryKey: ['canva-designs-for-alttext', isAuthenticated, canvaConnectionStatus.connected],
    queryFn: () => canvaUtils.fetchRecentCanvaDesigns(canvaConnectionStatus.connected, isAuthenticated, 20),
    enabled: isAuthenticated && canvaConnectionStatus.connected && !canvaConnectionStatus.loading,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false
  });

  const handleDesignSelect = useCallback(async (design) => {
    if (externalLoading || !design.thumbnail_url) return;

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
      <div className="canva-selector">
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
      </div>
    );
  }

  // Loading designs
  if (designsLoading) {
    return (
      <div className="canva-selector">
        <div className="canva-selector-loading">
          <div className="loading-spinner"></div>
          <p>Lade deine Canva-Designs...</p>
        </div>
      </div>
    );
  }

  // No designs found
  if (designs.length === 0) {
    return (
      <div className="canva-selector">
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
      </div>
    );
  }

  return (
    <div className="canva-selector">
      <div className="canva-selector-header">
        <div className="header-info">
          <h4>Wähle ein Canva-Design</h4>
          <p>Klicke auf ein Design, um Alt-Text für dessen Vorschaubild zu generieren</p>
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
        {designs.map((design) => {
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
};

CanvaSelector.propTypes = {
  onImageSelect: PropTypes.func.isRequired,
  selectedImageId: PropTypes.string,
  loading: PropTypes.bool
};

export default CanvaSelector;