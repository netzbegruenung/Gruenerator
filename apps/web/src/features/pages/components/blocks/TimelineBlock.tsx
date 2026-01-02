
const TimelineBlock = ({ items = [], className = '' }) => {
    if (!items || items.length === 0) {
        return null;
    }

    return (
        <div className={`timeline-block ${className}`}>
            {items.map((item, index) => (
                <div key={index} className="timeline-block__item">
                    {item.date && (
                        <div className="timeline-block__date">
                            {item.date}
                        </div>
                    )}
                    {item.title && (
                        <h4 className="timeline-block__title">
                            {item.title}
                        </h4>
                    )}
                    {item.content && (
                        <div className="timeline-block__content">
                            {typeof item.content === 'string' ? (
                                <p>{item.content}</p>
                            ) : (
                                item.content
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default TimelineBlock;
