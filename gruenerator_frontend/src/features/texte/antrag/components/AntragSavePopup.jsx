// src/features/texte/antrag/components/AntragSavePopup.jsx
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useSupabaseAuth } from '../../../../context/SupabaseAuthContext'; // Import the hook
import SubmitButton from '../../../../components/common/SubmitButton'; // Adjust path if needed
import TextInput from '../../../../components/common/Form/Input/TextInput'; // CORRECTED PATH
import SelectInput from '../../../../components/common/Form/Input/SelectInput'; // CORRECTED PATH
import CheckboxInput from '../../../../components/common/Form/Input/CheckboxInput'; // Adjust path as needed
import TextAreaInput from '../../../../components/common/Form/Input/TextAreaInput'; // Adjust path as needed
import { generateAntragDescription } from '../antragDescriptionUtils'; // Import the description generator

const AntragSavePopup = ({ isOpen, onClose, onConfirm, initialData = {}, isSaving, antragstext = '' }) => {
  const { user } = useSupabaseAuth(); // Get user from context
  const [antragsteller, setAntragsteller] = useState('');
  const [status, setStatus] = useState('draft'); // Default to a likely valid backend enum value
  const [description, setDescription] = useState('');
  const [kontaktEmail, setKontaktEmail] = useState('');
  const [kontaktErlaubt, setKontaktErlaubt] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false); // State for the private flag
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false); // State for generation in progress
  const [title, setTitle] = useState(''); // State for the title input

  // Ref to track if the modal was just opened
  const justOpened = React.useRef(false);

  useEffect(() => {
    // Check if the modal is being opened
    if (isOpen && !justOpened.current) {
        // Reset state only when initially opening
        console.log("Resetting form state on popup open");
        setAntragsteller(initialData.antragsteller || 'Fraktion Bündnis 90/Die Grünen');
        setStatus(initialData.status || 'draft');
        setDescription(initialData.description || '');
        setTitle(initialData.title || '');
        // Use initialData email first, fallback to logged-in user's email, then empty string
        setKontaktEmail(initialData.kontakt_email || user?.email || '');
        // Use the most recent initialData for kontakt_erlaubt on open
        const initialKontaktErlaubt = initialData.hasOwnProperty('kontakt_erlaubt') ? initialData.kontakt_erlaubt : false;
        setKontaktErlaubt(initialKontaktErlaubt);
        // Reset is_private based on initialData or default to false
        const initialIsPrivate = initialData.hasOwnProperty('is_private') ? initialData.is_private : false;
        setIsPrivate(initialIsPrivate);
        justOpened.current = true; // Mark as opened
    } else if (!isOpen) {
        // Reset the ref when the modal closes
        justOpened.current = false;
    }
     // Dependency array includes isOpen and user now.
     // If the user logs in/out while the modal might potentially be open (unlikely scenario),
     // the email might update if initialData didn't provide one.
     // Also keep initialData in case it's *meant* to update the form while open.
  }, [isOpen, user, initialData]);

  // Close modal if Escape key is pressed
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    } else {
      document.removeEventListener('keydown', handleKeyDown);
    }

    // Cleanup listener on component unmount or when modal closes
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);


  const handleConfirmClick = () => {
    // Pass collected data according to the plan
    onConfirm({
      antragsteller,
      status,
      description,
      kontakt_email: kontaktEmail,
      kontakt_erlaubt: kontaktErlaubt,
      is_private: isPrivate, // Include is_private flag
    });
  };

  const handleOverlayClick = () => {
    onClose();
  };

  const handleContentClick = (e) => {
    // Prevent closing when clicking inside the content area
    e.stopPropagation();
  };

  // Function to handle description generation
  const handleGenerateDescription = async () => {
    // Validate title is available
    if (!title || title.trim() === '') {
      alert('Bitte gib einen Titel ein, um eine Beschreibung zu generieren.');
      return;
    }

    // Check if we have antragstext content
    if (!antragstext || antragstext.trim() === '') {
      alert('Der Antragstext ist leer. Eine Beschreibung kann nicht generiert werden.');
      return;
    }

    try {
      setIsGeneratingDescription(true);
      
      // Call the description generator service
      const generatedDescription = await generateAntragDescription({
        title,
        antragstext
      });
      
      // Update the description field with the generated text
      setDescription(generatedDescription);
      
    } catch (error) {
      console.error('Fehler bei der Beschreibungsgenerierung:', error);
      alert(`Fehler bei der Beschreibungsgenerierung: ${error.message}`);
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  // Valid status options based on the provided Supabase enum values
  const statusOptions = [
    { value: 'draft', label: 'Entwurf' },
    { value: 'submitted', label: 'Eingereicht' },
    { value: 'in_progress', label: 'In Bearbeitung' }, // Added based on query result
    { value: 'approved', label: 'Beschlossen' }, // Matched query result
    { value: 'rejected', label: 'Abgelehnt' }, // Matched query result
  ];

  // Render nothing if the modal is not open
  if (!isOpen) {
    return null;
  }

  // Render custom modal structure
  return (
    <div
        className="antrag-save-popup-overlay" // Use class for overlay styling
        onClick={handleOverlayClick} // Close on overlay click
        role="dialog" // Accessibility role
        aria-modal="true" // Accessibility attribute
        aria-labelledby="antrag-save-popup-title" // Link title for screen readers
    >
      <div
        className="antrag-save-popup-content" // Use class for content styling
        onClick={handleContentClick} // Prevent close on content click
      >
        {/* Added an explicit close button for better UX */}
        <button
           onClick={onClose}
           style={closeButtonStyle} // Basic inline style for close button
           aria-label="Schließen" // Accessibility label
           className="close-button" // Added class for potential CSS targeting
        >
           &times; {/* HTML entity for 'X' */ }
        </button>

        <h2 id="antrag-save-popup-title">Antragsdetails vervollständigen</h2>
        <p>Bitte fülle die folgenden Felder aus oder bestätige die Vorauswahl, um den Antrag zu speichern.</p>

        {/* Form fields structure */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-medium)' }}>
          <div className="form-field">
            <label htmlFor="antragsteller">Antragsteller:</label>
            <TextInput
              id="antragsteller"
              value={antragsteller}
              onChange={(e) => setAntragsteller(e.target.value)}
              placeholder="z.B. Fraktion Bündnis 90/Die Grünen"
            />
          </div>

          <div className="form-field">
            <label htmlFor="title">Titel: *</label>
            <TextInput
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titel des Antrags"
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="status">Status: *</label> {/* Mark required field */}
            <SelectInput
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={statusOptions}
              required // HTML5 validation attribute
            />
            {/* Add small text for clarification */}
            <small style={{display: 'block', marginTop: 'var(--spacing-xxsmall)', color: 'var(--font-color-subtle)'}}>
              Wähle den aktuellen Bearbeitungsstand des Antrags.
            </small>
          </div>

          <div className="form-field">
            <label htmlFor="description">Beschreibung (optional):</label>
            <TextAreaInput // Use TextArea component
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Kurze Zusammenfassung des Antragsinhalts (optional)"
              rows={3} // Suggest number of visible rows
            />
            {/* Link für AI description generation */}
            <div className="ai-description-link-container">
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handleGenerateDescription();
                }}
                className="ai-description-link"
                aria-disabled={isGeneratingDescription || isSaving}
              >
                {isGeneratingDescription ? 'Generiere...' : 'KI-Beschreibung generieren'}
              </a>
            </div>
          </div>

          <div className="form-field">
             <label htmlFor="kontakt_email">Kontakt E-Mail (optional):</label>
             <TextInput
               id="kontakt_email"
               type="email" // Use email type for basic validation
               value={kontaktEmail}
               onChange={(e) => setKontaktEmail(e.target.value)}
               placeholder="name@beispiel.de (optional)"
             />
             {/* Optional: Add help text if user's email was prefilled */}
             {user?.email && !initialData.kontakt_email && (
                 <small style={{display: 'block', marginTop: 'var(--spacing-xxsmall)', color: 'var(--font-color-subtle)'}}>
                     Deine E-Mail wurde automatisch eingetragen.
                 </small>
             )}
          </div>

          <div className="form-field">
            {/* Use CheckboxInput component */}
            <CheckboxInput
              id="kontakt_erlaubt"
              checked={kontaktErlaubt}
              onChange={(e) => setKontaktErlaubt(e.target.checked)}
              label="Kontaktaufnahme bei Rückfragen erlaubt? (optional)" // Pass label directly if component supports it
            />
            {/* If CheckboxInput doesn't support label prop, use standard label:
             <label htmlFor="kontakt_erlaubt" style={{ display: 'inline-block', marginLeft: 'var(--spacing-xsmall)'}}>
                 Kontaktaufnahme bei Rückfragen erlaubt? (optional)
             </label>
            */}
          </div>

          {/* New Checkbox for 'is_private' */}
          <div className="form-field">
            <CheckboxInput
              id="is_private"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              label="Antrag als privat markieren?"
            />
            <small style={{display: 'block', marginTop: 'var(--spacing-xxsmall)', color: 'var(--font-color-subtle)'}}>
              Private Anträge sind nur für dich sichtbar. Andere sehen diesen Antrag nicht.
            </small>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="modal-actions">
          <button type="button" onClick={onClose} className="button secondary" disabled={isSaving || isGeneratingDescription}>
            Abbrechen
          </button>
          <SubmitButton
              onClick={handleConfirmClick}
              text="Speichern"
              loading={isSaving}
              disabled={isSaving || isGeneratingDescription || !status} // Also disable if status is somehow empty
          />
        </div>
      </div>
    </div>
  );
};

// Basic styles for the close button (can be moved to CSS file)
const closeButtonStyle = {
  position: 'absolute',
  top: 'var(--spacing-small)', // Adjusted spacing
  right: 'var(--spacing-small)', // Adjusted spacing
  background: 'transparent',
  border: 'none',
  fontSize: '1.8rem',
  lineHeight: '1',
  cursor: 'pointer',
  color: 'var(--font-color-subtle)', // Use subtle color
  padding: '0',
  zIndex: '1', // Ensure it's above other content if needed
};


AntragSavePopup.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  initialData: PropTypes.shape({
    antragsteller: PropTypes.string,
    status: PropTypes.string, // Needs to be validated against backend enum
    description: PropTypes.string,
    kontakt_email: PropTypes.string,
    kontakt_erlaubt: PropTypes.bool,
    is_private: PropTypes.bool, // Added prop type
    title: PropTypes.string, // Added for title initialization
  }),
  isSaving: PropTypes.bool,
  antragstext: PropTypes.string, // Added antragstext prop for description generation
};

export default AntragSavePopup;