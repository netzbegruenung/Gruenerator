import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { useForm, Control } from 'react-hook-form';
import { FormInput, FormTextarea } from '../../../components/common/Form/Input';
import CreatableSelect from 'react-select/creatable';
import FormFieldWrapper from '../../../components/common/Form/Input/FormFieldWrapper';

interface BuergeranfragenFormProps {
  tabIndex?: {
    formType?: number;
    hauptfeld?: number;
    [key: string]: number | undefined;
  };
}

interface BuergeranfragenFormRef {
  getFormData: () => Record<string, unknown>;
  resetForm: (data?: Record<string, unknown>) => void;
}

interface SelectOption {
  value: string;
  label: string;
}

const BuergeranfragenForm = forwardRef<BuergeranfragenFormRef, BuergeranfragenFormProps>(({ tabIndex = {} }, ref) => {
  const [selectedAntwortart, setSelectedAntwortart] = useState<SelectOption[]>([]);
  const {
    control,
    getValues,
    setValue,
    reset,
    trigger
  } = useForm({
    defaultValues: {
      gremium: '',
      anliegen: '',
      antwortart: '',
      kontext: ''
    }
  });

  useImperativeHandle(ref, () => ({
    getFormData: () => {
      const data = getValues();
      // Join multiple antwortart values with commas
      data.antwortart = selectedAntwortart.map(option => option.value || option.label).join(', ');
      return data;
    },
    resetForm: (data?: Record<string, unknown>) => {
      reset(data);
      // Handle reset with existing antwortart string - convert back to array
      if (data?.antwortart && typeof data.antwortart === 'string') {
        const antwortartValues = data.antwortart.split(', ').map((value: string) => ({
          value: value.trim(),
          label: value.trim()
        }));
        setSelectedAntwortart(antwortartValues);
      } else {
        setSelectedAntwortart([]);
      }
    }
  }));

  const antwortartOptions = [
    { value: 'buergerinnenfreundlich', label: 'Bürger*innenfreundlich und verständlich' },
    { value: 'ausfuehrlich_begruendung', label: 'Ausführlich mit Begründung' },
    { value: 'kurz_sachlich', label: 'Kurz und sachlich' },
    { value: 'empathisch_persoenlich', label: 'Empathisch und persönlich' },
    { value: 'loesungsorientiert', label: 'Lösungsorientiert' }
  ];

  const handleAntwortartChange = (newValues: readonly SelectOption[] | null) => {
    const selectedValues = newValues ? [...newValues] : [];
    setSelectedAntwortart(selectedValues);
    const antwortartValue = selectedValues.map(option => option.value || option.label).join(', ');
    setValue('antwortart', antwortartValue);
    trigger('antwortart'); // Trigger validation
  };

  return (
    <>
      <FormInput
        name="gremium"
        control={control as unknown as Control<Record<string, unknown>>}
        label="Gremium/Zuständigkeit"
        placeholder="z.B. Stadtrat, Kreistag, Ortsvorstand, Arbeitskreis Umwelt..."
        rules={{ required: 'Gremium ist ein Pflichtfeld' }}
        tabIndex={tabIndex.formType || 10}
      />

      <FormTextarea
        name="anliegen"
        control={control as unknown as Control<Record<string, unknown>>}
        label="Bürger*innenanfrage"
        placeholder="Beschreiben Sie die vollständige Anfrage der Bürger*innen. Je detaillierter, desto besser kann die Antwort ausfallen..."
        rules={{ required: 'Die Bürger*innenanfrage ist ein Pflichtfeld' }}
        minRows={4}
        tabIndex={tabIndex.hauptfeld || 11}
      />

      <FormFieldWrapper
        label="Art der gewünschten Antwort"
        htmlFor="antwortart-select"
        required={true}
        error={undefined}
      >
        <CreatableSelect
          inputId="antwortart-select"
          classNamePrefix="react-select"
          isMulti={true}
          options={antwortartOptions}
          value={selectedAntwortart}
          onChange={handleAntwortartChange}
          placeholder="Stile auswählen oder eigene eingeben (z.B. höflich, zustimmend)..."
          noOptionsMessage={() => "Keine Optionen gefunden"}
          formatCreateLabel={(inputValue) => `Eigenen Stil hinzufügen: "${inputValue}"`}
          createOptionPosition="first"
          isClearable={true}
          isSearchable={true}
          closeMenuOnSelect={false}
          hideSelectedOptions={false}
          tabIndex={tabIndex.hauptfeld || 12}
          // React Portal for proper dropdown rendering
          menuPortalTarget={document.body}
          menuPosition="fixed"
          styles={{
            container: (provided) => ({
              ...provided,
              fontSize: 'var(--form-element-font-size)'
            }),
            control: (provided) => ({
              ...provided,
              minHeight: 'var(--form-element-min-height)',
            }),
            menuPortal: (base) => ({
              ...base,
              zIndex: 9999
            })
          }}
        />
      </FormFieldWrapper>

      <FormTextarea
        name="kontext"
        control={control as unknown as Control<Record<string, unknown>>}
        label="Zusätzlicher Kontext (optional)"
        placeholder="Weitere Informationen, politische Einordnung, lokale Besonderheiten, rechtliche Rahmenbedingungen..."
        minRows={3}
        tabIndex={tabIndex.hauptfeld || 13}
      />
    </>
  );
});

BuergeranfragenForm.displayName = 'BuergeranfragenForm';

export default BuergeranfragenForm;
