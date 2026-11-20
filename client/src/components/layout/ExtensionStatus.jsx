import { Link } from 'react-router-dom';
import { Button } from '../ui/button.jsx';
import { StatusIndicator } from './StatusIndicator.jsx';

export function ExtensionStatus({ status }) {
  if (!status) {
    return <p className="text-sm text-[var(--dd-text-muted)]">No validated preparation yet. Complete the booking wizard first.</p>;
  }
  if (status.disconnected) {
    return <StatusIndicator tone="warning" label="Extension not paired" />;
  }
  const connected = status.connected;
  return (
    <div className="space-y-3 text-sm transition-opacity duration-200">
      <StatusIndicator tone={connected ? 'success' : 'warning'} label={status.status || (connected ? 'Connected' : 'Idle')} />
      {status.preparationId && (
        <Link to={`/booking/prepare/${status.preparationId}`} className="text-[var(--dd-accent)] underline underline-offset-2">
          Open preparation ···{status.preparationId.slice(-6)}
        </Link>
      )}
      <Link to="/extension">
        <Button variant="secondary" size="sm">
          Extension setup
        </Button>
      </Link>
    </div>
  );
}