import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Plug, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { KPIStatCard } from '../components/layout/KPIStatCard.jsx';
import { ErrorState } from '../components/layout/ErrorState.jsx';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { DashboardSkeleton } from '../components/ui/skeleton.jsx';

const FLOW = [
  { step: 1, title: 'TTD Login', detail: 'Save mobile/email + password on this browser (Step 1 in sidebar).' },
  { step: 2, title: 'Pilgrims', detail: 'Enter guest details in DarshanDesk — same as TTD booking form.' },
  { step: 3, title: 'Autofill on TTD', detail: 'Prepare → extension Sync & Fill on live TTD — you submit & pay.' },
];

export default function DashboardPage() {
  const { token, operator } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pilgrims, setPilgrims] = useState([]);
  const [active, setActive] = useState(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [pil, act] = await Promise.all([api.pilgrims(token), api.extensionActivePreparation(token)]);
      setPilgrims(pil.pilgrims || []);
      setActive(act.active);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  const readyCount = active ? (active.pilgrims?.length || active.selectedPilgrimIds?.length || 0) : 0;

  if (loading) return <DashboardSkeleton variant="command" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="mx-auto max-w-4xl space-y-8 dd-enter">
      <PageHeader
        title="DarshanDesk"
        description={`Autofill workspace for ${operator?.displayName || 'operator'} — store pilgrims, prepare once, fill on the official site.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/ttd-user">
              <Button variant="secondary" className="gap-2">
                <Plus className="h-4 w-4" aria-hidden />
                Step 1: TTD login
              </Button>
            </Link>
            <Link to="/pilgrims">
              <Button variant="secondary" className="gap-2">
                <UserPlus className="h-4 w-4" aria-hidden />
                Step 2: Pilgrims
              </Button>
            </Link>
            <Link to="/ready">
              <Button className="gap-2">
                <Plus className="h-4 w-4" aria-hidden />
                Step 3: Autofill
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <KPIStatCard label="Saved pilgrims" value={pilgrims.length} animateValue />
        <KPIStatCard
          label="Ready-to-fill profiles"
          value={readyCount}
          hint={active ? `Prep ${String(active.preparationId).slice(-8)} · rev ${active.revision}` : 'Prepare on Autofill on TTD'}
          tone={active ? 'success' : 'warning'}
          animateValue
        />
        <KPIStatCard
          label="Validation"
          value={active?.validationStatus || '—'}
          hint={active?.updatedAt ? `Updated ${new Date(active.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}` : 'No active preparation'}
        />
      </div>

      <Card className="border-[var(--dd-border)]">
        <CardHeader>
          <CardTitle className="text-base">Official booking flow</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {FLOW.map((f) => (
            <div
              key={f.step}
              className="rounded-[var(--dd-radius-md)] border border-[var(--dd-border)] bg-[var(--dd-bg)] p-4"
            >
              <p className="text-xs font-semibold text-[var(--dd-accent)]">Step {f.step}</p>
              <p className="font-medium text-[var(--dd-text)]">{f.title}</p>
              <p className="mt-1 text-xs text-[var(--dd-text-muted)]">{f.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-[var(--dd-border)]">
        <CardHeader>
          <CardTitle className="text-base">Recent profiles</CardTitle>
        </CardHeader>
        <CardContent>
          {pilgrims.length === 0 ? (
            <p className="text-sm text-[var(--dd-text-muted)]">No pilgrims yet. Add one to start.</p>
          ) : (
            <ul className="divide-y divide-[var(--dd-border)] text-sm">
              {[...pilgrims]
                .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
                .slice(0, 5)
                .map((p) => (
                  <li key={p._id} className="flex justify-between py-2">
                    <span className="font-medium">{p.fullName}</span>
                    <span className="text-[var(--dd-text-muted)]">
                      {p.age} · {p.idType}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Link to="/extension">
          <Button variant="secondary" className="gap-2">
            <Plug className="h-4 w-4" aria-hidden />
            Install extension (one-time)
          </Button>
        </Link>
      </div>
    </div>
  );
}