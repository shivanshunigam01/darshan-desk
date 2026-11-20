import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, LogIn, Zap } from 'lucide-react';
import type { FieldFillResult } from '@darshan-desk/fill-engine';
import type { ProtocolMessage, ProtocolResponse } from '../../shared/protocol';
import type { ExtensionSession } from '../../shared/storage';
import { API_BASE_URL } from '../../config/api';
import { useAuth } from '../../hooks/useAuth';
import { loadPendingPairing } from '../../services/authStorage';
import { FillLoader } from '../../components/fill/FillLoader';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';

type Payload = {
  preparationId: string;
  contentRevision?: number;
  validationStatus?: string;
  workflowStatus?: string;
  pilgrims: Array<{ id: string; fullName: string }>;
  permittedScalars: { donationAmount?: number; bookingCategory?: string };
  fieldAudit?: { ok: boolean; errors: string[] };
};

function send<T extends ProtocolMessage>(msg: T): Promise<ProtocolResponse> {
  return chrome.runtime.sendMessage(msg);
}

export default function LegacyFillWorkflow() {
  const { t } = useTranslation();
  const { settings } = useAuth();
  const apiBaseUrl = API_BASE_URL.replace(/\/$/, '');
  const [pairingToken, setPairingToken] = useState('');
  const [session, setSession] = useState<ExtensionSession | null>(null);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [fillStep, setFillStep] = useState<1 | 2 | 3 | 4 | undefined>();
  const [assistNote, setAssistNote] = useState('');
  const [results, setResults] = useState<FieldFillResult[]>([]);
  const [validation, setValidation] = useState<{ ok: boolean; fieldErrors?: Array<{ label: string; message: string }> } | null>(
    null
  );
  const [auditErrors, setAuditErrors] = useState<string[]>([]);
  const [hasPortalLogin, setHasPortalLogin] = useState(false);
  const [loginFillNote, setLoginFillNote] = useState('');
  const validateOnlyRef = useRef(false);

  const refreshState = useCallback(async () => {
    const r = await send({ type: 'GET_STATE' });
    if (r.session) setSession(r.session as ExtensionSession);
    if (r.payload) {
      const p = r.payload as Payload;
      setPayload(p);
      if (!selected.length) setSelected(p.pilgrims.map((x) => x.id));
      setAuditErrors(p.fieldAudit?.errors || []);
    }
  }, [selected.length]);

  useEffect(() => {
    refreshState();
    send({ type: 'GET_PORTAL_CREDENTIALS_STATE' }).then((r) => setHasPortalLogin(Boolean(r.hasCredentials)));
    void loadPendingPairing().then(async (token) => {
      if (!token) return;
      const r = await send({ type: 'EXTENSION_PAIR_REQUEST', pairingToken: token, apiBaseUrl });
      if (r.ok) void refreshState();
    });
  }, [refreshState]);

  const fillTtdLogin = async () => {
    setBusy(true);
    setBusyLabel('Filling TTD login on page…');
    setError('');
    setLoginFillNote('');
    try {
      const r = await send({ type: 'TTD_LOGIN_FILL_REQUEST' });
      if (!r.ok) throw new Error(r.error || 'Could not fill login');
      const report = r.fillReport as { message?: string };
      setLoginFillNote(report?.message || 'Login and password filled — enter captcha yourself.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login fill failed');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const connect = async () => {
    setBusy(true);
    setBusyLabel('Connecting to DarshanDesk…');
    setError('');
    try {
      const r = await send({ type: 'EXTENSION_PAIR_REQUEST', pairingToken, apiBaseUrl });
      if (!r.ok) throw new Error(r.error || 'Connect failed');
      setSession(r.session as ExtensionSession);
      const p = r.payload as Payload;
      setPayload(p);
      setSelected(p.pilgrims.map((x) => x.id));
      setAuditErrors((r.validation as { errors?: string[] })?.errors || p.fieldAudit?.errors || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connect failed');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const sync = async (opts?: { keepBusy?: boolean }) => {
    setBusy(true);
    setBusyLabel('Syncing preparation…');
    setError('');
    try {
      const r = await send({ type: 'PREPARATION_SYNC' });
      if (!r.ok) throw new Error(r.error || 'Sync failed');
      setSession(r.session as ExtensionSession);
      setPayload(r.payload as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      if (!opts?.keepBusy) {
        setBusy(false);
        setBusyLabel('');
      }
    }
  };

  const applyPilgrims = async () => {
    const r = await send({ type: 'PREPARATION_SELECTED', pilgrimIds: selected });
    if (!r.ok) throw new Error(r.error || 'Update failed');
    setPayload(r.payload as Payload);
    const errs = (r.validation as { errors?: string[] })?.errors || [];
    setAuditErrors(errs);
    return errs;
  };

  const disconnect = async () => {
    setBusy(true);
    setBusyLabel('Disconnecting…');
    await send({ type: 'DISCONNECT' });
    setSession(null);
    setPayload(null);
    setResults([]);
    setValidation(null);
    setBusy(false);
    setBusyLabel('');
  };

  const parseFillReport = (r: ProtocolResponse, validateOnly: boolean) => {
    if (!r.ok) throw new Error(r.error || (validateOnly ? 'Validate failed' : 'Fill failed'));
    const report = r.fillReport as {
      results: FieldFillResult[];
      validation?: { ok: boolean; fieldErrors: Array<{ label: string; message: string }> };
      captchaRequired?: boolean;
    };
    setResults(report.results || []);
    setValidation(report.validation || (r.validation as typeof validation));
    if (report.captchaRequired) {
      setError(t('fill.captchaRequired'));
    }
  };

  const pageOverlay = async (show: boolean, status?: string) => {
    await send({
      type: 'FILL_PAGE_OVERLAY',
      show,
      status,
      title: validateOnlyRef.current ? t('fill.stepValidate') : t('fill.stepFill'),
    }).catch(() => undefined);
  };

  const syncThenFill = async (validateOnly: boolean) => {
    validateOnlyRef.current = validateOnly;
    setBusy(true);
    setError('');
    setResults([]);
    setValidation(null);
    setReviewed(false);
    setFillStep(1);
    setBusyLabel(t('fill.stepSync'));
    await pageOverlay(true, t('fill.stepSync'));
    try {
      const syncR = await send({ type: 'PREPARATION_SYNC' });
      if (!syncR.ok) throw new Error(syncR.error || 'Sync failed');
      setSession(syncR.session as ExtensionSession);
      const p = syncR.payload as Payload;
      setPayload(p);
      const syncAudit =
        (syncR.validation as { errors?: string[] })?.errors || p.fieldAudit?.errors || [];
      setAuditErrors(syncAudit);

      setFillStep(2);
      setBusyLabel(t('fill.stepPilgrims'));
      await pageOverlay(true, t('fill.stepPilgrims'));
      const auditAfterSelect = await applyPilgrims();
      const blockers = auditAfterSelect.length ? auditAfterSelect : syncAudit;
      if (blockers.length && !validateOnly) {
        throw new Error(blockers.join(' · '));
      }

      setFillStep(3);
      setBusyLabel(validateOnly ? t('fill.stepValidate') : t('fill.stepFill'));
      await pageOverlay(true, validateOnly ? t('fill.stepValidate') : t('fill.stepFill'));
      const r = await send(
        validateOnly
          ? { type: 'FORM_VALIDATE_REQUEST' }
          : { type: 'FORM_FILL_REQUEST', allowOverwrite, validateOnly: false }
      );
      parseFillReport(r, validateOnly);

      if (!validateOnly && settings.bookingAssist && r.ok) {
        setFillStep(4);
        setBusyLabel(t('fill.stepBookingAssist'));
        await pageOverlay(true, t('fill.stepBookingAssist'));
        const assistR = await send({
          type: 'SRIVANI_BOOKING_ASSIST_REQUEST',
          autoContinue: true,
          autoPaymentGateway: true,
          preferredGateway: settings.paymentGateway,
        });
        const report = assistR.fillReport as { payNowReady?: boolean; message?: string } | undefined;
        if (report?.payNowReady) {
          setAssistNote(t('fill.payNowManual'));
        } else if (report?.message) {
          setAssistNote(report.message);
        } else if (!assistR.ok) {
          setAssistNote(assistR.error || t('fill.assistFailed'));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : validateOnly ? 'Validate failed' : 'Fill failed');
    } finally {
      await pageOverlay(false);
      setBusy(false);
      setBusyLabel('');
      setFillStep(undefined);
    }
  };

  const validateFields = () => syncThenFill(true);

  const runBookingAssistOnly = async () => {
    setBusy(true);
    setError('');
    setAssistNote('');
    setFillStep(4);
    setBusyLabel(t('fill.stepBookingAssist'));
    await pageOverlay(true, t('fill.stepBookingAssist'));
    try {
      const assistR = await send({
        type: 'SRIVANI_BOOKING_ASSIST_REQUEST',
        autoContinue: true,
        autoPaymentGateway: true,
        preferredGateway: settings.paymentGateway,
      });
      const report = assistR.fillReport as { payNowReady?: boolean; message?: string } | undefined;
      if (report?.payNowReady) setAssistNote(t('fill.payNowManual'));
      else setAssistNote(report?.message || assistR.error || t('fill.assistFailed'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('fill.assistFailed'));
    } finally {
      await pageOverlay(false);
      setBusy(false);
      setBusyLabel('');
      setFillStep(undefined);
    }
  };

  const connected = Boolean(session?.connected);

  return (
    <div className="relative space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <Badge variant={connected ? 'success' : 'warn'}>{connected ? t('fill.connected') : t('fill.disconnected')}</Badge>
        {connected && (
          <Badge variant={session?.validationStatus === 'passed' ? 'success' : 'default'}>
            {session?.validationStatus || payload?.validationStatus || 'pending'}
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xs text-temple-red">
            <LogIn className="h-4 w-4" />
            {t('fill.ttdLogin')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" disabled={busy || !hasPortalLogin} onClick={() => void fillTtdLogin()}>
              {t('fill.useLogin')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              disabled={busy}
              onClick={() => send({ type: 'OPEN_OFFICIAL_PORTAL' })}
            >
              <ExternalLink className="mr-1 inline h-3 w-3" />
              {t('fill.openPortal')}
            </Button>
          </div>
          {loginFillNote && <p className="text-[10px] text-emerald-700">{loginFillNote}</p>}
        </CardContent>
      </Card>

      {!connected ? (
        <Card>
          <CardContent className="space-y-2 pt-4 text-xs">
            <Input
              value={pairingToken}
              onChange={(e) => setPairingToken(e.target.value)}
              placeholder={t('fill.pairingPlaceholder')}
            />
            <Button className="w-full" disabled={busy || !pairingToken} onClick={() => void connect()}>
              {t('fill.connect')}
            </Button>
            <p className="text-[10px] text-stone-500">{t('fill.pairHint')}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="bg-gradient-to-br from-white to-temple-blush">
            <CardContent className="grid grid-cols-2 gap-2 pt-4 text-[11px]">
              <Summary label={t('fill.donation')} value={`₹${session?.donationAmount ?? payload?.permittedScalars.donationAmount ?? '—'}`} />
              <Summary
                label={t('fill.pilgrims')}
                value={`${selected.length}/${payload?.pilgrims.length || session?.pilgrimCount || 0}`}
              />
              <Summary label={t('fill.ttdAccount')} value={session?.ttdAccountLabel || '—'} />
              <Summary label={t('fill.revision')} value={String(payload?.contentRevision ?? session?.contentRevision ?? '—')} />
            </CardContent>
          </Card>

          {auditErrors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-900">
              <ul className="list-disc pl-4">
                {auditErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-red-100 bg-white p-3">
            <p className="mb-2 text-xs font-bold text-stone-700">{t('fill.pilgrimGroup')}</p>
            <div className="max-h-28 space-y-1 overflow-y-auto">
              {payload?.pilgrims.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="accent-temple-red"
                    checked={selected.includes(p.id)}
                    onChange={() =>
                      setSelected((prev) => (prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]))
                    }
                  />
                  <span>{p.fullName}</span>
                </label>
              ))}
            </div>
          </div>

          <Button
            className="h-11 w-full text-base font-bold shadow-md"
            disabled={busy || selected.length === 0}
            onClick={() => void syncThenFill(false)}
          >
            <Zap className="mr-2 inline h-4 w-4" />
            {t('fill.syncFill')}
          </Button>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" disabled={busy || selected.length === 0} onClick={() => void validateFields()}>
              {t('fill.validate')}
            </Button>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => void sync()}>
              {t('fill.syncOnly')}
            </Button>
          </div>

          {settings.bookingAssist && (
            <Button variant="secondary" size="sm" className="w-full" disabled={busy} onClick={() => void runBookingAssistOnly()}>
              {t('fill.assistContinue')}
            </Button>
          )}

          {assistNote && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-950">{assistNote}</p>
          )}

          <label className="flex items-center gap-2 text-[10px] text-stone-600">
            <input type="checkbox" className="accent-temple-red" checked={allowOverwrite} onChange={(e) => setAllowOverwrite(e.target.checked)} />
            {t('fill.overwrite')}
          </label>

          {results.length > 0 && (
            <div className="rounded-xl border border-red-100 bg-white p-2">
              <p className="mb-1 text-xs font-bold text-temple-red">{t('fill.results')}</p>
              <div className="max-h-32 overflow-y-auto text-[10px]">
                {results.map((r) => (
                  <div key={r.key} className="border-b border-stone-50 py-1 last:border-0">
                    <span className="font-semibold">{r.displayLabel}</span>: {r.status}
                    {r.message ? ` — ${r.message}` : ''}
                  </div>
                ))}
              </div>
              {validation && !validation.ok && (
                <p className="mt-2 text-[10px] text-red-700">
                  {validation.fieldErrors?.map((f) => `${f.label}: ${f.message}`).join('; ')}
                </p>
              )}
              <label className="mt-2 flex items-center gap-2 text-[10px]">
                <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
                {t('fill.reviewed')}
              </label>
              {reviewed && validation?.ok && <p className="text-[10px] font-semibold text-emerald-700">{t('fill.readySubmit')}</p>}
            </div>
          )}

          <Button variant="ghost" size="sm" className="w-full text-stone-500" disabled={busy} onClick={() => void disconnect()}>
            {t('fill.disconnect')}
          </Button>
        </>
      )}

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">{error}</div>
      )}

      {busy && <FillLoader label={busyLabel || t('fill.working')} step={fillStep} />}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="truncate font-bold text-temple-black">{value}</p>
    </div>
  );
}