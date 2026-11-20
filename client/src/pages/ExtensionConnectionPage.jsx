import { Link } from 'react-router-dom';
import { Alert } from '../components/ui/alert.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';

const STEPS = [
  { title: 'Install extension (once)', body: 'Load unpacked from apps/extension/dist. Set API URL: http://localhost:4000 (dev).' },
  { title: 'Save TTD login in DarshanDesk', body: 'Sidebar → TTD Login. Id + password stay in your browser only.' },
  { title: 'Prepare autofill', body: 'Autofill on TTD → Prepare for autofill → paste pairing token in the extension popup.' },
  { title: 'On live TTD', body: 'Log in, open pilgrim step, click Sync & Fill. You handle CAPTCHA and payment.' },
];

export default function ExtensionConnectionPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--dd-text)]">Extension connection</h1>
      <Alert tone="info" title="Chrome extension (Manifest V3)">
        Build: <code className="rounded bg-[var(--dd-bg)] px-1">npm run build -w @darshan-desk/extension</code> — load{' '}
        <code className="rounded bg-[var(--dd-bg)] px-1">apps/extension/dist</code>
      </Alert>
      <div className="grid gap-3">
        {STEPS.map((s, i) => (
          <Card key={s.title} className="border-[var(--dd-border)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Step {i + 1} — {s.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-[var(--dd-text-muted)]">{s.body}</CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <Link to="/ready">
          <Button>Ready to Fill</Button>
        </Link>
        <a href="https://tirupatibalaji.ap.gov.in/#/srivaniedonations" target="_blank" rel="noreferrer">
          <Button variant="secondary">Open TTD SRIVANI (official)</Button>
        </a>
      </div>
    </div>
  );
}