import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';

// Hooks
import { useOptimizedAuth } from '../../../../../../hooks/useAuth';
import { useBetaFeatures } from '../../../../../../hooks/useBetaFeatures';

// Lazy-loaded components for performance
const ContentManagementView = lazy(() => import('./ContentManagementView'));

// Loading fallback component
const ContentManagementLoadingFallback = () => (
    <div className="profile-tab-loading">
    </div>
);

const ContentManagementTabContainer = ({
    isActive,
    onSuccessMessage,
    onErrorMessage,
    initialTab = 'inhalte',
    canvaSubsection = 'overview',
    onTabChange
}) => {
    const { user, isAuthenticated } = useOptimizedAuth();
    const { canAccessBetaFeature, getBetaFeatureState, updateUserBetaFeatures, isUpdating: isBetaFeaturesUpdating } = useBetaFeatures();

    // Beta feature toggle handlers
    const handleIgelModusToggle = async (enabled) => {
        try {
            await updateUserBetaFeatures('igel_modus', enabled);
            onSuccessMessage(enabled ? 'Igel-Modus aktiviert! Du bist jetzt Mitglied der Grünen Jugend.' : 'Igel-Modus deaktiviert.');
        } catch (error) {
            onErrorMessage(error.message || 'Fehler beim Aktualisieren des Igel-Modus.');
        }
    };

    const handleLaborToggle = async (enabled) => {
        try {
            await updateUserBetaFeatures('labor', enabled);
            onSuccessMessage(enabled ? 'Labor-Modus aktiviert! Experimentelle Features sind jetzt verfügbar.' : 'Labor-Modus deaktiviert.');
        } catch (error) {
            onErrorMessage(error.message || 'Fehler beim Aktualisieren des Labor-Modus.');
        }
    };

    // Early return for non-authenticated users
    if (!user) {
        return (
            <div className="profile-tab-loading">
            </div>
        );
    }

    return (
        <Suspense fallback={<ContentManagementLoadingFallback />}>
            <ContentManagementView
                isActive={isActive}
                onSuccessMessage={onSuccessMessage}
                onErrorMessage={onErrorMessage}
                initialTab={initialTab}
                canvaSubsection={canvaSubsection}
                onTabChange={onTabChange}
                igelActive={getBetaFeatureState('igel_modus')}
                onToggleIgelModus={handleIgelModusToggle}
                laborActive={getBetaFeatureState('labor')}
                onToggleLaborModus={handleLaborToggle}
                isBetaFeaturesUpdating={isBetaFeaturesUpdating}
            />
        </Suspense>
    );
};

export default ContentManagementTabContainer;