import React, { useState } from 'react';
import { HiX, HiChevronLeft, HiChevronRight, HiExternalLink } from 'react-icons/hi';
import { FaCloud } from 'react-icons/fa';

// Import tutorial screenshots (reordered to match correct flow)
import step2Image from '../../../assets/images/wolke-tutorial/step1.png'; // Main Wolke interface
import step3Image from '../../../assets/images/wolke-tutorial/step2.png'; // Folder selection
import step4Image from '../../../assets/images/wolke-tutorial/step3.png'; // Share dialog
import step5Image from '../../../assets/images/wolke-tutorial/step4.png'; // Share setup
import step6Image from '../../../assets/images/wolke-tutorial/step5.png'; // Share creation
import step7Image from '../../../assets/images/wolke-tutorial/step6.png'; // Permissions
import step8Image from '../../../assets/images/wolke-tutorial/step7.png'; // Final link

/**
 * Tutorial component that guides users through creating a Nextcloud share link
 * in the Grüne Wolke (Green Cloud)
 */
const WolkeTutorial = ({ onClose }) => {
    const [currentStep, setCurrentStep] = useState(0);

    const tutorialSteps = [
        {
            title: "Schritt 1: Ordner auswählen",
            description: "Öffne die Grüne Wolke in einem neuen Tab, melde dich an und wähle einen Ordner aus, in dem du deine Grünerator-Dateien speichern möchtest. Du kannst auch einen neuen Ordner erstellen.",
            image: step2Image,
            tip: "Ein eigener Ordner wie 'Grünerator' oder 'Teilen' hilft dabei, die Dateien organisiert zu halten.",
            action: {
                text: "Wolke öffnen",
                url: "https://wolke.netzbegruenung.de/",
                external: true
            }
        },
        {
            title: "Schritt 2: Teilen-Dialog öffnen",
            description: "Klicke im Teilen-Tab auf 'Link teilen', um die Freigabe-Optionen zu öffnen.",
            image: step3Image,
            tip: "Die Teilen-Option befindet sich in der rechten Seitenleiste, wenn ein Ordner ausgewählt ist."
        },
        {
            title: "Schritt 3: Freigabe aktivieren",
            description: "Es erscheint eine Meldung, dass du die benötigten Informationen eingeben musst. Aktiviere 'Ablauf des Links aktivieren' falls gewünscht.",
            image: step4Image,
            tip: "Du kannst optional ein Ablaufdatum für den Link festlegen."
        },
        {
            title: "Schritt 4: Freigabe erstellen",
            description: "Klicke auf 'Freigabe erstellen', um den Share-Link zu generieren.",
            image: step5Image,
            tip: "Nach diesem Schritt wird automatisch ein öffentlicher Link erstellt."
        },
        {
            title: "Schritt 5: Berechtigungen konfigurieren",
            description: "Nachdem der Link erstellt wurde, klicke auf das Dropdown-Menü neben 'Link teilen' und wähle 'Kann bearbeiten'.",
            image: step6Image,
            tip: "Die Berechtigung 'Kann bearbeiten' ist zwingend erforderlich, damit der Grünerator Dateien hochladen kann."
        },
        {
            title: "Schritt 6: Link kopieren und einfügen",
            description: "Der Share-Link wurde erstellt! Kopiere den Link und füge ihn in das Grünerator-Setup-Fenster ein.",
            image: step7Image,
            tip: "Der Link sollte etwa so aussehen: https://wolke.netzbegruenung.de/s/AbCdEfGhIj"
        }
    ];

    const currentStepData = tutorialSteps[currentStep];
    const isFirstStep = currentStep === 0;
    const isLastStep = currentStep === tutorialSteps.length - 1;

    const handleNext = () => {
        if (!isLastStep) {
            setCurrentStep(currentStep + 1);
        }
    };

    const handlePrevious = () => {
        if (!isFirstStep) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleActionClick = () => {
        if (currentStepData.action && currentStepData.action.external) {
            window.open(currentStepData.action.url, '_blank');
        }
    };

    return (
        <div className="wolke-tutorial-overlay" onClick={onClose}>
            <div className="wolke-tutorial" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="wolke-tutorial-header">
                    <div className="wolke-tutorial-title">
                        <FaCloud size={20} />
                        Tutorial
                        <div className="wolke-tutorial-dots">
                            {tutorialSteps.map((_, index) => (
                                <button
                                    key={index}
                                    className={`wolke-tutorial-dot ${index === currentStep ? 'active' : ''}`}
                                    onClick={() => setCurrentStep(index)}
                                    aria-label={`Zu Schritt ${index + 1} gehen`}
                                />
                            ))}
                        </div>
                    </div>
                    <button
                        className="wolke-tutorial-close"
                        onClick={onClose}
                        aria-label="Tutorial schließen"
                    >
                        <HiX size={18} />
                    </button>
                </div>

                {/* Content with side navigation */}
                <div className="wolke-tutorial-content">
                    {/* Left navigation button */}
                    <button
                        className="wolke-tutorial-nav-side wolke-tutorial-nav-left"
                        onClick={handlePrevious}
                        disabled={isFirstStep}
                        aria-label="Zurück"
                    >
                        <HiChevronLeft size={20} />
                    </button>

                    {/* Main content */}
                    <div className="wolke-tutorial-step">
                        <h3 className="wolke-tutorial-step-title">
                            {currentStepData.title}
                        </h3>
                        
                        <p className="wolke-tutorial-description">
                            {currentStepData.description}
                        </p>

                        {currentStepData.tip && (
                            <div className="wolke-tutorial-tip">
                                <strong>Tipp:</strong> {currentStepData.tip}
                            </div>
                        )}

                        {/* Screenshot - only show if image exists */}
                        {currentStepData.image && (
                            <div className="wolke-tutorial-screenshot">
                                <img 
                                    src={currentStepData.image} 
                                    alt={currentStepData.title}
                                    loading="lazy"
                                />
                            </div>
                        )}

                        {currentStepData.action && (
                            <div className="wolke-tutorial-action">
                                <button
                                    className="wolke-tutorial-action-button"
                                    onClick={handleActionClick}
                                >
                                    {currentStepData.action.external && <HiExternalLink size={16} />}
                                    {currentStepData.action.text}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Right navigation button */}
                    <button
                        className="wolke-tutorial-nav-side wolke-tutorial-nav-right"
                        onClick={isLastStep ? onClose : handleNext}
                        aria-label={isLastStep ? 'Fertig' : 'Weiter'}
                    >
                        {isLastStep ? <HiX size={20} /> : <HiChevronRight size={20} />}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WolkeTutorial;