import React, { useState, useCallback, memo } from 'react';
import { HiPhotograph, HiExternalLink } from 'react-icons/hi';
import AssetPackageCard from './AssetPackageCard';
import CanvaButton from './CanvaButton';

// Store
import { useCanvaConnection } from '../../../../stores/canvaStore';

// Utils
import * as canvaUtils from '../../../../components/utils/canvaUtils';

interface CanvaAssetsPanelProps {
    isAuthenticated?: boolean;
    onSuccessMessage?: (message: string) => void;
    onErrorMessage?: (message: string) => void;
    onNavigateToOverview?: () => void;
    onCanvaLogin?: () => void;
}

/**
 * Canva Assets Panel Component - Optimized with store
 * Displays available asset packages and handles import functionality
 * Uses canvaStore for better performance
 */
const CanvaAssetsPanel = memo(({
    isAuthenticated = true,
    onSuccessMessage,
    onErrorMessage,
    onNavigateToOverview,
    onCanvaLogin
}: CanvaAssetsPanelProps) => {

    // Store-based state (memoized)
    const { connected: canvaConnected, loading: canvaLoading } = useCanvaConnection();
    const [importingPackage, setImportingPackage] = useState<string | null>(null);
    const [importProgress, setImportProgress] = useState('');
    const [importedPackages, setImportedPackages] = useState(canvaUtils.getImportedPackages());

    // Handle package import
    const handleImportPackage = useCallback(async (packageId: string) => {
        if (importingPackage) return; // Prevent multiple imports

        setImportingPackage(packageId);
        setImportProgress('Starte Import...');

        try {
            const result = await canvaUtils.importAssetPackage(
                packageId,
                (progressMsg: string) => setImportProgress(progressMsg),
                (importResult: { packageName: string; importedAssets: number }) => {
                    canvaUtils.markPackageAsImported(packageId);
                    setImportedPackages(canvaUtils.getImportedPackages());
                    onSuccessMessage?.(`Asset Package "${importResult.packageName}" wurde erfolgreich importiert! ${importResult.importedAssets} Assets hinzugefügt.`);
                },
                onErrorMessage
            );
        } catch (error) {
            console.error('[CanvaAssetsPanel] Import failed:', error);
        } finally {
            setImportingPackage(null);
            setImportProgress('');
        }
    }, [importingPackage, onSuccessMessage, onErrorMessage]);

    if (!canvaConnected) {
        return (
            <div className="profile-card">
                <div className="profile-card-header">
                    <h3>Asset-Pakete</h3>
                </div>
                <div className="profile-card-content">
                    <div className="empty-state">
                        <HiPhotograph size={48} style={{ color: 'var(--font-color-muted)' }} />
                        <p>Verbinde dein Canva-Konto, um Asset-Pakete zu verwenden.</p>
                        <CanvaButton
                            onClick={onCanvaLogin}
                            loading={canvaLoading}
                            size="medium"
                            ariaLabel="Mit Canva verbinden für Asset-Pakete"
                        >
                            Mit Canva verbinden
                        </CanvaButton>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="profile-card">
            <div className="profile-card-header">
                <h3>Asset-Pakete</h3>
                <p style={{
                    fontSize: '0.9rem',
                    color: 'var(--font-color-muted)',
                    marginTop: 'var(--spacing-small)'
                }}>
                    Wähle vorgefertigte Asset-Sammlungen aus, um sie zu deinem Canva-Konto hinzuzufügen.
                </p>
            </div>
            <div className="profile-card-content">
                {importingPackage && (
                    <div className="import-progress" style={{
                        marginBottom: 'var(--spacing-large)',
                        padding: 'var(--spacing-medium)',
                        backgroundColor: 'var(--background-color-secondary)',
                        borderRadius: 'var(--border-radius)'
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--spacing-small)'
                        }}>
                            <div className="spinner" style={{ width: '20px', height: '20px' }}></div>
                            <span>Importiere Asset-Paket...</span>
                        </div>
                        {importProgress && (
                            <div style={{
                                marginTop: 'var(--spacing-small)',
                                fontSize: '0.9rem',
                                color: 'var(--font-color-muted)'
                            }}>
                                {importProgress}
                            </div>
                        )}
                    </div>
                )}

                <div className="asset-packages-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: 'var(--spacing-large)'
                }}>
                    {canvaUtils.ASSET_PACKAGES.map(pkg => (
                        <AssetPackageCard
                            key={pkg.id}
                            package={pkg}
                            isImported={importedPackages.includes(pkg.id)}
                            isImporting={importingPackage === pkg.id}
                            onImport={() => handleImportPackage(pkg.id)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
});

// Add display name for debugging
CanvaAssetsPanel.displayName = 'CanvaAssetsPanel';

export default CanvaAssetsPanel;
