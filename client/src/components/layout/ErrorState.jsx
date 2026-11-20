import { Alert } from '../ui/alert.jsx';
import { Button } from '../ui/button.jsx';

export function ErrorState({ title = 'Something went wrong', message, onRetry }) {
  return (
    <div className="space-y-4">
      <Alert tone="error" title={title}>
        {message}
      </Alert>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}