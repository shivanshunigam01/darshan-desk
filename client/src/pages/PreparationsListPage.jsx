import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';

export default function PreparationsListPage() {
  const { token } = useAuth();
  const [list, setList] = useState([]);

  useEffect(() => {
    if (!token) return;
    api.preparations(token).then((r) => setList(r.preparations));
  }, [token]);

  return (
    <div>
      <h1>Preparations</h1>
      <p className="muted">CRUD list for SRIVANI booking preparations in your agency.</p>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#fafaf9', textAlign: 'left' }}>
              <th style={{ padding: '0.75rem' }}>Updated</th>
              <th>Category</th>
              <th>Donation</th>
              <th>Validation</th>
              <th>Workflow</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p._id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '0.75rem' }}>{new Date(p.updatedAt).toLocaleString()}</td>
                <td>{p.bookingCategory}</td>
                <td>₹{Number(p.donationAmount).toLocaleString('en-IN')}</td>
                <td>
                  <span className="pill">{p.validationStatus}</span>
                </td>
                <td>
                  <span className="pill">{p.workflowStatus}</span>
                </td>
                <td style={{ padding: '0.75rem' }}>
                  <Link to={`/srivani/prepare/${p._id}`}>Edit</Link> · <Link to={`/srivani/status/${p._id}`}>Status</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <p className="muted" style={{ padding: '1rem' }}>No preparations yet.</p>}
      </div>
    </div>
  );
}