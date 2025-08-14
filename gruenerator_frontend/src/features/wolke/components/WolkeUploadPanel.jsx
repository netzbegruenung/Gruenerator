import React, { useState } from 'react';
import { HiUpload, HiDocumentText, HiCheck, HiX } from 'react-icons/hi';
import ProfileCard from '../../../components/common/ProfileCard';
import EmptyState from '../../../components/common/EmptyState';

const WolkeUploadPanel = ({
    shareLinks = [],
    loading = false,
    onUploadFile,
    onSuccessMessage,
    onErrorMessage
}) => {
    const [selectedShareLinkId, setSelectedShareLinkId] = useState('');
    const [fileName, setFileName] = useState('hello-world.txt');
    const [fileContent, setFileContent] = useState('Hallo Welt!\n\nDies ist ein Test-Dokument aus dem Grünerator.\nErstellt am: ' + new Date().toLocaleString('de-DE'));
    const [isUploading, setIsUploading] = useState(false);
    const [uploadHistory, setUploadHistory] = useState([]);

    const activeShareLinks = shareLinks.filter(link => link.is_active);

    const handleUpload = async (e) => {
        e.preventDefault();
        
        if (!selectedShareLinkId) {
            onErrorMessage('Bitte wähle einen Share-Link aus.');
            return;
        }

        if (!fileName.trim()) {
            onErrorMessage('Dateiname ist erforderlich.');
            return;
        }

        if (!fileContent.trim()) {
            onErrorMessage('Dateiinhalt ist erforderlich.');
            return;
        }

        setIsUploading(true);
        
        try {
            const result = await onUploadFile(selectedShareLinkId, fileContent, fileName);
            
            if (result.success) {
                const shareLink = shareLinks.find(link => link.id === selectedShareLinkId);
                const uploadEntry = {
                    id: Date.now(),
                    fileName,
                    shareLink: shareLink?.label || shareLink?.share_link,
                    timestamp: new Date(),
                    success: true
                };
                
                setUploadHistory(prev => [uploadEntry, ...prev.slice(0, 9)]); // Keep last 10
                onSuccessMessage(`Datei "${fileName}" wurde erfolgreich hochgeladen.`);
                
                // Reset form for next upload
                setFileName(`hello-world-${Date.now()}.txt`);
            } else {
                onErrorMessage('Upload fehlgeschlagen: ' + result.message);
            }
        } catch (error) {
            const uploadEntry = {
                id: Date.now(),
                fileName,
                shareLink: shareLinks.find(link => link.id === selectedShareLinkId)?.label || 'Unbekannt',
                timestamp: new Date(),
                success: false,
                error: error.message
            };
            
            setUploadHistory(prev => [uploadEntry, ...prev.slice(0, 9)]);
            onErrorMessage('Fehler beim Upload: ' + error.message);
        } finally {
            setIsUploading(false);
        }
    };

    const generateQuickContent = (type) => {
        const timestamp = new Date().toLocaleString('de-DE');
        
        switch (type) {
            case 'hello':
                return `Hallo Welt!\n\nDies ist ein Test-Dokument aus dem Grünerator.\nErstellt am: ${timestamp}`;
            case 'markdown':
                return `# Grünerator Test-Dokument\n\n## Überschrift\n\nDies ist ein **Markdown-Test-Dokument** aus dem *Grünerator*.\n\n- Punkt 1\n- Punkt 2\n- Punkt 3\n\n---\nErstellt am: ${timestamp}`;
            case 'json':
                return JSON.stringify({
                    title: "Grünerator Test",
                    description: "Test-JSON aus dem Grünerator",
                    created_at: new Date().toISOString(),
                    data: {
                        test: true,
                        version: "1.0"
                    }
                }, null, 2);
            default:
                return fileContent;
        }
    };

    if (loading) {
        return (
            <ProfileCard title="Upload wird geladen...">
                <div className="wolke-loading-state">
                    <p>Lade Upload-Bereich...</p>
                </div>
            </ProfileCard>
        );
    }

    if (activeShareLinks.length === 0) {
        return (
            <ProfileCard title="Upload zu Nextcloud">
                <EmptyState
                    icon={HiUpload}
                    title="Keine aktiven Share-Links"
                    description="Du benötigst mindestens einen aktiven Share-Link, um Dateien hochzuladen."
                >
                    <p style={{ marginTop: 'var(--spacing-medium)', textAlign: 'center' }}>
                        Gehe zurück zur Übersicht und füge einen Share-Link hinzu.
                    </p>
                </EmptyState>
            </ProfileCard>
        );
    }

    return (
        <ProfileCard title="Upload zu Nextcloud">
            <div className="wolke-upload-container">
                <form onSubmit={handleUpload} className="wolke-upload-form">
                    <div className="wolke-form-group">
                        <label htmlFor="shareLink">Ziel-Share-Link *</label>
                        <select
                            id="shareLink"
                            value={selectedShareLinkId}
                            onChange={(e) => setSelectedShareLinkId(e.target.value)}
                            required
                            disabled={isUploading}
                        >
                            <option value="">Bitte wählen...</option>
                            {activeShareLinks.map(link => (
                                <option key={link.id} value={link.id}>
                                    {link.label || new URL(link.share_link).hostname}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="wolke-form-group">
                        <label htmlFor="fileName">Dateiname *</label>
                        <input
                            type="text"
                            id="fileName"
                            value={fileName}
                            onChange={(e) => setFileName(e.target.value)}
                            placeholder="z.B. test-dokument.txt"
                            required
                            disabled={isUploading}
                        />
                    </div>

                    <div className="wolke-form-group">
                        <label htmlFor="fileContent">Dateiinhalt *</label>
                        <div className="wolke-content-controls">
                            <div className="wolke-quick-content-buttons">
                                <button
                                    type="button"
                                    className="btn-sm btn-secondary"
                                    onClick={() => {
                                        setFileContent(generateQuickContent('hello'));
                                        setFileName('hello-world.txt');
                                    }}
                                    disabled={isUploading}
                                >
                                    Hello World
                                </button>
                                <button
                                    type="button"
                                    className="btn-sm btn-secondary"
                                    onClick={() => {
                                        setFileContent(generateQuickContent('markdown'));
                                        setFileName('test-dokument.md');
                                    }}
                                    disabled={isUploading}
                                >
                                    Markdown
                                </button>
                                <button
                                    type="button"
                                    className="btn-sm btn-secondary"
                                    onClick={() => {
                                        setFileContent(generateQuickContent('json'));
                                        setFileName('test-data.json');
                                    }}
                                    disabled={isUploading}
                                >
                                    JSON
                                </button>
                            </div>
                        </div>
                        <textarea
                            id="fileContent"
                            value={fileContent}
                            onChange={(e) => setFileContent(e.target.value)}
                            placeholder="Hier den Inhalt der Datei eingeben..."
                            rows={10}
                            required
                            disabled={isUploading}
                        />
                        <small className="wolke-form-hint">
                            {fileContent.length} Zeichen
                        </small>
                    </div>

                    <div className="wolke-form-actions">
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={isUploading || !selectedShareLinkId || !fileName.trim() || !fileContent.trim()}
                        >
                            <HiUpload className={isUploading ? 'spinning' : ''} />
                            {isUploading ? 'Wird hochgeladen...' : 'Datei hochladen'}
                        </button>
                    </div>
                </form>

                {uploadHistory.length > 0 && (
                    <div className="wolke-upload-history">
                        <h4>Upload-Verlauf</h4>
                        <div className="wolke-history-list">
                            {uploadHistory.map(entry => (
                                <div key={entry.id} className="wolke-history-item">
                                    <div className="wolke-history-status">
                                        {entry.success ? (
                                            <HiCheck className="icon success" />
                                        ) : (
                                            <HiX className="icon error" />
                                        )}
                                    </div>
                                    <div className="wolke-history-info">
                                        <div className="wolke-history-filename">
                                            <HiDocumentText className="icon" />
                                            {entry.fileName}
                                        </div>
                                        <div className="wolke-history-details">
                                            <span>zu {entry.shareLink}</span>
                                            <span>{entry.timestamp.toLocaleString('de-DE')}</span>
                                        </div>
                                        {!entry.success && entry.error && (
                                            <div className="wolke-history-error">
                                                {entry.error}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </ProfileCard>
    );
};

export default WolkeUploadPanel;