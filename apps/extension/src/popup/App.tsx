import { HashRouter } from 'react-router-dom';
import { AuthProvider } from '../hooks/useAuth';
import { AppShell } from '../components/layout/AppShell';
import '../i18n';

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <AppShell />
      </HashRouter>
    </AuthProvider>
  );
}