import './ProgressBar.css';

const ProgressBar = ({
  progress,
  showPercentage = false,
  className = '',
  fixed = false,
  ariaLabel = 'Progress'
}) => {
  const containerClass = `progress-bar-container ${className} ${fixed ? 'progress-bar-fixed' : ''}`;

  return (
    <div className={containerClass}>
      <div className="progress-bar" role="progressbar" aria-label={ariaLabel} aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100">
        <div
          className="progress-bar-fill"
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </div>
      {showPercentage && (
        <div className="progress-bar-text">
          {Math.round(progress)}%
        </div>
      )}
    </div>
  );
};

export default ProgressBar;
