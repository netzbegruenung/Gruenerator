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

// Liste der Tags
export const TagList = () => (
  <StyledList actions={<StyledCreateButton />}>
    <StyledDatagrid>
      <TextField source="id" className="column-id" />
      <TextField source="name" />
      <StyledEditButton />
    </StyledDatagrid>
  </StyledList>
);

// Bearbeiten eines Tags
export const TagEdit = () => (
  <StyledEdit>
    <StyledSimpleForm toolbar={<StyledSaveButton />}>
      <StyledTextInput source="name" />
    </StyledSimpleForm>
  </StyledEdit>
);

// Erstellen eines Tags
export const TagCreate = () => (
  <StyledCreate>
    <StyledSimpleForm toolbar={<StyledSaveButton />}>
      <StyledTextInput source="name" />
    </StyledSimpleForm>
  </StyledCreate>
);

export default {
  list: TagList,
  edit: TagEdit,
  create: TagCreate
}; 