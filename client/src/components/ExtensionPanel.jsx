import { useEffect, useState } from 'react';
import { Link2, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api';
import { Alert } from './ui/alert.jsx';
import { Badge } from './ui/badge.jsx';
import { Button } from './ui/button.jsx';
import { Input } from './ui/input.jsx';
import { cn } from '../lib/utils.js';

export default function ExtensionPanel({
  pairing,
  canConnect,
  busy,
  onConnect,
  preparationId,
  preparation,
  onResync,
}) {
  const { token } = useAuth();
  const [extStatus, setExtStatus] = useState(null);

  const contentRevision = preparation?.contentRevision ?? 1;
  const snapshotRevision = preparation?.extensionSnapshotRevision ?? 0;
  const fillStale = pairing && snapshotRevision > 0 && snapshotRevision < contentRevision;

  useEffect(() => {
    if (!token || !preparationId || !pairing) return;
    api
      .extensionStatus(token, preparationId)
      .then(setExtStatus)
      .catch(() => setExtStatus(null));
  }, [token, preparationId, pairing, busy, preparation?.contentRevision]);

  return (
    <motion-enter className="space-y-4">
      <p className="text-sm text-[var(--dd-text-muted)]">
        After validation, pair the DarshanDesk extension. It may assist permitted fields on the official TTD site — not declarations,
        authentication, CAPTCHA, or payment.
      </p>

      {fillStale && (
        <Alert tone="warning" title="Extension payload may be stale">
          Preparation revision is <strong>{contentRevision}</strong> but the extension last synced revision{' '}
          <strong>{snapshotRevision}</strong>. Re-pair or trigger sync before fill so stale pilgrim data is not applied.
        </Alert>
      )}

      {!pairing ? (
        <Button type="button" disabled={!canConnect || busy} onClick={onConnect} className="gap-2">
          <Link2 className="h-4 w-4" aria-hidden />
          Generate pairing token
        </Button>
      ) : (
        <div className="space-y-3 rounded-[var(--dd-radius-md)] border border-[var(--dd-border)] bg-[var(--dd-bg)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success">Pairing active</Badge>
            <span className="text-xs text-[var(--dd-text-muted)]">Rev {contentRevision}</span>
          </div>
          <div>
            <label htmlFor="pairing-token" className="mb-1 block text-xs font-medium text-[var(--dd-text-muted)]">
              Copy into Chrome extension popup
            </label>
            <Input id="pairing-token" readOnly value={pairing.pairingToken} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
          </div>
          <p className="text-xs text-[var(--dd-text-muted)]">{pairing.disclaimer}</p>
          <p className="text-xs text-[var(--dd-text-muted)]">
            Allowed assist: {pairing.allowedAssistFields?.join(', ') || '—'}
          </p>
          {extStatus && (
            <p className={cn('text-sm', extStatus.connected ? 'text-[var(--dd-success)]' : 'text-[var(--dd-text-muted)]')}>
              Session: {extStatus.connected ? 'connected' : extStatus.revoked ? 'revoked' : extStatus.status || 'pending'}
              {extStatus.lastHeartbeatAt && ` · heartbeat ${new Date(extStatus.lastHeartbeatAt).toLocaleString()}`}
            </p>
          )}
          {onResync && (
            <Button type="button" variant="secondary" size="sm" className="gap-2" disabled={busy} onClick={onResync}>
              <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} aria-hidden />
              Reload preparation for extension
            </Button>
          )}
        </div>
      )}
    </motion-enter>
  );
}

function motionEnter({ className, children }) {
  return <div className={cn('dd-enter', className)}>{children}</div>;
}