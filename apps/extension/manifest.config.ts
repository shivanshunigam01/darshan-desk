import { defineManifest } from '@crxjs/vite-plugin';
import packageJson from './package.json';

const prodApi = (
  process.env.DD_PRODUCTION_API_ORIGIN || 'https://darshan.totallylearns.com'
).replace(/\/$/, '');
const prodDashboard = process.env.DD_PRODUCTION_DASHBOARD_ORIGIN?.replace(/\/$/, '');
const prodMockBooking = prodApi ? `${prodApi}/mock-booking` : '';

const host_permissions = [
  'http://localhost:4000/*',
  'http://127.0.0.1:4000/*',
  'http://localhost:5173/*',
];
if (prodApi) host_permissions.push(`${prodApi}/*`);
if (prodDashboard) host_permissions.push(`${prodDashboard}/*`);

const content_matches = [
  'http://localhost:4000/mock-booking/*',
  'http://127.0.0.1:4000/mock-booking/*',
];
if (prodMockBooking) content_matches.push(`${prodMockBooking}/*`);

const dashboard_matches = [
  'http://localhost:5173/*',
  'http://localhost:5174/*',
  'http://127.0.0.1:5173/*',
  'http://127.0.0.1:5174/*',
];
if (prodDashboard) dashboard_matches.push(`${prodDashboard}/*`);

const ttd_login_matches = [
  'https://tirupatibalaji.ap.gov.in/*',
  'https://*.tirupatibalaji.ap.gov.in/*',
  'https://ttdevasthanams.ap.gov.in/*',
  'https://*.ttdevasthanams.ap.gov.in/*',
];

export default defineManifest({
  manifest_version: 3,
  name: 'DarshanDesk',
  description:
    'Extension-first pilgrim preparation and authorized TTD form assist. No OTP, payment, or auto-submit.',
  version: packageJson.version,
  icons: {
    48: 'src/assets/logo.jpg',
    128: 'src/assets/logo.jpg',
  },
  permissions: ['storage', 'tabs'],
  host_permissions,
  action: {
    default_title: 'DarshanDesk',
    default_popup: 'popup.html',
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: content_matches,
      js: ['src/content/fill-content.ts'],
      run_at: 'document_idle',
    },
    {
      matches: dashboard_matches,
      js: ['src/content/dashboard-sync.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ttd_login_matches,
      js: ['src/content/ttd-login-content.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ttd_login_matches,
      js: ['src/content/fill-content.ts'],
      run_at: 'document_idle',
    },
  ],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'",
  },
});