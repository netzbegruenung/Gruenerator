import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../../../../../../../components/utils/apiClient';
import { useMessageHandling } from '../../../../../../../../hooks/useMessageHandling';
import { getSitesDomain } from './utils/siteConfig';

// Components
import SiteCreator from './components/SiteCreator';
import SiteEditor from './components/SiteEditor';
import SitePreview from './components/SitePreview';

const SitesView = ({ isActive = true, onSuccessMessage = () => {}, onErrorMessage = () => {} }) => {
    const [site, setSite] = useState(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('empty'); // 'empty', 'preview', 'edit', 'create'

    const { clearMessages } = useMessageHandling(onSuccessMessage, onErrorMessage);

    useEffect(() => {
        if (isActive) {
            fetchSite();
        }
    }, [isActive]);

    const fetchSite = async () => {
        try {
            setLoading(true);
            console.log('[SitesView] Fetching site data...');
            const response = await apiClient.get('/sites/my-site');
            console.log('[SitesView] Site data received:', response.data);
            if (response.data.site) {
                setSite(response.data.site);
                setView('preview');
            } else {
                setSite(null);
                setView('empty');
            }
        } catch (err) {
            console.error('[SitesView] Error fetching site:', err);
            onErrorMessage('Fehler beim Laden der Site: ' + (err.response?.data?.error || err.message));
            setView('empty');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateSite = async (siteData) => {
        try {
            const response = await apiClient.post('/api/sites/create', siteData);
            setSite(response.data.site);
            setView('preview');
            onSuccessMessage('Site erfolgreich erstellt!');
        } catch (err) {
            onErrorMessage(err.response?.data?.error || 'Fehler beim Erstellen der Site');
            throw err;
        }
    };

    const handleUpdateSite = async (siteData) => {
        try {
            const response = await apiClient.put(`/api/sites/${site.id}`, siteData);
            setSite(response.data.site);
            setView('preview');
            onSuccessMessage('Site erfolgreich aktualisiert!');
        } catch (err) {
            onErrorMessage(err.response?.data?.error || 'Fehler beim Aktualisieren der Site');
            throw err;
        }
    };

    const handlePublish = async () => {
        try {
            const response = await apiClient.post(`/api/sites/${site.id}/publish`, {
                publish: !site.is_published
            });
            setSite(response.data.site);
            onSuccessMessage(response.data.site.is_published ? 'Site veröffentlicht!' : 'Site unveröffentlicht');
        } catch (err) {
            onErrorMessage('Fehler beim Veröffentlichen der Site');
        }
    };

    const handleStartEdit = useCallback(() => {
        setView('edit');
        clearMessages();
    }, [clearMessages]);

    const handleCancelEdit = useCallback(() => {
        setView('preview');
        clearMessages();
    }, [clearMessages]);

    const handleStartCreate = useCallback(() => {
        setView('create');
        clearMessages();
    }, [clearMessages]);

    const handleCancelCreate = useCallback(() => {
        setView('empty');
        clearMessages();
    }, [clearMessages]);

    if (loading) {
        return (
            <div className="profile-tab-loading">
                Lädt...
            </div>
        );
    }

    // Empty state - no site yet
    if (view === 'empty' && !site) {
        return (
            <div className="profile-content-card">
                <div className="profile-info-panel">
                    <div className="profile-header-section">
                        <div className="group-title-area">
                            <h2 className="profile-user-name large-profile-title">
                                Web-Visitenkarte
                            </h2>
                            <p className="profile-detail-text">
                                Erstelle eine einfache One-Page-Site unter deiner eigenen Subdomain auf {getSitesDomain()}
                            </p>
                        </div>
                    </div>

                    <div style={{ textAlign: 'center', padding: 'var(--spacing-xxlarge) 0' }}>
                        <button
                            className="profile-action-button primary"
                            onClick={handleStartCreate}
                        >
                            Site erstellen
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Create view
    if (view === 'create') {
        return (
            <div className="profile-content-card">
                <div className="profile-info-panel">
                    <div className="profile-header-section">
                        <div className="group-title-area">
                            <h2 className="profile-user-name large-profile-title">
                                Neue Site erstellen
                            </h2>
                        </div>
                    </div>

                    <SiteCreator
                        onSubmit={handleCreateSite}
                        onCancel={handleCancelCreate}
                    />
                </div>
            </div>
        );
    }

    // Edit view
    if (view === 'edit' && site) {
        return (
            <div className="profile-content-card">
                <div className="profile-info-panel">
                    <div className="profile-header-section">
                        <div className="group-title-area">
                            <h2 className="profile-user-name large-profile-title">
                                Site bearbeiten
                            </h2>
                        </div>
                    </div>

                    <SiteEditor
                        site={site}
                        onSubmit={handleUpdateSite}
                        onCancel={handleCancelEdit}
                    />
                </div>
            </div>
        );
    }

    // Preview view (default)
    return (
        <div className="profile-content-card">
            <div className="profile-info-panel">
                <SitePreview
                    site={site}
                    onEdit={handleStartEdit}
                    onPublish={handlePublish}
                />
            </div>
        </div>
    );
};

export default SitesView;
