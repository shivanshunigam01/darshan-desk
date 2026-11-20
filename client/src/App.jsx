import { lazy } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import AppShell from './components/AppShell.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RequireSuperAdmin from './components/RequireSuperAdmin.jsx';
import { useAuth } from './context/AuthContext.jsx';

const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const BookingPreparePage = lazy(() => import('./pages/BookingPreparePage.jsx'));
const BookingStatusPage = lazy(() => import('./pages/BookingStatusPage.jsx'));
const PreparationsListPage = lazy(() => import('./pages/PreparationsListPage.jsx'));
const QuotaDashboardPage = lazy(() => import('./pages/QuotaDashboardPage.tsx'));
const QaReliabilityPage = lazy(() => import('./pages/QaReliabilityPage.tsx'));
const BookingHistoryPage = lazy(() => import('./pages/BookingHistoryPage.tsx'));
const PilgrimManagementPage = lazy(() => import('./pages/PilgrimManagementPage.jsx'));
const TtdAccountsPage = lazy(() => import('./pages/TtdAccountsPage.jsx'));
const ExtensionConnectionPage = lazy(() => import('./pages/ExtensionConnectionPage.jsx'));
const ReadyToFillPage = lazy(() => import('./pages/ReadyToFillPage.jsx'));
const TtdPortalUserPage = lazy(() => import('./pages/TtdPortalUserPage.jsx'));
const SubscriptionPage = lazy(() => import('./pages/SubscriptionPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));
const PlaceholderPage = lazy(() => import('./pages/PlaceholderPage.jsx'));
const AdminOverviewPage = lazy(() => import('./pages/admin/AdminOverviewPage.jsx'));
const AdminLicensePage = lazy(() => import('./pages/admin/AdminLicensePage.jsx'));
const AdminAnalyticsPage = lazy(() => import('./pages/admin/AdminAnalyticsPage.jsx'));
const AdminCommandCenterPage = lazy(() => import('./pages/admin/AdminCommandCenterPage.jsx'));

function Protected({ children }) {
  const { token, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-600" role="status">
        Loading session…
      </div>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function LegacyPrepareRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/booking/prepare/${id}` : '/booking/prepare'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <AppShell />
          </Protected>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="booking/prepare" element={<BookingPreparePage />} />
        <Route path="booking/prepare/:id" element={<BookingPreparePage />} />
        <Route path="ttd-user" element={<TtdPortalUserPage />} />
        <Route path="pilgrims" element={<PilgrimManagementPage />} />
        <Route path="ready" element={<ReadyToFillPage />} />
        <Route
          path="pilgrim-groups"
          element={
            <PlaceholderPage
              title="Pilgrim groups"
              description="No pilgrim group model or API exists yet. Use Pilgrim Management and select guests in the booking wizard."
            />
          }
        />
        <Route path="ttd-accounts" element={<TtdAccountsPage />} />
        <Route path="extension" element={<ExtensionConnectionPage />} />
        <Route
          path="operators"
          element={
            <PlaceholderPage
              title="Agency operators"
              description="Operator invite/list APIs are not implemented. Authentication uses existing Operator records in MongoDB."
            />
          }
        />
        <Route path="subscription" element={<SubscriptionPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="srivani/status/:id" element={<BookingStatusPage />} />
        <Route path="preparations" element={<PreparationsListPage />} />
        <Route path="srivani/quota" element={<QuotaDashboardPage />} />
        <Route path="srivani/qa" element={<QaReliabilityPage />} />
        <Route path="srivani/history" element={<BookingHistoryPage />} />
        <Route path="srivani/prepare" element={<Navigate to="/booking/prepare" replace />} />
        <Route path="srivani/prepare/:id" element={<LegacyPrepareRedirect />} />
        <Route
          path="admin/overview"
          element={
            <RequireSuperAdmin>
              <AdminOverviewPage />
            </RequireSuperAdmin>
          }
        />
        <Route
          path="admin/command-center"
          element={
            <RequireSuperAdmin>
              <AdminCommandCenterPage initialTab="overview" />
            </RequireSuperAdmin>
          }
        />
        <Route path="admin/license" element={<AdminLicensePage />} />
        <Route path="admin/analytics" element={<AdminAnalyticsPage />} />
        <Route
          path="admin/agencies"
          element={
            <RequireSuperAdmin>
              <AdminCommandCenterPage initialTab="agencies" />
            </RequireSuperAdmin>
          }
        />
        <Route
          path="admin/users"
          element={
            <RequireSuperAdmin>
              <PlaceholderPage title="Agency users" description="Cross-agency operator list/create API is not implemented. Operator counts appear in Command Center agency rows only." />
            </RequireSuperAdmin>
          }
        />
        <Route
          path="admin/account-references"
          element={
            <RequireSuperAdmin>
              <AdminCommandCenterPage initialTab="accounts" />
            </RequireSuperAdmin>
          }
        />
        <Route path="admin/plans" element={<PlaceholderPage title="Subscription plans" description="Billing plans API pending." />} />
        <Route path="admin/logs" element={<PlaceholderPage title="System logs" description="Audit logs are server console JSON only; no UI feed yet." />} />
        <Route path="admin/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}