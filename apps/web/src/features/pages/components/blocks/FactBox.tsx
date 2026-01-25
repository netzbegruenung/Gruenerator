interface Fact {
  number: string;
  label: string;
}

interface FactBoxProps {
  facts?: Fact[];
  className?: string;
}

const FactBox = ({ facts = [], className = '' }: FactBoxProps) => {
  if (!facts || facts.length === 0) {
    return null;
  }

  return (
    <div className={`fact-box ${className}`}>
      <div className="fact-box__grid">
        {facts.map((fact, index) => (
          <div key={index} className="fact-box__item">
            <div className="fact-box__number">{fact.number}</div>
            <div className="fact-box__label">{fact.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FactBox;
