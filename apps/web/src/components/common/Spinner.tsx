import '../../assets/styles/components/ui/spinner.css';

export type SpinnerSize = 'small' | 'medium' | 'large';

export interface SpinnerProps {
  size?: SpinnerSize;
  white?: boolean;
  withBackground?: boolean;
  className?: string;
}

const Spinner = ({
  size = 'medium',
  white = false,
  withBackground = false,
  className = ''
}: SpinnerProps) => {
  const sizeClass = `spinner-${size}`;
  const colorClass = white ? 'spinner-white' : '';
  const classes = ['spinner', sizeClass, colorClass, className].filter(Boolean).join(' ');

  if (withBackground) {
    return (
      <div className="spinner-with-background">
        <div className={classes} aria-label="Wird geladen..." role="status" />
      </div>
    );
  }

  return <div className={classes} aria-label="Wird geladen..." role="status" />;
};

export default Spinner;
