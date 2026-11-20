import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { useAuth } from '../hooks/useAuth';
import { ApiError, apiDelete, apiGet, apiPost } from '../services/darshanDeskApi';

type Pilgrim = {
  _id: string;
  fullName: string;
  age: number;
  gender: string;
  idType: string;
};

export function PilgrimsPage() {
  const { t } = useTranslation();
  const { auth } = useAuth();
  const [list, setList] = useState<Pilgrim[]>([]);
  const [form, setForm] = useState({
    fullName: '',
    age: '',
    gender: 'M',
    idType: 'Aadhaar Card',
    idNumber: '',
    mobile: '9000000000',
    city: 'Tirupati',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    if (!auth) return;
    try {
      const data = await apiGet<{ pilgrims: Pilgrim[] }>(auth, '/api/catalog/pilgrims');
      setList(data.pilgrims || []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('pilgrims.loadError'));
    }
  }, [auth, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) return;
    setBusy(true);
    setError('');
    try {
      await apiPost(auth, '/api/catalog/pilgrims', {
        fullName: form.fullName.trim(),
        age: Number(form.age),
        gender: form.gender,
        idType: form.idType,
        idNumber: form.idNumber.trim(),
        mobile: form.mobile,
        city: form.city,
      });
      setForm({ ...form, fullName: '', age: '', idNumber: '' });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('pilgrims.saveError'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!auth) return;
    setBusy(true);
    try {
      await apiDelete(auth, `/api/catalog/pilgrims/${id}`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('pilgrims.saveError'));
    } finally {
      setBusy(false);
    }
  };

  const filtered = list.filter((p) => !q || p.fullName.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="animate-fade-in space-y-3 pb-2">
      <h2 className="dd-page-title text-base">{t('nav.pilgrims')}</h2>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-temple-red">{t('pilgrims.add')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-2 text-xs" onSubmit={save}>
            <Input placeholder={t('pilgrims.fullName')} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder={t('pilgrims.age')} type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} required />
              <select className="h-10 rounded-lg border border-red-100 px-2" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="O">Transgender</option>
              </select>
            </div>
            <select className="h-10 rounded-lg border border-red-100 px-2" value={form.idType} onChange={(e) => setForm({ ...form, idType: e.target.value })}>
              <option>Aadhaar Card</option>
              <option>Passport</option>
            </select>
            <Input placeholder={t('pilgrims.idNumber')} value={form.idNumber} onChange={(e) => setForm({ ...form, idNumber: e.target.value })} required />
            <Button type="submit" disabled={busy}>
              {t('pilgrims.save')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Input placeholder={t('pilgrims.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      {error && <Alert variant="destructive">{error}</Alert>}

      <ul className="space-y-2">
        {filtered.map((p) => (
          <li key={p._id} className="flex items-center justify-between rounded-xl border border-red-50 bg-white p-3">
            <div>
              <p className="text-sm font-semibold">{p.fullName}</p>
              <p className="text-[10px] text-stone-500">
                {p.age} · {p.gender} · {p.idType}
              </p>
            </div>
            <Button variant="destructive" size="sm" disabled={busy} onClick={() => remove(p._id)}>
              {t('pilgrims.delete')}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}