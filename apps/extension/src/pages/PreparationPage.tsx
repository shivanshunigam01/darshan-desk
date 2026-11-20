import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { useAuth } from '../hooks/useAuth';
import { ApiError, apiGet, apiPost } from '../services/darshanDeskApi';
import { savePendingPairing } from '../services/authStorage';
import type { ProtocolMessage, ProtocolResponse } from '../shared/protocol';

type AccountOpt = { _id: string; label: string; accountHint?: string };
type PilgrimOpt = { _id: string; fullName: string };

function send<T extends ProtocolMessage>(msg: T): Promise<ProtocolResponse> {
  return chrome.runtime.sendMessage(msg);
}

export function PreparationPage() {
  const { t } = useTranslation();
  const { auth, settings } = useAuth();
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [pilgrims, setPilgrims] = useState<PilgrimOpt[]>([]);
  const [accountId, setAccountId] = useState('');
  const [donation, setDonation] = useState('10000');
  const [selected, setSelected] = useState<string[]>([]);
  const [prepId, setPrepId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!auth) return;
    try {
      const [acc, pil] = await Promise.all([
        apiGet<{ accounts: AccountOpt[] }>(auth, '/api/catalog/ttd-accounts'),
        apiGet<{ pilgrims: PilgrimOpt[] }>(auth, '/api/catalog/pilgrims'),
      ]);
      setAccounts(acc.accounts || []);
      setPilgrims(pil.pilgrims || []);
      if (!accountId && acc.accounts?.[0]) setAccountId(acc.accounts[0]._id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('prep.loadError'));
    }
  }, [auth, accountId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const saveAndValidate = async () => {
    if (!auth) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const created = await apiPost<{ preparation: { _id: string } }>(auth, '/api/preparations', {
        ttdAccountReferenceId: accountId,
        bookingCategory: 'CURRENT',
        trustCategory: 'SRIVANI',
        donationAmount: Number(donation),
        pilgrimIds: selected,
      });
      const id = created.preparation._id;
      setPrepId(id);
      await apiPost(auth, `/api/preparations/${id}/consent`, { acknowledged: true });
      const validated = await apiPost<{ preparation: { validationStatus: string; validationErrors?: string[] } }>(
        auth,
        `/api/preparations/${id}/validate`,
        {}
      );
      if (validated.preparation.validationStatus !== 'passed') {
        setError((validated.preparation.validationErrors || []).join('; ') || t('prep.validateFailed'));
        return;
      }
      const pair = await apiPost<{ pairingToken: string }>(auth, `/api/preparations/${id}/extension/pair`, {});
      await savePendingPairing(pair.pairingToken);
      await send({
        type: 'EXTENSION_PAIR_REQUEST',
        pairingToken: pair.pairingToken,
        apiBaseUrl: settings.apiBaseUrl,
      });
      setMessage(t('prep.readyFill'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('prep.saveError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-3 pb-2">
      <h2 className="dd-page-title text-base">{t('nav.preparation')}</h2>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-temple-red">{t('prep.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <label className="block font-medium">
            {t('prep.ttdAccount')}
            <select className="mt-1 h-10 w-full rounded-lg border border-red-100 px-2" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <Input type="number" min={10000} step={1000} value={donation} onChange={(e) => setDonation(e.target.value)} />
          <p className="font-medium text-stone-700">{t('prep.selectPilgrims')}</p>
          <ul className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-red-50 p-2">
            {pilgrims.map((p) => (
              <li key={p._id}>
                <label className="flex gap-2">
                  <input type="checkbox" checked={selected.includes(p._id)} onChange={() => toggle(p._id)} />
                  <span>{p.fullName}</span>
                </label>
              </li>
            ))}
          </ul>
          <Button className="w-full" disabled={busy || !selected.length || !accountId} onClick={() => void saveAndValidate()}>
            {t('prep.saveValidate')}
          </Button>
          {prepId && <p className="text-[10px] text-stone-500">ID: {prepId}</p>}
        </CardContent>
      </Card>

      {error && <Alert variant="destructive">{error}</Alert>}
      {message && <Alert>{message}</Alert>}
    </div>
  );
}