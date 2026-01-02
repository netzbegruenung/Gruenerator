import '../styles/ContactFormSection.css'; // Import the CSS file

// Accept contactData and className as props
interface ContactFormSectionProps {
  contactData?: {
    showForm?: boolean;
    title?: string;
    buttonText?: string
  };
  // Add className to propTypes
  className?: string;
}

const ContactFormSection = ({ contactData, className }: ContactFormSectionProps): JSX.Element | null => {
  // Return null if no contactData or showForm is false
  if (!contactData || !contactData.showForm) {
    console.log('ContactFormSection: No contactData provided or showForm is false.');
    return null;
  }

  console.log('ContactFormSection: Rendering with contactData:', contactData);

  return (
    // Combine the default 'contact-form-section' with the passed className
    <div className={`contact-form-section ${className || ''}`}>
      <h2>{contactData.title || 'Kontakt'}</h2>
      <form className="contact-form">
        {/* Placeholder for form fields - Implement actual form later */}
        <div className="form-group">
          <label htmlFor="contact-name">Name:</label>
          <input type="text" id="contact-name" name="name" placeholder="Dein Name" />
        </div>
        <div className="form-group">
          <label htmlFor="contact-email">E-Mail:</label>
          <input type="email" id="contact-email" name="email" placeholder="Deine E-Mail Adresse" />
        </div>
        <div className="form-group">
          <label htmlFor="contact-message">Nachricht:</label>
          <textarea id="contact-message" name="message" placeholder="Deine Nachricht"></textarea>
        </div>
        <button type="submit" className="button button-primary">
          {contactData.buttonText || 'Senden'}
        </button>
      </form>
    </div>
  );
};

export default ContactFormSection;
