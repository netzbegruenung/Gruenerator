import { type Dispatch, type SetStateAction, useState } from 'react';

interface UseFormStateReturn<T extends Record<string, unknown>> {
  formData: T;
  setFormData: Dispatch<SetStateAction<T>>;
  loading: boolean;
  setLoading: Dispatch<SetStateAction<boolean>>;
  success: boolean;
  setSuccess: Dispatch<SetStateAction<boolean>>;
  error: string;
  setError: Dispatch<SetStateAction<string>>;
  formErrors: Record<string, string>;
  setFormErrors: Dispatch<SetStateAction<Record<string, string>>>;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
}

export const useFormState = <T extends Record<string, unknown>>(
  initialState: T
): UseFormStateReturn<T> => {
  const [formData, setFormData] = useState<T>(initialState);
  const [loading, setLoading] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ): void => {
    const { name, value } = e.target;
    setFormData((prevState) => ({
      ...prevState,
      [name]: value,
    }));
  };

  return {
    formData,
    setFormData,
    loading,
    setLoading,
    success,
    setSuccess,
    error,
    setError,
    formErrors,
    setFormErrors,
    handleChange,
  };
};
