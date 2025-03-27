import React from 'react';
import { Admin, Resource } from 'react-admin';
import { dataProvider } from './dataProvider';
import { authProvider } from './authProvider';

// Dashboard-Komponenten
import DashboardHome from './components/Dashboard/DashboardHome';
import DashboardLayout from './components/DashboardLayout';

// Resources
import templates from './resources/templates';
import categories from './resources/categories';
import tags from './resources/tags';

// Icons
import DesignServicesIcon from '@mui/icons-material/DesignServices';
import CategoryIcon from '@mui/icons-material/Category';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';

const AdminApp = () => (
  <Admin 
    dataProvider={dataProvider}
    authProvider={authProvider}
    title="Gruenerator Templates Admin"
    basename="/admin"
    dashboard={() => <DashboardHome />}
    layout={props => <DashboardLayout {...props} />}
  >
    <Resource
      name="templates"
      {...templates}
      icon={DesignServicesIcon}
    />
    <Resource
      name="categories"
      {...categories}
      icon={CategoryIcon}
    />
    <Resource
      name="tags"
      {...tags}
      icon={LocalOfferIcon}
    />
  </Admin>
);

export default AdminApp; 