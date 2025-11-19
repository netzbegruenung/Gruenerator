import React from 'react';
import { GiHedgehog } from 'react-icons/gi';
import { getIcon } from '../../../../../../../config/icons';
import FeatureToggle from '../../../../../../../components/common/FeatureToggle';

const SettingsSection = ({
    isActive,
    onSuccessMessage,
    onErrorMessage,
    igelActive,
    onToggleIgelModus,
    laborActive,
    onToggleLaborModus,
    isBetaFeaturesUpdating
}) => {
    return (
        <div
            role="tabpanel"
            id="einstellungen-panel"
            aria-labelledby="einstellungen-tab"
            tabIndex={-1}
        >
            <div className="auth-form">
                <div className="form-group">
                    <div className="form-group-title">Mitgliedschaften</div>
                    <FeatureToggle
                        isActive={igelActive}
                        onToggle={onToggleIgelModus}
                        label="Igel-Modus"
                        icon={GiHedgehog}
                        description="Aktiviere den Igel-Modus, um als Mitglied der Grünen Jugend erkannt zu werden. Dies beeinflusst deine Erfahrung und verfügbare Funktionen."
                        className="igel-modus-toggle"
                        disabled={isBetaFeaturesUpdating}
                    />
                </div>

                <hr className="form-divider" />

                <div className="form-group">
                    <div className="form-group-title">Experimentell</div>
                    <FeatureToggle
                        isActive={laborActive}
                        onToggle={onToggleLaborModus}
                        label="Labor-Modus"
                        icon={getIcon('actions', 'labor')}
                        description="Aktiviere den Labor-Modus für Zugriff auf experimentelle Features und Beta-Funktionen. Diese Features befinden sich noch in Entwicklung."
                        className="labor-modus-toggle"
                        disabled={isBetaFeaturesUpdating}
                    />
                </div>
            </div>
        </div>
    );
};

export default SettingsSection;
