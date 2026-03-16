import { HiChevronLeft } from 'react-icons/hi';

import { cn } from '../../utils/cn';

import type { JSX } from 'react';

// FormContext removed - no edit mode needed anymore
interface FormCollapseButtonProps {
  isFormVisible: boolean;
  toggleForm: () => void;
}

const FormCollapseButton = ({
  isFormVisible,
  toggleForm,
}: FormCollapseButtonProps): JSX.Element => {
  // No edit mode check needed - always show button

  const handleClick = () => {
    toggleForm();
  };

  return (
    <button
      className={cn(
        'absolute left-2.5 top-1/2 -translate-y-1/2 z-[9999]',
        'size-10 rounded-full border-none p-0',
        'bg-secondary-600 hover:bg-secondary-700 text-white',
        'cursor-pointer flex items-center justify-center',
        'shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-all duration-300 ease-in-out',
        'max-md:fixed max-md:left-5 max-md:bottom-5 max-md:top-auto max-md:translate-y-0'
      )}
      onClick={handleClick}
      aria-label={isFormVisible ? 'Formular ausblenden' : 'Formular einblenden'}
      title={isFormVisible ? 'Formular ausblenden' : 'Formular einblenden'}
    >
      <HiChevronLeft
        className={cn(
          'text-2xl transition-transform duration-300 ease-in-out',
          !isFormVisible && 'rotate-180 max-md:rotate-90'
        )}
      />
    </button>
  );
};

export default FormCollapseButton;
