import type { QuotaDashboardResponse } from '../../types/quota';

type Props = {
  diagnostics: string[];
  meta: QuotaDashboardResponse['meta'];
};

export default function QuotaDiagnosticPanel({ diagnostics, meta }: Props) {
  return (
    <section className="card">
      <h2>Diagnostics</h2>
      <dl className="diag-list">
        <dt>Provider</dt>
        <dd>{meta.provider}</dd>
        <dt>Source label</dt>
        <dd>{meta.sourceLabel}</dd>
        <dt>Policy version</dt>
        <dd>{meta.policyVersion || '—'}</dd>
      </dl>
      <ul className="muted">
        {diagnostics.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="muted">
        No high-frequency polling, cookie replay, or undocumented endpoints. Official provider remains disabled unless
        explicitly approved.
      </p>
    </section>
  );
}