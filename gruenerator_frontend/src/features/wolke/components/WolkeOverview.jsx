import React from 'react';
import { HiCloud, HiExternalLink, HiPlus } from 'react-icons/hi';
import ProfileCard from '../../../components/common/ProfileCard';

const WolkeOverview = ({
    shareLinks = [],
    wolkeLoading = false,
    onAddShareLink,
    onNavigateToManager,
    onSuccessMessage,
    onErrorMessage
}) => {
    const hasActiveLinks = Array.isArray(shareLinks) && shareLinks.some(link => link.is_active);
    const totalLinks = Array.isArray(shareLinks) ? shareLinks.length : 0;

    return (
        <ProfileCard 
            title="Wolke (Nextcloud) Integration"
        >
            <div className="wolke-overview-container">
                <div className="wolke-status-section">
                    <div className="wolke-status-header">
                        <div className="wolke-status-icon">
                            {hasActiveLinks ? '🟢' : '⚪'}
                        </div>
                        <div className="wolke-status-info">
                            <h4>Verbindungsstatus</h4>
                            <p className="wolke-status-text">
                                {hasActiveLinks 
                                    ? `${totalLinks} Nextcloud-Verbindung${totalLinks > 1 ? 'en' : ''} aktiv`
                                    : 'Keine aktive Nextcloud-Verbindung'
                                }
                            </p>
                        </div>
                    </div>
                    
                    {hasActiveLinks && (
                        <div className="wolke-quick-stats">
                            <div className="wolke-stat-item">
                                <span className="wolke-stat-label">Aktive Links:</span>
                                <span className="wolke-stat-value">{totalLinks}</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="wolke-features-section">
                    <h4>Funktionen</h4>
                    <div className="wolke-features-grid">
                        <div className="wolke-feature-card">
                            <div className="wolke-feature-icon">📁</div>
                            <h5>Share-Links verwalten</h5>
                            <p>Füge beschreibbare Nextcloud-Share-Links hinzu und verwalte sie.</p>
                        </div>
                        
                        <div className="wolke-feature-card">
                            <div className="wolke-feature-icon">⬆️</div>
                            <h5>Dateien hochladen</h5>
                            <p>Lade Dokumente direkt zu deinen Nextcloud-Shares hoch.</p>
                        </div>
                        
                        <div className="wolke-feature-card">
                            <div className="wolke-feature-icon">🔗</div>
                            <h5>Öffentliche Shares</h5>
                            <p>Arbeite mit öffentlichen, beschreibbaren Nextcloud-Ordnern.</p>
                        </div>
                    </div>
                </div>

                <div className="wolke-actions-section">
                    <div className="wolke-primary-actions">
                        {!hasActiveLinks ? (
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={onAddShareLink}
                                disabled={wolkeLoading}
                            >
                                <HiPlus className="icon" />
                                Erste Nextcloud-Verbindung hinzufügen
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={onNavigateToManager}
                                    disabled={wolkeLoading}
                                >
                                    <HiCloud className="icon" />
                                    Share-Links verwalten
                                </button>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={onAddShareLink}
                                    disabled={wolkeLoading}
                                    style={{ marginLeft: 'var(--spacing-small)' }}
                                >
                                    <HiPlus className="icon" />
                                    Weitere hinzufügen
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {hasActiveLinks && (
                    <div className="wolke-recent-links">
                        <h5>Deine Nextcloud-Verbindungen</h5>
                        <div className="wolke-links-preview">
                            {shareLinks.slice(0, 3).map(link => (
                                <div key={link.id} className="wolke-link-preview-item">
                                    <div className="wolke-link-info">
                                        <span className="wolke-link-label">
                                            {link.label || 'Unbenannt'}
                                        </span>
                                        <span className="wolke-link-url">
                                            {new URL(link.share_link).hostname}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        className="wolke-link-external-button"
                                        onClick={() => window.open(link.share_link, '_blank')}
                                        title="In neuem Tab öffnen"
                                    >
                                        <HiExternalLink />
                                    </button>
                                </div>
                            ))}
                            {shareLinks.length > 3 && (
                                <div className="wolke-link-preview-more">
                                    <span>... und {shareLinks.length - 3} weitere</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="wolke-info-section">
                    <div className="wolke-info-box">
                        <h5>Was ist Wolke?</h5>
                        <p>
                            Wolke ist die Nextcloud-Integration für den Grünerator. 
                            Du kannst beschreibbare öffentliche Share-Links hinzufügen 
                            und direkt Dateien in deine Nextcloud hochladen.
                        </p>
                        <p>
                            <strong>Hinweis:</strong> Du benötigst einen öffentlichen, 
                            beschreibbaren Share-Link von deiner Nextcloud-Instanz.
                        </p>
                    </div>
                </div>
            </div>
        </ProfileCard>
    );
};

export default WolkeOverview;