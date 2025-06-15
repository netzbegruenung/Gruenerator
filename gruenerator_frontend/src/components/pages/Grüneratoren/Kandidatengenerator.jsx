import React, { useState, useContext } from 'react';
import PropTypes from 'prop-types';
import BaseForm from '../../common/BaseForm';
import HelpDisplay from '../../common/HelpDisplay';
// import { useDynamicTextSize } from '../../utils/commonFunctions';
import useApiSubmit from '../../hooks/useApiSubmit';
import { FormContext } from '../../utils/FormContext';
import WelcomePage from '../../common/WelcomePage';

const STEPS = {
  WELCOME: 0,
  PERSONAL: 1,
  ABOUT: 2,
  THEMES: 3
};

const KandidatenGenerator = ({ showHeaderFooter = true }) => {
  const [currentStep, setCurrentStep] = useState(STEPS.WELCOME);
  const [formData, setFormData] = useState({
    name: '',
    position: '',
    ort: '',
    personenbeschreibung: '',
    themen: ''
  });

  const [generatedJson, setGeneratedJson] = useState('');
  // const textSize = useDynamicTextSize(generatedJson, 1.2, 0.8, [1000, 2000]);
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/claude_kandidat');
  const { setGeneratedContent } = useContext(FormContext);

  const handleSubmit = async () => {
    try {
      const content = await submitForm({
        name: formData.name,
        position: formData.position,
        ort: formData.ort,
        personenbeschreibung: formData.personenbeschreibung,
        themen: formData.themen
      });

      if (content) {
        setGeneratedJson(content);
        setGeneratedContent(content);
        setTimeout(resetSuccess, 3000);
      }
    } catch (error) {
      // Error wird bereits von useApiSubmit behandelt
    }
  };

  const handleGeneratedContentChange = (content) => {
    setGeneratedJson(content);
    setGeneratedContent(content);
  };

  const getHelpContent = () => {
    switch (currentStep) {
      case STEPS.WELCOME:
        return null;
      case STEPS.PERSONAL:
        return {
          title: "Gib hier deine persönlichen Daten ein",
          content: "Diese Angaben bilden die Grundlage deiner Kandidat*innenseite. Dein Name wird in der Überschrift verwendet, Position und Ort werden in die Beschreibung eingebaut.",
          tips: [
            "Verwende deinen vollständigen Namen, wie er auf dem Wahlzettel stehen wird",
            "Gib deine genaue Position an (z.B. 'Kandidat*in für den Stadtrat')",
            "Der Ort hilft, den lokalen Bezug herzustellen"
          ]
        };
      case STEPS.ABOUT:
        return {
          title: "Erzähle hier von dir und deiner Motivation",
          content: "Hier geht es um deine persönliche Geschichte. Die KI wird daraus einen ansprechenden Text formulieren, der deine Motivation und Ziele vermittelt.",
          tips: [
            "Erzähle von deinem beruflichen und politischen Werdegang",
            "Erkläre, was dich antreibt und motiviert",
            "Beschreibe deine Vision für deine Region"
          ]
        };
      case STEPS.THEMES:
        return {
          title: "Beschreibe hier deine politischen Schwerpunkte",
          content: "Beschreibe deine wichtigsten politischen Themen. Die KI wird daraus drei prägnante Themenschwerpunkte mit passenden Beschreibungen erstellen.",
          tips: [
            "Konzentriere dich auf 2-3 Hauptthemen",
            "Stelle den lokalen Bezug her",
            "Nenne konkrete Ziele und Lösungsvorschläge"
          ]
        };
      default:
        return null;
    }
  };

  const helpContent = getHelpContent();
  const helpDisplay = helpContent ? (
    <HelpDisplay
      content={helpContent.content}
      tips={helpContent.tips}
    />
  ) : null;

  if (currentStep === STEPS.WELCOME) {
    return (
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <WelcomePage
          title="Kandidat*innen-Grünerator"
          description="Erstelle eine professionelle Vorstellung für deine Kandidatur. Die KI hilft dir dabei, deine Informationen optimal zu präsentieren."
          steps={[
            {
              title: "Persönliche Daten",
              description: "Name, Position und Ort deiner Kandidatur als Basis für deine Vorstellung."
            },
            {
              title: "Über dich",
              description: "Dein Hintergrund und deine Motivation. Die KI erstellt daraus einen authentischen Text."
            },
            {
              title: "Deine Themen",
              description: "Deine politischen Schwerpunkte und Ziele werden zu überzeugenden Themenbereichen."
            }
          ]}
          onStart={() => setCurrentStep(STEPS.PERSONAL)}
        />
      </div>
    );
  }

  const renderCurrentStep = () => {
    switch (currentStep) {
      case STEPS.PERSONAL:
        return (
          <>
            <h3>Persönliche Informationen</h3>
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                id="name"
                className="form-control"
                value={formData.name}
                onChange={(e) => setFormData({
                  ...formData,
                  name: e.target.value
                })}
                placeholder="Dein vollständiger Name"
                aria-required="true"
              />
            </div>

            <div className="form-group">
              <label>Position</label>
              <input
                type="text"
                id="position"
                className="form-control"
                value={formData.position}
                onChange={(e) => setFormData({
                  ...formData,
                  position: e.target.value
                })}
                placeholder="z.B. Stadtrat, Kreistag, Bürgermeister*in"
                aria-required="true"
              />
            </div>

            <div className="form-group">
              <label>Ort</label>
              <input
                type="text"
                id="ort"
                className="form-control"
                value={formData.ort}
                onChange={(e) => setFormData({
                  ...formData,
                  ort: e.target.value
                })}
                placeholder="z.B. Musterstadt, Landkreis Musterkreis"
                aria-required="true"
              />
            </div>
          </>
        );
      case STEPS.ABOUT:
        return (
          <>
            <h3>Über dich</h3>
            <div className="form-group">
              <label>Deine Geschichte</label>
              <textarea
                id="about"
                className="form-control"
                value={formData.personenbeschreibung}
                onChange={(e) => setFormData({
                  ...formData,
                  personenbeschreibung: e.target.value
                })}
                placeholder="Beschreibe kurz deinen Hintergrund, deine Motivation und was dich antreibt."
                rows={6}
                aria-required="true"
              />
            </div>
          </>
        );
      case STEPS.THEMES:
        return (
          <>
            <h3>Deine Themen</h3>
            <div className="form-group">
              <label>Themenschwerpunkte</label>
              <textarea
                id="themes"
                className="form-control"
                value={formData.themen}
                onChange={(e) => setFormData({
                  ...formData,
                  themen: e.target.value
                })}
                placeholder="Beschreibe deine wichtigsten politischen Themen und Ziele."
                rows={6}
                aria-required="true"
              />
            </div>
          </>
        );
      default:
        return null;
    }
  };

  const handleNext = (e) => {
    e.preventDefault();
    if (currentStep < STEPS.THEMES) {
      setCurrentStep(currentStep + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = (e) => {
    e.preventDefault();
    if (currentStep > STEPS.PERSONAL) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
      <BaseForm
        title={helpContent ? helpContent.title : "Grünerator Kandidat*innenseite"}
        onSubmit={handleNext}
        onBack={handleBack}
        loading={loading}
        success={success}
        error={error}
        generatedContent={generatedJson || helpDisplay}
        
        onGeneratedContentChange={handleGeneratedContentChange}
        isMultiStep={true}
        showBackButton={currentStep > STEPS.PERSONAL}
        nextButtonText={currentStep === STEPS.THEMES ? 'Grünerieren' : 'Weiter'}
      >
        {renderCurrentStep()}
      </BaseForm>
    </div>
  );
};

KandidatenGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

KandidatenGenerator.defaultProps = {
  showHeaderFooter: true
};

export default KandidatenGenerator; 