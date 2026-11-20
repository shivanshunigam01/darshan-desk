import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';

export default function BookingStatusPage() {
  const { token } = useAuth();
  const { id } = useParams();
  const [preparation, setPreparation] = useState(null);
  const [evidenceType, setEvidenceType] = useState('confirmation_number');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = () =>
    api.preparation(token, id).then((r) => setPreparation(r.preparation)).catch((e) => setError(e.message));

  useEffect(() => {
    if (token && id) load();
  }, [token, id]);

  const markAwaiting = async () => {
    try {
      const res = await api.awaitingOfficial(token, id);
      setPreparation(res.preparation);
      setMessage('Marked as awaiting official completion on TTD site.');
    } catch (e) {
      setError(e.message);
    }
  };

  const recordOutcome = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.recordOutcome(token, id, { evidenceType, evidenceReference, note });
      setPreparation(res.preparation);
      setMessage('Verified outcome recorded with official evidence.');
    } catch (e) {
      setError(e.message);
    }
  };

  if (!preparation) return <p className="muted">Loading status…</p>;

  return (
    <div>
      <h1>Booking status</h1>
      <p className="muted">Workflow stage for preparation {id}</p>
      {error && <div className="alert err">{error}</div>}
      {message && <div className="alert warn">{message}</div>}

      <section className="card">
        <p>
          Workflow: <span className="pill">{preparation.workflowStatus}</span>
        </p>
        <p>
          Validation:{' '}
          <span className={`pill ${preparation.validationStatus === 'passed' ? 'ok' : ''}`}>
            {preparation.validationStatus}
          </span>
        </p>
        <p className="muted">Policy version: {preparation.policyVersion || '—'}</p>
        <p className="muted">
          Donation ₹{Number(preparation.donationAmount).toLocaleString('en-IN')} · {preparation.bookingCategory} ·{' '}
          {preparation.trustCategory}
        </p>
        {preparation.officialOutcome?.evidenceReference && (
          <p>
            Verified evidence ({preparation.officialOutcome.evidenceType}):{' '}
            <strong>{preparation.officialOutcome.evidenceReference}</strong>
          </p>
        )}
      </section>

      {preparation.workflowStatus !== 'verified' && (
        <>
          <section className="card">
            <h2>Official TTD steps (operator only)</h2>
            <ul className="checklist">
              <li>SRIVANI Trust Donations — tick corpus/citizenship declarations yourself</li>
              <li>Break Darshan choice — Current vs Future on official modal</li>
              <li>Pilgrim form + CAPTCHA — extension does not fill CAPTCHA or click Continue before quota release</li>
              <li>Confirmation modal — accept rules with Yes/No on TTD only</li>
              <li>Authentication, payment, and final submit on official site</li>
            </ul>
            <p className="muted">
              DarshanDesk never marks payment or booking complete without official evidence.
            </p>
            <button type="button" className="secondary" onClick={markAwaiting}>
              I am on the official TTD site
            </button>
          </section>

          <section className="card">
            <h2>Record verified outcome</h2>
            <form onSubmit={recordOutcome}>
              <label>Evidence type</label>
              <select value={evidenceType} onChange={(e) => setEvidenceType(e.target.value)}>
                <option value="confirmation_number">Confirmation number</option>
                <option value="receipt">Payment receipt reference</option>
                <option value="screenshot_hash">Screenshot hash</option>
                <option value="other">Other official reference</option>
              </select>
              <label style={{ marginTop: '0.75rem' }}>Evidence reference</label>
              <input required value={evidenceReference} onChange={(e) => setEvidenceReference(e.target.value)} />
              <label style={{ marginTop: '0.75rem' }}>Note (optional)</label>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="actions">
                <button type="submit">Record verified outcome</button>
              </div>
            </form>
          </section>
        </>
      )}
    </div>
  );
}