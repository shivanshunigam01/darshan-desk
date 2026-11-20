import { useState } from 'react';

type Props = {
  onSubmit: (payload: { source: string; policyVersion?: string; raw: Record<string, unknown> }) => Promise<void>;
  loading: boolean;
};

const template = {
  quotaCount: 0,
  slottime: '04:00 PM',
  minpersons: '1',
  maxpersons: '4',
  advanceminpersons: '1',
  advancemaxpersons: '9',
  noOfladdus: 0,
  minAmount: 10000,
  advanceminAmount: 10000,
  darshanAmount: 0,
  maxAmount: 500000,
  advancemaxAmount: 500000,
  success: 0,
  pending: 0,
  failed: 0,
  released: 0,
  quotaReleaseTime: '11:03:00',
};

export default function ManualQuotaForm({ onSubmit, loading }: Props) {
  const [source, setSource] = useState('operator-visible-official-website');
  const [policyVersion, setPolicyVersion] = useState('srivani-sample-v1');
  const [jsonText, setJsonText] = useState(JSON.stringify(template, null, 2));
  const [error, setError] = useState('');

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const raw = JSON.parse(jsonText) as Record<string, unknown>;
      await onSubmit({ source, policyVersion, raw });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  };

  return (
    <section className="card">
      <h2>Record manual observation</h2>
      <p className="muted">Enter values visible on the official website. Timestamp stored in UTC.</p>
      {error && <div className="alert err">{error}</div>}
      <form onSubmit={handle}>
        <label>Source</label>
        <input value={source} onChange={(e) => setSource(e.target.value)} required />
        <label style={{ marginTop: '0.75rem' }}>Policy version</label>
        <input value={policyVersion} onChange={(e) => setPolicyVersion(e.target.value)} />
        <label style={{ marginTop: '0.75rem' }}>Observation JSON</label>
        <textarea rows={10} value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
        <div className="actions">
          <button type="submit" disabled={loading}>
            Save observation
          </button>
        </div>
      </form>
    </section>
  );
}