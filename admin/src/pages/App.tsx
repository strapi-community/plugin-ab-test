import { Page } from '@strapi/strapi/admin';
import { Route, Routes } from 'react-router-dom';

import { PERMISSIONS } from '../constants';

import { ExperimentsPage } from './ExperimentsPage';

const App = () => (
  <Page.Protect permissions={PERMISSIONS.read}>
    <Routes>
      <Route index element={<ExperimentsPage />} />
      <Route path="*" element={<Page.Error />} />
    </Routes>
  </Page.Protect>
);

export default App;
