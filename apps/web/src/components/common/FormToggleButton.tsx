import { HiChevronLeft } from 'react-icons/hi';
import '../../assets/styles/components/ui/form-toggle-button.css';
// FormContext removed - no edit mode needed anymore
interface FormCollapseButtonProps {
  isFormVisible: boolean;
  toggleForm: () => void;
}

const FormCollapseButton = ({ isFormVisible, toggleForm }: FormCollapseButtonProps): JSX.Element => {
  // No edit mode check needed - always show button

  const handleClick = () => {
    toggleForm();
  };

  return (
    <button
      className="form-collapse-button"
      onClick={handleClick}
      aria-label={isFormVisible ? "Formular ausblenden" : "Formular einblenden"}
      title={isFormVisible ? "Formular ausblenden" : "Formular einblenden"}
    >
      <HiChevronLeft className={`form-collapse-icon ${!isFormVisible ? 'collapsed' : ''}`} />
    </button>
  );
};

export default FormCollapseButton;
