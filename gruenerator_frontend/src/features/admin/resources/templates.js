import {
  List,
  Datagrid,
  TextField,
  EditButton,
  Edit,
  SimpleForm,
  TextInput,
  Create,
  ArrayInput,
  SimpleFormIterator,
  ImageField,
  DateField,
  ReferenceArrayInput,
  SelectArrayInput
} from 'react-admin';

// List-Komponente für Templates
export const TemplateList = () => (
  <List>
    <Datagrid>
      <TextField source="id" />
      <TextField source="title" />
      <TextField source="description" />
      <ImageField source="template_images[0].url" label="Vorschaubild" />
      <DateField source="created_at" />
      <EditButton />
    </Datagrid>
  </List>
);

// Bearbeiten-Komponente für Templates
export const TemplateEdit = () => (
  <Edit>
    <SimpleForm>
      <TextInput source="title" />
      <TextInput source="description" multiline rows={4} />
      <TextInput source="canvaurl" label="Canva URL" />
      <ReferenceArrayInput source="template_categories" reference="categories">
        <SelectArrayInput optionText="label" />
      </ReferenceArrayInput>
      <ArrayInput source="template_tags">
        <SimpleFormIterator>
          <TextInput />
        </SimpleFormIterator>
      </ArrayInput>
    </SimpleForm>
  </Edit>
);

// Erstellen-Komponente für Templates
export const TemplateCreate = () => (
  <Create>
    <SimpleForm>
      <TextInput source="title" />
      <TextInput source="description" multiline rows={4} />
      <TextInput source="canvaurl" label="Canva URL" />
      <ReferenceArrayInput source="template_categories" reference="categories">
        <SelectArrayInput optionText="label" />
      </ReferenceArrayInput>
      <ArrayInput source="template_tags">
        <SimpleFormIterator>
          <TextInput />
        </SimpleFormIterator>
      </ArrayInput>
    </SimpleForm>
  </Create>
);

export default {
  list: TemplateList,
  edit: TemplateEdit,
  create: TemplateCreate
}; 