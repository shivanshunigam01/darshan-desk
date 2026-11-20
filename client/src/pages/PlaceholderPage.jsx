import { Alert } from '../components/ui/alert.jsx';

export default function PlaceholderPage({ title, description }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-navy">{title}</h1>
      <Alert tone="warning" title="Not connected">
        {description}
      </Alert>
    </div>
  );
}