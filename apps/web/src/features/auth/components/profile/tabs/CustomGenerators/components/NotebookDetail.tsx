import React, { useEffect, useState } from 'react';
import { motion } from "motion/react";
import { HiInformationCircle } from 'react-icons/hi';

// Common components
import { ProfileIconButton, ProfileActionButton } from '../../../../../../../components/profile/actions/ProfileActionButton';
import EditableDetailForm from '../../shared/EditableDetailForm';
import useEditableDetail from '../../shared/useEditableDetail';
import NotebookEditor from '../../../../../../notebook/components/NotebookEditor';
import { handleError } from '../../../../../../../components/utils/errorHandling';
import NextcloudShareManager from '../../../../../../../utils/nextcloudShareManager';

// Import ProfileActionButton CSS
import '../../../../../../../assets/styles/components/profile/profile-action-buttons.css';

// Hooks
import { useNotebookCollections } from '../../../../../hooks/useProfileData';
import { useBetaFeatures } from '../../../../../../../hooks/useBetaFeatures';

const NotebookDetail = ({
    isActive,
    onSuccessMessage,
    onErrorMessage,
    qaId,
    onBack,
    onViewQA,
    notebookCollections,
    qaQuery,
    availableDocuments
}) => {
    // Beta features check
    const { canAccessBetaFeature } = useBetaFeatures();
    const isQAEnabled = canAccessBetaFeature('notebook');

    // Use centralized hooks
    const {
        updateQACollection,
        deleteQACollection,
        syncQACollection,
        isUpdating: isUpdatingQA,
        isDeleting: isDeletingQA,
        isSyncing
    } = useNotebookCollections({ isActive: isActive && isQAEnabled });

    // Find the current QA collection
    const qa = (notebookCollections || []).find(q => String(q.id) === String(qaId));

    // Use shared editable detail hook
    const editableDetail = useEditableDetail({
        entityId: qaId,
        entity: qa,
        updateFn: updateQACollection,
        onSuccessMessage,
        onErrorMessage,
        entityType: 'notebook'
    });

    // Save handler for editing via QACreator (includes document or Wolke selection)
    const handleSaveQAEdit = async (qaData) => {
        onErrorMessage('');
        onSuccessMessage('');
        try {
            await updateQACollection(qaId, {
                name: qaData.name,
                description: qaData.description,
                custom_prompt: qaData.custom_prompt,
                selectionMode: qaData.selectionMode,
                documents: qaData.selectionMode === 'documents' ? (qaData.documents || []) : [],
                wolkeShareLinks: qaData.selectionMode === 'wolke' ? (qaData.wolkeShareLinks || []) : [],
                auto_sync: qaData.selectionMode === 'wolke' ? !!qaData.auto_sync : false,
                remove_missing_on_sync: qaData.selectionMode === 'wolke' ? !!qaData.remove_missing_on_sync : false
            });
            onSuccessMessage('Notebook erfolgreich aktualisiert.');
            editableDetail.cancelEdit();
        } catch (error) {
            handleError(error, onErrorMessage);
        }
    };

    // Manual sync handler for Wolke-based collections
    const handleSyncQA = async () => {
        if (!qa || qa.selection_mode !== 'wolke') return;
        try {
            await syncQACollection(qaId);
            // Refresh collections list silently
            qaQuery?.query?.refetch && qaQuery.query.refetch();
        } catch (error) {
            handleError(error, onErrorMessage);
        }
    };

    // Wolke link details (for display)
    const [wolkeLinksDetails, setWolkeLinksDetails] = useState([]);
    const [wolkeLoading, setWolkeLoading] = useState(false);
    const [wolkeError, setWolkeError] = useState('');

    useEffect(() => {
        let cancelled = false;
        async function loadWolkeLinks() {
            if (!qa || qa.selection_mode !== 'wolke' || !Array.isArray(qa.wolke_share_links)) {
                setWolkeLinksDetails([]);
                setWolkeError('');
                return;
            }
            if (qa.wolke_share_links.length === 0) {
                setWolkeLinksDetails([]);
                setWolkeError('');
                return;
            }
            try {
                setWolkeLoading(true);
                setWolkeError('');
                const ids = qa.wolke_share_links.map(l => l.id);
                const results = await Promise.allSettled(ids.map(id => NextcloudShareManager.getShareLinkById(id)));
                if (cancelled) return;
                const details = results
                    .map(r => (r.status === 'fulfilled' ? r.value : null))
                    .filter(Boolean);
                setWolkeLinksDetails(details);
            } catch (e) {
                if (!cancelled) {
                    setWolkeError('Wolke-Links konnten nicht geladen werden');
                }
            } finally {
                if (!cancelled) setWolkeLoading(false);
            }
        }
        loadWolkeLinks();
        return () => { cancelled = true; };
    }, [qa?.id, qa?.selection_mode, Array.isArray(qa?.wolke_share_links) ? qa.wolke_share_links.map(l => l.id).join(',') : '']);

    // Handle delete QA
    const handleDeleteQA = async () => {
        if (!qa) return;

        if (!window.confirm(`Möchten Sie das Notebook "${qa.name}" wirklich löschen?`)) {
            return;
        }

        onErrorMessage('');
        onSuccessMessage('');

        try {
            await deleteQACollection(qaId);
            onSuccessMessage('Notebook erfolgreich gelöscht.');
            onBack();
        } catch (error) {
            // Error already handled by useNotebookCollections hook
        }
    };

    // Check if QA is enabled
    if (!isQAEnabled) {
        return (
            <div className="profile-content-card centered-content-card">
                <HiInformationCircle size={48} className="info-icon" />
                <h3>Feature nicht verfügbar</h3>
                <p>Notebooks sind derzeit nur für Beta-Tester verfügbar.</p>
                <ProfileActionButton
                    action="back"
                    onClick={onBack}
                />
            </div>
        );
    }

    // Notebook not found
    if (!qa) {
        return (
            <div className="profile-content-card centered-content-card">
                <HiInformationCircle size={48} className="info-icon" />
                <h3>Notebook nicht gefunden</h3>
                <p>Das ausgewählte Notebook ist nicht mehr verfügbar. Möglicherweise wurde es gelöscht.</p>
                <ProfileActionButton
                    action="back"
                    onClick={onBack}
                />
            </div>
        );
    }

    return (
        <motion.div
            className="profile-content-card"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            <div className="profile-info-panel">
                <div className="profile-header-section">
                    <div className="group-title-area">
                        <h3 className="profile-user-name medium-profile-title">{qa.name}</h3>
                    </div>
                    <div className="custom-generator-actions">
                        {qa.selection_mode === 'wolke' && (
                            <ProfileIconButton
                                action="refresh"
                                variant="ghost"
                                onClick={handleSyncQA}
                                disabled={editableDetail.isEditing || isSyncing}
                                spinOnLoading
                                loading={isSyncing}
                                title="Quellen synchronisieren"
                                ariaLabel="Notebook-Quellen synchronisieren"
                            />
                        )}
                        <ProfileIconButton
                            action="open"
                            variant="ghost"
                            onClick={() => onViewQA(qa.id)}
                            title="Notebook öffnen"
                            ariaLabel={`Notebook ${qa.name} öffnen`}
                            disabled={editableDetail.isEditing}
                        />
                        {!editableDetail.isEditing && (
                            <ProfileIconButton
                                action="edit"
                                variant="ghost"
                                onClick={editableDetail.startEdit}
                                title="Notebook bearbeiten"
                                ariaLabel={`Notebook ${qa.name} bearbeiten`}
                                disabled={isUpdatingQA || isDeletingQA}
                            />
                        )}
                        <ProfileIconButton
                            action="delete"
                            variant="ghost"
                            onClick={handleDeleteQA}
                            disabled={isDeletingQA || isUpdatingQA || editableDetail.isEditing}
                            title="Notebook löschen"
                            ariaLabel={`Notebook ${qa.name} löschen`}
                        />
                    </div>
                </div>

                <div className="generator-info-grid">
                    {qa.description && (
                        <>
                            <span className="generator-info-label">Beschreibung</span>
                            <span className="generator-info-value">{qa.description}</span>
                        </>
                    )}
                    <span className="generator-info-label">Anzahl Dokumente</span>
                    <span className="generator-info-value">{qa.document_count || 0}</span>
                    <span className="generator-info-label">Erstellt</span>
                    <span className="generator-info-value">
                        {new Date(qa.created_at).toLocaleDateString('de-DE')}
                    </span>
                    {qa.view_count && (
                        <>
                            <span className="generator-info-label">Aufrufe</span>
                            <span className="generator-info-value">{qa.view_count}</span>
                        </>
                    )}
                </div>
            </div>

            <hr className="form-divider-large" />

            <div className="generator-details-content">
                {editableDetail.isEditing ? (
                    <NotebookEditor
                        onSave={handleSaveQAEdit}
                        availableDocuments={availableDocuments}
                        editingCollection={qa}
                        loading={isUpdatingQA}
                        onCancel={editableDetail.cancelEdit}
                        allowedModes={qa.selection_mode === 'wolke' ? ['wolke'] : ['documents', 'wolke']}
                        lockSelectionMode={qa.selection_mode === 'wolke' ? 'wolke' : null}
                    />
                ) : (
                    // Display Mode
                    <>
                        {(qa.selection_mode === 'wolke' || (Array.isArray(qa.wolke_share_links) && qa.wolke_share_links.length > 0)) && (
                            <div>
                                <h4>Wolke-Ordner</h4>
                                {wolkeError && <div className="auth-error-message">{wolkeError}</div>}
                                {!wolkeLoading && wolkeLinksDetails.length === 0 && !wolkeError && (
                                    <div>Keine Wolke-Links vorhanden.</div>
                                )}
                                {wolkeLinksDetails.length > 0 && (
                                    <div className="qa-documents-list">
                                        {wolkeLinksDetails.map(link => (
                                            <div key={link.id} className="qa-document-item">
                                                <HiInformationCircle className="document-icon" />
                                                <span>
                                                    {link.label ? link.label : (link.share_link ? link.share_link.replace(/^https?:\/\//, '') : `Wolke-Link ${link.id}`)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        {qa.custom_prompt && (
                            <div>
                                <h4>Benutzerdefinierte Anweisungen</h4>
                                <div className="prompt-container">
                                    <div className="prompt-content">{qa.custom_prompt}</div>
                                </div>
                            </div>
                        )}

                        {qa.documents && qa.documents.length > 0 && (
                            <div>
                                <h4>Verwendete Dokumente</h4>
                                <div className="qa-documents-list">
                                    {qa.documents.map((doc, index) => (
                                        <div key={doc.id || index} className="qa-document-item">
                                            <HiInformationCircle className="document-icon" />
                                            <span>{doc.title || doc.name || `Dokument ${index + 1}`}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {!qa.custom_prompt && (!qa.documents || qa.documents.length === 0) && (
                            <section className="group-overview-section">
                                <p>
                                    Für dieses Notebook sind keine detaillierten Informationen verfügbar.
                                    Nutze die Bearbeitungs-Funktion, um weitere Details hinzuzufügen.
                                </p>
                            </section>
                        )}
                    </>
                )}

                {/* Placeholder for future notebook statistics */}
                {qa.view_count && qa.view_count > 0 && (
                    <div>
                        <h4>Nutzungsstatistiken</h4>
                        <div className="notebook-stats">
                            <div className="stat-item">
                                <span className="stat-label">Gesamtaufrufe</span>
                                <span className="stat-value">{qa.view_count}</span>
                            </div>
                            {qa.last_accessed && (
                                <div className="stat-item">
                                    <span className="stat-label">Zuletzt verwendet</span>
                                    <span className="stat-value">
                                        {new Date(qa.last_accessed).toLocaleDateString('de-DE')}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default NotebookDetail;
