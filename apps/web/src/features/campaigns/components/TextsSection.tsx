import TextCard from './TextCard';

interface TextsSectionProps {
  texts: unknown[];
  className?: string;
}

const TextsSection = ({ texts, className }: TextsSectionProps): JSX.Element => {
  return (
    <section className={`dashboard-section ${className || ''}`}>
      <h2>Texte</h2>
      {texts.length === 0 ? (
        <div className="no-results">Keine Texte gefunden</div>
      ) : (
        <div className="texts-grid">
          {texts.map(text => (
            <TextCard key={text.id} text={text} />
          ))}
        </div>
      )}
    </section>
  );
};

export default TextsSection;
