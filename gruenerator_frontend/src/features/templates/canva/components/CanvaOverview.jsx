import React, { useState, useEffect, useCallback } from 'react';
import { HiRefresh, HiTemplate, HiCheck, HiX, HiExclamationCircle, HiEye } from 'react-icons/hi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import CanvaButton from './CanvaButton';

// Utils
import * as canvaUtils from '../../../../components/utils/canvaUtils';

/**
 * CanvaOverview - Lightweight overview component for Canva integration
 * Follows Canva brand guidelines and uses utility functions for business logic
 */
const CanvaOverview = ({
    canvaConnected = false,
    canvaUser = null,
    canvaLoading = false,
    isAuthenticated = false,
    onCanvaLogin,
    onSuccessMessage,
    onErrorMessage,
    onNavigateToSubtab
}) => {
    
    // Local state for connection badge hover
    const [isConnectionHovered, setIsConnectionHovered] = useState(false);
    
    // Get query client for cache invalidation
    const queryClient = useQueryClient();

    // Fetch recent designs using utility function
    const { data: recentDesigns = [], isLoading: designsLoading, refetch: refetchDesigns } = useQuery({
        queryKey: ['canva-recent-designs', isAuthenticated, canvaConnected],
        queryFn: () => canvaUtils.fetchRecentCanvaDesigns(canvaConnected, isAuthenticated, 4),
        enabled: isAuthenticated && canvaConnected,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false
    });


    // Handle disconnect
    const handleDisconnect = useCallback(async () => {
        if (!window.confirm('Möchtest du die Verbindung zu Canva wirklich trennen?')) {
            return;
        }

        try {
            await canvaUtils.disconnectFromCanva(
                (message) => {
                    onSuccessMessage?.(message);
                    // The parent component should handle state updates
                },
                onErrorMessage
            );
        } catch (error) {
            // Error already handled by utility function
        }
    }, [onSuccessMessage, onErrorMessage]);

    // Invalidate queries when authentication state changes (logout)
    useEffect(() => {
        if (!isAuthenticated) {
            // Clear all Canva-related queries when logged out
            queryClient.invalidateQueries({ queryKey: ['canva-overview-stats'] });
            queryClient.invalidateQueries({ queryKey: ['canva-recent-designs'] });
            // Also clear the cache entirely for these queries to prevent stale data
            queryClient.removeQueries({ queryKey: ['canva-overview-stats'] });
            queryClient.removeQueries({ queryKey: ['canva-recent-designs'] });
        }
    }, [isAuthenticated, queryClient]);

    // Generate UI configurations using utility functions
    const connectionBadge = canvaUtils.getCanvaConnectionBadge(canvaConnected, canvaUser, canvaLoading);
    // Stats section removed

    // Render connection status section
    const renderConnectionStatus = () => (
        <div className="canva-connection-section">
            <div className="connection-status-content">
                {canvaConnected && (
                    <button
                        type="button"
                        className={`${connectionBadge.className} canva-connection-badge-button`}
                        style={{ color: isConnectionHovered ? 'var(--error-red)' : connectionBadge.color }}
                        onClick={handleDisconnect}
                        onMouseEnter={() => setIsConnectionHovered(true)}
                        onMouseLeave={() => setIsConnectionHovered(false)}
                    >
                        {getStatusIcon(connectionBadge.icon)}
                        <span>{isConnectionHovered ? 'Ausloggen' : connectionBadge.text}</span>
                    </button>
                )}

                {canvaConnected ? (
                    <div>
                        <p className="connection-status-description">
                            Deine Designs und Assets werden automatisch synchronisiert und können direkt im Grünerator verwendet werden.
                        </p>
                        
                        {connectionBadge.userInfo && (
                            <div className="connection-user-info" style={{ display: 'none' }}>
                                {connectionBadge.userInfo.avatar && (
                                    <img 
                                        src={connectionBadge.userInfo.avatar} 
                                        alt="Canva Avatar"
                                        className="connection-user-avatar"
                                    />
                                )}
                                <div className="connection-user-details">
                                    {connectionBadge.userInfo.name && (
                                        <div className="connection-user-name">{connectionBadge.userInfo.name}</div>
                                    )}
                                    {connectionBadge.userInfo.email && (
                                        <div className="connection-user-email">{connectionBadge.userInfo.email}</div>
                                    )}
                                </div>
                            </div>
                        )}
                        
                    </div>
                ) : (
                    <div>
                        <p className="connection-status-description">
                            Verbinde dich mit Canva, um deine Vorlagen direkt im Grünerator zu verwalten und beispielsweise Alt-Texte anhand deiner Vorlagen zu erstellen.
                        </p>
                        
                        <CanvaButton
                            onClick={onCanvaLogin}
                            loading={canvaLoading}
                            size="medium"
                            style={{ marginTop: 'var(--spacing-medium)' }}
                            ariaLabel="Mit Canva verbinden"
                        >
                            Mit Canva verbinden
                        </CanvaButton>
                    </div>
                )}
            </div>
        </div>
    );


    // Render statistics cards
    const renderStatistics = () => {
        return null;
    };

    // Render recent designs
    const renderRecentDesigns = () => {
        if (!canvaConnected) return null;

        return (
            <div className="canva-recent-designs">
                <h3 className="canva-recent-title">Aktuelle Designs</h3>
                
                {designsLoading ? (
                    <div className="canva-recent-empty">
                        <HiTemplate className="canva-recent-empty-icon" />
                        <p className="canva-recent-empty-text">Designs werden geladen...</p>
                    </div>
                ) : recentDesigns.length === 0 ? (
                    <div className="canva-recent-empty">
                        <HiTemplate className="canva-recent-empty-icon" />
                        <p className="canva-recent-empty-text">
                            Noch keine Designs vorhanden. Erstelle dein erstes Design in Canva!
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="canva-recent-grid">
                            {recentDesigns.slice(0, 4).map(design => (
                                <div
                                    key={design.id}
                                    className="canva-recent-design"
                                    onClick={() => {
                                        if (design.canva_url) {
                                            window.open(design.canva_url, '_blank');
                                        }
                                    }}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            if (design.canva_url) {
                                                window.open(design.canva_url, '_blank');
                                            }
                                        }
                                    }}
                                >
                                    <div className="canva-recent-thumbnail">
                                        {design.thumbnail_url ? (
                                            <img src={design.thumbnail_url} alt={design.title} />
                                        ) : (
                                            <HiTemplate style={{ width: '32px', height: '32px' }} />
                                        )}
                                    </div>
                                    <div className="canva-recent-info">
                                        <h4 className="canva-recent-name" title={design.title}>
                                            {design.title}
                                        </h4>
                                        <div className="canva-recent-date">
                                            {design.updated_at ? 
                                                new Date(design.updated_at).toLocaleDateString('de-DE') :
                                                'Unbekanntes Datum'
                                            }
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        <a
                            href="#"
                            className="canva-view-all-link"
                            onClick={(e) => {
                                e.preventDefault();
                                onNavigateToSubtab?.('vorlagen');
                            }}
                            style={{ color: 'var(--font-color)' }}
                        >
                            <span>Alle Designs anzeigen</span>
                            <HiEye style={{ color: 'var(--font-color)' }} />
                        </a>
                    </>
                )}
            </div>
        );
    };

    // Helper function to render status icons
    const getStatusIcon = (iconType) => {
        const iconProps = { style: { width: '16px', height: '16px' } };
        switch (iconType) {
            case 'check':
                return <HiCheck {...iconProps} />;
            case 'disconnect':
                return <HiX {...iconProps} />;
            case 'loading':
                return <HiRefresh {...iconProps} className="animate-spin" />;
            default:
                return <HiExclamationCircle {...iconProps} />;
        }
    };



    return (
        <div className="canva-overview" role="main" aria-label="Canva Integration Overview">
            {renderConnectionStatus()}
            {renderStatistics()}
            {renderRecentDesigns()}
        </div>
    );
};

export default CanvaOverview;