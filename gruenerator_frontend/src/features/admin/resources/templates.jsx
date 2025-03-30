import {
  TextField,
  ImageField,
  DateField,
  ReferenceArrayInput,
  SelectArrayInput
} from 'react-admin';

// Import unserer benutzerdefinierten Komponenten
import { StyledList, StyledDatagrid } from '../components/common/CustomDatagrid';
import { 
  StyledEdit, 
  StyledCreate, 
  StyledSimpleForm, 
  StyledTextInput,
  StyledArrayInput,
  StyledSimpleFormIterator
} from '../components/common/CustomForms';
import { 
  StyledEditButton, 
  StyledCreateButton, 
  StyledSaveButton 
} from '../components/common/CustomButtons';

// List-Komponente für Templates
export const TemplateList = () => (
  <StyledList actions={<StyledCreateButton />}>
    <StyledDatagrid>
      <TextField source="id" />
      <TextField source="title" />
      <TextField source="description" />
      <ImageField source="template_images[0].url" label="Vorschaubild" className="column-image" />
      <DateField source="created_at" />
      <StyledEditButton />
    </StyledDatagrid>
  </StyledList>
);

// Bearbeiten-Komponente für Templates
export const TemplateEdit = () => (
  <StyledEdit>
    <StyledSimpleForm toolbar={<StyledSaveButton />}>
      <StyledTextInput source="title" />
      <StyledTextInput source="description" multiline rows={4} />
      <StyledTextInput source="canvaurl" label="Canva URL" />
      <ReferenceArrayInput source="category_ids" reference="categories">
        <SelectArrayInput optionText="label" />
      </ReferenceArrayInput>
      <StyledArrayInput source="template_tags">
        <StyledSimpleFormIterator>
          <StyledTextInput />
        </StyledSimpleFormIterator>
      </StyledArrayInput>
    </StyledSimpleForm>
  </StyledEdit>
);

// Erstellen-Komponente für Templates
export const TemplateCreate = () => (
  <StyledCreate>
    <StyledSimpleForm toolbar={<StyledSaveButton />}>
      <StyledTextInput source="title" />
      <StyledTextInput source="description" multiline rows={4} />
      <StyledTextInput source="canvaurl" label="Canva URL" />
      <ReferenceArrayInput source="category_ids" reference="categories">
        <SelectArrayInput optionText="label" />
      </ReferenceArrayInput>
      <StyledArrayInput source="template_tags">
        <StyledSimpleFormIterator>
          <StyledTextInput />
        </StyledSimpleFormIterator>
      </StyledArrayInput>
    </StyledSimpleForm>
  </StyledCreate>
);

export default {
  list: TemplateList,
  edit: TemplateEdit,
  create: TemplateCreate
}; 