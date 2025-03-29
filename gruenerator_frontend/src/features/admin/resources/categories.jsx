import { TextField } from 'react-admin';

// Import unserer benutzerdefinierten Komponenten
import { StyledList, StyledDatagrid } from '../components/common/CustomDatagrid';
import { 
  StyledEdit, 
  StyledCreate, 
  StyledSimpleForm, 
  StyledTextInput 
} from '../components/common/CustomForms';
import { 
  StyledEditButton, 
  StyledCreateButton, 
  StyledSaveButton 
} from '../components/common/CustomButtons';

// Liste der Kategorien
export const CategoryList = () => (
  <StyledList actions={<StyledCreateButton />}>
    <StyledDatagrid>
      <TextField source="id" className="column-id" />
      <TextField source="label" />
      <StyledEditButton />
    </StyledDatagrid>
  </StyledList>
);

// Bearbeiten einer Kategorie
export const CategoryEdit = () => (
  <StyledEdit>
    <StyledSimpleForm toolbar={<StyledSaveButton />}>
      <StyledTextInput source="label" />
    </StyledSimpleForm>
  </StyledEdit>
);

// Erstellen einer Kategorie
export const CategoryCreate = () => (
  <StyledCreate>
    <StyledSimpleForm toolbar={<StyledSaveButton />}>
      <StyledTextInput source="label" />
    </StyledSimpleForm>
  </StyledCreate>
);

export default {
  list: CategoryList,
  edit: CategoryEdit,
  create: CategoryCreate
}; 