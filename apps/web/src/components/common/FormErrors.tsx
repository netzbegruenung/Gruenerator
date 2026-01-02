export interface FormErrorsProps {
  errors: Record<string, string>;
}

const FormErrors = ({ errors }: FormErrorsProps) => {
  if (Object.keys(errors).length === 0) return null;

  return (
    <div className="form-errors" role="alert" aria-live="assertive">
      {Object.entries(errors).map(([field, message]) => (
        <p key={field} className="error-message">
          {message}
        </p>
      ))}
    </div>
  );
};

export default FormErrors;
