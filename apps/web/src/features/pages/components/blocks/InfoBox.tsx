interface InfoBoxProps {
  title?: string;
  children?: React.ReactNode;
  items?: string[];
  variant?: 'default' | 'success' | 'warning' | 'info';
  className?: string;
}

const InfoBox = ({
  title,
  children,
  items = [],
  variant = 'default',
  className = '',
}: InfoBoxProps) => {
  const variantClass = variant !== 'default' ? `info-box--${variant}` : '';

  return (
    <div className={`info-box ${variantClass} ${className}`}>
      {title && <h3 className="info-box__title">{title}</h3>}
      <div className="info-box__content">
        {children}
        {items.length > 0 && (
          <ul className="info-box__list">
            {items.map((item, index) => (
              <li key={index} className="info-box__list-item">
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default InfoBox;
