import {
  List,
  Datagrid,
  TextField,
  EditButton,
  Edit,
  SimpleForm,
  TextInput,
  Create
} from 'react-admin';

// Liste der Kategorien
export const CategoryList = () => (
  <List>
    <Datagrid>
      <TextField source="id" />
      <TextField source="label" />
      <EditButton />
    </Datagrid>
  </List>
);

// Bearbeiten einer Kategorie
export const CategoryEdit = () => (
  <Edit>
    <SimpleForm>
      <TextInput source="label" />
    </SimpleForm>
  </Edit>
);

// Erstellen einer Kategorie
export const CategoryCreate = () => (
  <Create>
    <SimpleForm>
      <TextInput source="label" />
    </SimpleForm>
  </Create>
);

export default {
  list: CategoryList,
  edit: CategoryEdit,
  create: CategoryCreate
}; 