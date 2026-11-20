import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api';
import { Alert } from '../components/ui/alert.jsx';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Input, Label, Select } from '../components/ui/input.jsx';

const emptyForm = {
  fullName: '',
  age: '',
  gender: 'Male',
  idType: 'Aadhaar Card',
  idNumber: '',
  mobile: '',
  city: '',
};

export default function PilgrimManagementPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [pilgrims, setPilgrims] = useState([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!token) return;
    api
      .pilgrims(token)
      .then((r) => setPilgrims(r.pilgrims || []))
      .catch((e) => setError(e.message));
  };

  useEffect(load, [token]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pilgrims;
    return pilgrims.filter((p) => p.fullName.toLowerCase().includes(q) || p.city?.toLowerCase().includes(q));
  }, [pilgrims, query]);

  const save = async (e, andPrepare = false) => {
    if (e?.preventDefault) e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = {
        ...form,
        age: Number(form.age),
        idType: form.idType === 'Aadhaar Card' ? 'Aadhaar' : form.idType === 'Passport' ? 'Passport' : form.idType,
        gender: form.gender === 'Male' ? 'M' : form.gender === 'Female' ? 'F' : form.gender === 'Transgender' ? 'O' : form.gender,
      };
      let id = editId;
      if (editId) {
        const res = await api.updatePilgrim(token, editId, body);
        id = res.pilgrim?._id || editId;
      } else {
        const res = await api.createPilgrim(token, body);
        id = res.pilgrim._id;
      }
      setForm(emptyForm);
      setEditId(null);
      load();
      if (andPrepare && id) navigate(`/ready?pilgrim=${id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (p) => {
    setEditId(p._id);
    setForm({
      fullName: p.fullName,
      age: String(p.age),
      gender: p.gender === 'M' ? 'Male' : p.gender === 'F' ? 'Female' : p.gender === 'O' ? 'Transgender' : p.gender,
      idType: p.idType === 'Aadhaar' ? 'Aadhaar Card' : p.idType,
      idNumber: p.idNumber,
      mobile: p.mobile,
      city: p.city,
    });
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this pilgrim from your agency catalog?')) return;
    setBusy(true);
    try {
      await api.deletePilgrim(token, id);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--dd-text)]">Step 2 — Pilgrims</h1>
        <p className="text-sm text-[var(--dd-text-muted)]">
          Enter details here first — the extension copies them onto the live TTD booking form.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>{editId ? 'Edit pilgrim' : 'Add pilgrim'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Full name (as per ID proof)</Label>
              <Input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div>
              <Label>Age</Label>
              <Input required type="number" min={1} value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
            </div>
            <div>
              <Label>Gender</Label>
              <Select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} required>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Transgender">Transgender</option>
              </Select>
            </div>
            <div>
              <Label>ID proof type</Label>
              <Select value={form.idType} onChange={(e) => setForm({ ...form, idType: e.target.value })} required>
                <option value="Aadhaar Card">Aadhaar Card</option>
                <option value="Passport">Passport</option>
              </Select>
            </div>
            <div>
              <Label>ID proof number</Label>
              <Input required value={form.idNumber} onChange={(e) => setForm({ ...form, idNumber: e.target.value })} />
            </div>
            <div>
              <Label>Mobile</Label>
              <Input required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>City</Label>
              <Input required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {editId ? 'Save changes' : 'Save pilgrim'}
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={(e) => save(e, true)}>
                Save &amp; prepare autofill
              </Button>
              {editId && (
                <Button type="button" variant="ghost" onClick={() => { setEditId(null); setForm(emptyForm); }}>
                  Cancel edit
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Catalog ({filtered.length})</CardTitle>
          <Input
            className="max-w-xs"
            placeholder="Search name or city"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search pilgrims"
          />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!filtered.length ? (
            <p className="text-sm text-slate-600">No pilgrims yet.</p>
          ) : (
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Age</th>
                  <th className="py-2 pr-4">City</th>
                  <th className="py-2 pr-4">Mobile</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p._id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium">{p.fullName}</td>
                    <td className="py-2 pr-4">{p.age}</td>
                    <td className="py-2 pr-4">{p.city}</td>
                    <td className="py-2 pr-4">{p.mobile}</td>
                    <td className="py-2">
                      <Button size="sm" variant="secondary" className="mr-2" onClick={() => startEdit(p)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => remove(p._id)} disabled={busy}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}