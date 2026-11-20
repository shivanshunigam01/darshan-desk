import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import ExtensionPanel from '../components/ExtensionPanel.jsx';
import BookingChecklist from '../components/BookingChecklist.jsx';
import WizardContextPanel from '../components/WizardContextPanel.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { AccountPicker } from '../components/wizard/AccountPicker.jsx';
import { PilgrimSelectCards } from '../components/wizard/PilgrimSelectCards.jsx';
import { WizardProgressStepper } from '../components/wizard/WizardProgressStepper.jsx';
import { WizardStepChrome } from '../components/wizard/WizardStepChrome.jsx';
import { DraftAutosaveStatus } from '../components/wizard/DraftAutosaveStatus.jsx';
import { ConfirmDialog } from '../components/ui/dialog.jsx';
import { Alert } from '../components/ui/alert.jsx';
import { Button } from '../components/ui/button.jsx';
import { Input, Label } from '../components/ui/input.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { useDebouncedAutosave } from '../hooks/useDebouncedAutosave.js';

const WIZARD_STEPS = [
  { id: 'account', label: 'Select account' },
  { id: 'category', label: 'Booking type' },
  { id: 'donation', label: 'Donation' },
  { id: 'pilgrims', label: 'Pilgrims' },
  { id: 'validate', label: 'Verify data' },
  { id: 'extension', label: 'Extension sync' },
  { id: 'official', label: 'Official form' },
  { id: 'outcome', label: 'Record outcome' },
];

export default function BookingPreparePage() {
  const { token } = useAuth();
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const [policy, setPolicy] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [pilgrims, setPilgrims] = useState([]);
  const [preparationId, setPreparationId] = useState(routeId || null);
  const [preparation, setPreparation] = useState(null);
  const [checklist, setChecklist] = useState([]);
  const [ttdAccountReferenceId, setTtdAccountReferenceId] = useState('');
  const [donationAmount, setDonationAmount] = useState('10000');
  const [bookingCategory, setBookingCategory] = useState('CURRENT');
  const [preferredDate, setPreferredDate] = useState('');
  const [selectedPilgrimIds, setSelectedPilgrimIds] = useState([]);
  const [consent, setConsent] = useState(false);
  const [pairing, setPairing] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [personLimit, setPersonLimit] = useState(null);
  const [draftState, setDraftState] = useState('idle');
  const [confirmBack, setConfirmBack] = useState(false);

  const [fieldErrors, setFieldErrors] = useState({
    account: '',
    category: '',
    donation: '',
    pilgrims: '',
  });

  useEffect(() => {
    if (!token) return;
    Promise.all([api.activePolicy(token), api.ttdAccounts(token), api.pilgrims(token)])
      .then(([pol, acc, pil]) => {
        setPolicy(pol.policy);
        setAccounts(acc.accounts);
        setPilgrims(pil.pilgrims);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => {
    if (!token || !routeId) return;
    api
      .preparation(token, routeId)
      .then(({ preparation: p }) => {
        setPreparation(p);
        setPreparationId(p._id);
        setTtdAccountReferenceId(p.ttdAccountReferenceId?._id || p.ttdAccountReferenceId);
        setDonationAmount(String(p.donationAmount));
        setBookingCategory(p.bookingCategory);
        setPreferredDate(p.preferredDate ? p.preferredDate.slice(0, 10) : '');
        setSelectedPilgrimIds((p.pilgrimIds || []).map((x) => x._id || x));
        setConsent(Boolean(p.consentRecordedAt));
        setDraftState('saved');
        if (p.validationStatus === 'passed') setStep(5);
      })
      .catch((e) => setError(e.message));
  }, [token, routeId]);

  useEffect(() => {
    if (!token || !donationAmount) return;
    api
      .ttdPersonLimit(token, donationAmount)
      .then((r) => setPersonLimit(r))
      .catch(() => setPersonLimit(null));
  }, [token, donationAmount]);

  const maxPilgrims = useMemo(() => {
    if (!policy) return bookingCategory === 'CURRENT' ? 4 : 9;
    return bookingCategory === 'CURRENT' ? policy.maximumCurrentPilgrims : policy.maximumAdvancePilgrims;
  }, [policy, bookingCategory]);

  const selectedAccount = accounts.find((a) => a._id === ttdAccountReferenceId);
  const selectedPilgrims = pilgrims.filter((p) => selectedPilgrimIds.includes(p._id));

  const togglePilgrim = (pid) => {
    setSelectedPilgrimIds((prev) =>
      prev.includes(pid) ? prev.filter((x) => x !== pid) : prev.length < maxPilgrims ? [...prev, pid] : prev
    );
    setFieldErrors((f) => ({ ...f, pilgrims: '' }));
  };

  const buildBody = () => ({
    ttdAccountReferenceId,
    trustCategory: 'SRIVANI',
    bookingCategory,
    donationAmount: Number(donationAmount),
    pilgrimIds: selectedPilgrimIds,
    preferredDate: bookingCategory === 'ADVANCE' ? preferredDate : undefined,
  });

  const saveDraft = useCallback(
    async ({ silent = false } = {}) => {
      if (!ttdAccountReferenceId || !bookingCategory || donationAmount === '') {
        if (!silent) setError('Account, booking type, and donation are required to save.');
        return null;
      }
      if (!silent) setError('');
      setBusy(true);
      setDraftState('saving');
      try {
        const body = buildBody();
        let p;
        if (preparationId) {
          const res = await api.updatePreparation(token, preparationId, body);
          p = res.preparation;
        } else {
          const res = await api.createPreparation(token, body);
          p = res.preparation;
          setPreparationId(p._id);
          navigate(`/booking/prepare/${p._id}`, { replace: true });
        }
        setPreparation(p);
        setDraftState('saved');
        if (p.validationStatus !== 'passed') setPairing(null);
        return p._id;
      } catch (e) {
        setDraftState('error');
        if (!silent) setError(e.message);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [token, ttdAccountReferenceId, bookingCategory, donationAmount, selectedPilgrimIds, preferredDate, preparationId, navigate]
  );

  useDebouncedAutosave({
    enabled: Boolean(preparationId) && step < 5,
    deps: [ttdAccountReferenceId, bookingCategory, donationAmount, preferredDate, selectedPilgrimIds.join(',')],
    onSave: saveDraft,
  });

  const recordConsentAndValidate = async () => {
    let id = preparationId;
    if (!id) id = await saveDraft();
    if (!id) return;
    if (!consent) {
      setError('Record consent before validation — declarations and CAPTCHA stay on the official site.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.consent(token, id);
      const res = await api.validate(token, id);
      setPreparation(res.preparation);
      setChecklist(res.checklist || []);
      if (res.preparation.validationStatus === 'passed') {
        setStep(5);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const connectExtension = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.pairExtension(token, preparationId);
      setPairing(res);
      const prep = await api.preparation(token, preparationId);
      setPreparation(prep.preparation);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const reloadPreparation = async () => {
    if (!preparationId) return;
    setBusy(true);
    try {
      const prep = await api.preparation(token, preparationId);
      setPreparation(prep.preparation);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const validateCurrentStep = () => {
    const minDonation = policy?.minimumDonation ?? 0;
    const next = { account: '', category: '', donation: '', pilgrims: '' };
    let ok = true;
    if (step === 0) {
      if (!ttdAccountReferenceId) {
        next.account = 'Choose an authorized TTD account reference.';
        ok = false;
      }
    }
    if (step === 1) {
      if (!bookingCategory) {
        next.category = 'Select current or advance booking.';
        ok = false;
      }
      if (bookingCategory === 'ADVANCE' && !preferredDate) {
        next.category = 'Advance bookings require a preferred date.';
        ok = false;
      }
    }
    if (step === 2) {
      const amt = Number(donationAmount);
      if (!donationAmount || Number.isNaN(amt)) {
        next.donation = 'Enter a valid donation amount.';
        ok = false;
      } else if (amt < minDonation) {
        next.donation = `Minimum donation is ₹${minDonation.toLocaleString('en-IN')} per active policy.`;
        ok = false;
      }
    }
    if (step === 3) {
      if (!selectedPilgrimIds.length) {
        next.pilgrims = 'Select at least one pilgrim.';
        ok = false;
      }
    }
    if (step === 4 && preparation?.validationStatus !== 'passed') {
      setError('Run validation and resolve errors before continuing.');
      ok = false;
    }
    setFieldErrors(next);
    return ok;
  };

  const goNext = async () => {
    if (!validateCurrentStep()) return;
    if (step === 3) {
      const id = await saveDraft();
      if (!id) return;
    }
    if (step < WIZARD_STEPS.length - 1) setStep((s) => s + 1);
  };

  const goBack = () => {
    if (step >= 5 && preparation?.validationStatus === 'passed') {
      setConfirmBack(true);
      return;
    }
    setStep((s) => Math.max(0, s - 1));
  };

  const mockBookingUrl =
    typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:4000/mock-booking/` : 'http://localhost:4000/mock-booking/';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Booking preparation"
        description="Eight-step guided SRIVANI workflow. Drafts autosave; you control declarations, CAPTCHA, and payment on TTD."
      />

      <div className="lg:hidden">
        <DraftAutosaveStatus state={draftState} revision={preparation?.contentRevision} updatedAt={preparation?.updatedAt} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0 space-y-6">
          <WizardProgressStepper steps={WIZARD_STEPS} currentStep={step} />

          {error && (
            <Alert tone="error" title="Action needed">
              {error}
            </Alert>
          )}

          {policy && step <= 2 && (
            <Alert tone="warning" title="Policy reference (fixture)">
              Version {policy.policyVersion} · Min donation ₹{policy.minimumDonation.toLocaleString('en-IN')} · Release {policy.releaseTime}
              — verify on official TTD before booking.
            </Alert>
          )}

          <MotionWrap key={step}>
            {step === 0 && (
              <WizardStepChrome title="Select account" description="Pick the linked TTD reference for this preparation.">
                <AccountPicker
                  accounts={accounts}
                  value={ttdAccountReferenceId}
                  onChange={(id) => {
                    setTtdAccountReferenceId(id);
                    setFieldErrors((f) => ({ ...f, account: '' }));
                  }}
                  error={fieldErrors.account}
                />
              </WizardStepChrome>
            )}

            {step === 1 && (
              <WizardStepChrome title="Current or advance booking" description="SRIVANI category determines pilgrim limits.">
                {fieldErrors.category && (
                  <p className="mb-3 text-sm text-[var(--dd-error)]" role="alert">
                    {fieldErrors.category}
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {['CURRENT', 'ADVANCE'].map((cat) => (
                    <button
                      type="button"
                      key={cat}
                      onClick={() => setBookingCategory(cat)}
                      className={`rounded-[var(--dd-radius-md)] border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dd-accent)] ${
                        bookingCategory === cat
                          ? 'border-[var(--dd-accent)] bg-[var(--dd-accent-soft)]'
                          : 'border-[var(--dd-border)] hover:border-[var(--dd-border-strong)]'
                      }`}
                      aria-pressed={bookingCategory === cat}
                    >
                      <strong className="text-[var(--dd-text)]">{cat === 'CURRENT' ? 'Current break darshan' : 'Advance / future'}</strong>
                      <p className="mt-1 text-xs text-[var(--dd-text-muted)]">
                        Max {cat === 'CURRENT' ? policy?.maximumCurrentPilgrims || 4 : policy?.maximumAdvancePilgrims || 9} pilgrims
                      </p>
                    </button>
                  ))}
                  {bookingCategory === 'ADVANCE' && (
                    <div className="sm:col-span-2">
                      <Label htmlFor="pref">Preferred date</Label>
                      <Input id="pref" type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} />
                    </div>
                  )}
                </div>
              </WizardStepChrome>
            )}

            {step === 2 && (
              <WizardStepChrome title="Donation preparation" description="Amount must satisfy policy minimum; pilgrim eligibility may vary by tier.">
                <div className="max-w-sm space-y-2">
                  <Label htmlFor="donation">Donation (₹)</Label>
                  <Input
                    id="donation"
                    type="number"
                    min={policy?.minimumDonation || 0}
                    value={donationAmount}
                    onChange={(e) => {
                      setDonationAmount(e.target.value);
                      setFieldErrors((f) => ({ ...f, donation: '' }));
                    }}
                    aria-invalid={Boolean(fieldErrors.donation)}
                    aria-describedby={fieldErrors.donation ? 'donation-err' : undefined}
                  />
                  {fieldErrors.donation && (
                    <p id="donation-err" className="text-sm text-[var(--dd-error)]" role="alert">
                      {fieldErrors.donation}
                    </p>
                  )}
                  {personLimit && (
                    <p className="text-sm text-[var(--dd-text-muted)]">
                      Eligibility hint: up to {personLimit.maxPersons ?? '—'} pilgrims for this donation tier.
                    </p>
                  )}
                </div>
              </WizardStepChrome>
            )}

            {step === 3 && (
              <WizardStepChrome title="Select pilgrims" description="Guest group for the official form — saved on continue.">
                <PilgrimSelectCards
                  pilgrims={pilgrims}
                  selectedIds={selectedPilgrimIds}
                  max={maxPilgrims}
                  onToggle={togglePilgrim}
                  fieldErrors={fieldErrors.pilgrims ? [fieldErrors.pilgrims] : []}
                />
              </WizardStepChrome>
            )}

            {step === 4 && (
              <WizardStepChrome title="Verify required data" description="Server-side validation against policy and pilgrim records.">
                <div className="space-y-4">
                  <label className="flex gap-3 rounded-[var(--dd-radius-sm)] border border-[var(--dd-border)] p-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    <span>
                      I will complete declarations, OTP, CAPTCHA, and payment only on the official TTD website. DarshanDesk does not
                      auto-submit or auto-accept legal attestations.
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" disabled={busy} onClick={() => saveDraft()}>
                      Save draft
                    </Button>
                    <Button disabled={busy || !consent} onClick={recordConsentAndValidate}>
                      Run validation
                    </Button>
                  </div>
                  {preparation && (
                    <p className="text-sm">
                      Status:{' '}
                      <Badge
                        tone={
                          preparation.validationStatus === 'passed'
                            ? 'success'
                            : preparation.validationStatus === 'failed'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {preparation.validationStatus}
                      </Badge>
                      {typeof preparation.contentRevision === 'number' && (
                        <span className="ml-2 text-[var(--dd-text-muted)]">rev {preparation.contentRevision}</span>
                      )}
                    </p>
                  )}
                  <ul className="space-y-1">
                    {preparation?.validationErrors?.map((e) => (
                      <li key={e} className="text-sm text-[var(--dd-error)]" role="alert">
                        {e}
                      </li>
                    ))}
                  </ul>
                  {checklist.length > 0 && <BookingChecklist items={checklist} preparation={preparation} />}
                </div>
              </WizardStepChrome>
            )}

            {step === 5 && (
              <WizardStepChrome title="Sync with extension" description="Pair only after validation passes so fill payloads match revision.">
                <ExtensionPanel
                  pairing={pairing}
                  preparationId={preparationId}
                  preparation={preparation}
                  canConnect={preparation?.validationStatus === 'passed'}
                  busy={busy}
                  onConnect={connectExtension}
                  onResync={reloadPreparation}
                />
              </WizardStepChrome>
            )}

            {step === 6 && (
              <WizardStepChrome
                title="Review official form"
                description="Open the portal yourself; confirm every assisted field. No automated submission."
              >
                <div className="space-y-4 text-sm text-[var(--dd-text)]">
                  <BookingChecklist items={checklist} preparation={preparation} />
                  <div className="rounded-[var(--dd-radius-md)] border border-[var(--dd-border)] bg-[var(--dd-bg)] p-4 space-y-2">
                    <p>
                      <strong>Account:</strong> {selectedAccount?.label || '—'}
                    </p>
                    <p>
                      <strong>Category:</strong> {bookingCategory}
                    </p>
                    <p>
                      <strong>Donation:</strong> ₹{Number(donationAmount).toLocaleString('en-IN')}
                    </p>
                    <p>
                      <strong>Guests:</strong> {selectedPilgrims.map((p) => p.fullName).join(', ') || '—'}
                    </p>
                  </div>
                  <p>
                    Development mock:{' '}
                    <a
                      className="inline-flex items-center gap-1 text-[var(--dd-accent)] underline underline-offset-2"
                      href={mockBookingUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open mock booking form <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  </p>
                  <Alert tone="warning" title="Operator control">
                    Review extension-filled fields, then complete CAPTCHA, declarations, and payment manually. DarshanDesk never auto-accepts
                    attestations or submits the official booking.
                  </Alert>
                </div>
              </WizardStepChrome>
            )}

            {step === 7 && preparationId && (
              <WizardStepChrome title="Record official booking outcome" description="Capture evidence after you finish on TTD.">
                <Link to={`/srivani/status/${preparationId}`}>
                  <Button>Open outcome recorder →</Button>
                </Link>
              </WizardStepChrome>
            )}
          </MotionWrap>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--dd-border)] pt-4">
            <Button variant="secondary" disabled={step === 0 || busy} onClick={goBack}>
              Previous
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => saveDraft()}>
                Save draft
              </Button>
              {step < WIZARD_STEPS.length - 1 && (
                <Button disabled={busy} onClick={goNext}>
                  Continue
                </Button>
              )}
            </div>
          </footer>
        </div>

        <aside className="hidden lg:block">
          <WizardContextPanel
            stepIndex={step}
            stepLabel={WIZARD_STEPS[step]?.label}
            account={selectedAccount}
            bookingCategory={bookingCategory}
            donationAmount={donationAmount}
            pilgrims={selectedPilgrims}
            preparation={preparation}
            draftState={draftState}
          />
        </aside>
      </div>

      <ConfirmDialog
        open={confirmBack}
        title="Return to an earlier step?"
        description="Editing validated fields will invalidate the preparation and may require re-validation and extension re-pairing."
        confirmLabel="Go back"
        onConfirm={() => {
          setConfirmBack(false);
          setStep((s) => Math.max(0, s - 1));
        }}
        onCancel={() => setConfirmBack(false)}
      />
    </div>
  );
}

function MotionWrap({ children }) {
  return <div className="dd-enter space-y-6">{children}</div>;
}