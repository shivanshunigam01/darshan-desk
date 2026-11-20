import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Activity,
  ArrowDownToLine,
  Bot,
  CheckCircle2,
  CircleAlert,
  Gauge,
  Layers3,
  Loader2,
  Monitor,
  Plus,
  RefreshCw,
  Server,
  Settings2,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type RuntimeConfig = {
  api_url: string;
  api_key: string;
  diagnostics_log_path: string;
};
type Health = {
  status: string;
  queue_size: number;
  active: number;
  max_concurrent: number;
};
type TaskStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
type BookingType = "current" | "future";
type BookingStrategy = "browser" | "http_payload";
type ClockSource = "ttd" | "ntp" | "both";

type Task = {
  id: string;
  type: string;
  status: TaskStatus;
  worker_id: number | null;
  error: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  booking_type: BookingType | null;
  future_booking_date: string | null;
  future_booking_dates: string[];
  future_booking_forced: boolean;
  additional_laddus: number | null;
  pilgrim_count: number | null;
  captcha_required: boolean;
  captcha_status: string | null;
  captcha_attempts: number;
  captcha_max_attempts: number;
};

type CaptchaState = {
  available: boolean;
  required: boolean;
  status: string | null;
  ocr_text: string | null;
  attempts: number;
  max_attempts: number;
  image_base64: string | null;
};

type Pilgrim = {
  name: string;
  age: string;
  gender: "M" | "F" | "T";
  id_type: "Aadhaar Card" | "Passport";
  id_doc_number: string;
};

type Booking = {
  username: string;
  password: string;
  donation: string;
  booking_type: BookingType;
  booking_strategy: BookingStrategy;
  clock_source: ClockSource;
  continue_attempts: string;
  booking_attempts: string;
  attempt_stagger_seconds: string;
  ntp_servers: string;
  ntp_timeout_seconds: string;
  future_booking_dates: string[];
  future_booking_forced: boolean;
  additional_laddus: string;
  pilgrims: Pilgrim[];
};

type FieldErrors = Record<string, string>;

const FALLBACK_API = "http://127.0.0.1:8002";

const emptyPilgrim = (): Pilgrim => ({
  name: "",
  age: "",
  gender: "M",
  id_type: "Aadhaar Card",
  id_doc_number: "",
});

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return formatDateInput(date);
}

const emptyBooking = (): Booking => ({
  username: "",
  password: "",
  donation: "10000",
  booking_type: "current",
  booking_strategy: "browser",
  clock_source: "ttd",
  continue_attempts: "3",
  booking_attempts: "2",
  attempt_stagger_seconds: "0",
  ntp_servers: "time.google.com,in.pool.ntp.org",
  ntp_timeout_seconds: "2",
  future_booking_dates: [addDays(14)],
  future_booking_forced: false,
  additional_laddus: "1",
  pilgrims: [emptyPilgrim()],
});

function statusVariant(status: TaskStatus) {
  if (status === "COMPLETED") return "default";
  if (status === "FAILED") return "destructive";
  if (status === "RUNNING") return "secondary";
  return "outline";
}

function isRuntimeFailure(result: Record<string, unknown> | null) {
  return result?.success === false;
}

function parseApiErrors(payload: any): FieldErrors {
  const errors: FieldErrors = {};
  if (!payload?.detail) return errors;

  if (Array.isArray(payload.detail)) {
    for (const item of payload.detail) {
      const location = Array.isArray(item?.loc) ? item.loc.join(".") : "";
      const message = String(item?.msg || "Invalid value");
      if (location) errors[location] = message;
    }
  }

  return errors;
}

function getApiMessage(payload: any, fallback: string) {
  if (!payload?.detail) return fallback;
  if (Array.isArray(payload.detail))
    return payload.detail
      .map((item: any) => item?.msg || "Invalid value")
      .join(" · ");
  return typeof payload.detail === "string" ? payload.detail : fallback;
}

function App() {
  const [runtime, setRuntime] = useState<RuntimeConfig | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskLogs, setTaskLogs] = useState<string[]>([]);
  const [page, setPage] = useState<"overview" | "new" | "tasks">("overview");
  const [mode, setMode] = useState<"manual" | "auto">("auto");
  const [manualCount, setManualCount] = useState("2");
  const [manualHeadless, setManualHeadless] = useState(false);
  const [manualReleaseId, setManualReleaseId] = useState<string | null>(null);
  const [manualReleaseTriggered, setManualReleaseTriggered] = useState(false);
  const [manualReleaseSubmitting, setManualReleaseSubmitting] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([emptyBooking()]);
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<FieldErrors>({});
  const [concurrency, setConcurrency] = useState("5");
  const [concurrencyDirty, setConcurrencyDirty] = useState(false);
  const [savingConcurrency, setSavingConcurrency] = useState(false);
  const [showConnectionDetails, setShowConnectionDetails] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const lastConnectionError = useRef<string | null>(null);
  const lastRuntimeConfigError = useRef<string | null>(null);

  const reportConnectionError = useCallback((message: string | null) => {
    setConnectionError(message);
    if (message && lastConnectionError.current !== message) {
      console.error(`[TTD backend diagnostics] ${message}`);
    }
    lastConnectionError.current = message;
  }, []);
  const [captchaNotifiedTasks, setCaptchaNotifiedTasks] = useState<string[]>(
    [],
  );

  const API = runtime?.api_url || FALLBACK_API;

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(runtime?.api_key ? { "X-API-Key": runtime.api_key } : {}),
    }),
    [runtime],
  );

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) || null,
    [tasks, selectedTaskId],
  );

  const refresh = useCallback(async () => {
    if (!runtime) return;


    let nextHealth: Health;
    try {
      const healthRes = await fetch(`${API}/health`);
      if (!healthRes.ok) {
        throw new Error(`GET ${API}/health returned HTTP ${healthRes.status}`);
      }
      nextHealth = await healthRes.json();
      setHealth(nextHealth);
      if (!concurrencyDirty) {
        setConcurrency(String(nextHealth.max_concurrent));
      }
    } catch (error) {
      setHealth(null);
      const reason = error instanceof Error ? error.message : String(error);
      reportConnectionError(
        `Backend health check failed at ${API}/health: ${reason}. Check the backend log at ${runtime.diagnostics_log_path}.`,
      );
      return;
    }

    try {
      const taskRes = await fetch(`${API}/tasks?limit=100`, { headers });
      if (!taskRes.ok) {
        throw new Error(`GET ${API}/tasks?limit=100 returned HTTP ${taskRes.status}`);
      }
      setTasks(await taskRes.json());
      reportConnectionError(null);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      reportConnectionError(
        `Backend health check succeeded, but task loading failed: ${reason}. Check API authentication and backend logs at ${runtime.diagnostics_log_path}.`,
      );
    }
  }, [API, headers, runtime, concurrencyDirty, reportConnectionError]);


  useEffect(() => {
    let mounted = true;
    const loadRuntime = () => {
      void invoke<RuntimeConfig>("get_runtime_config")
        .then((config) => {
          lastRuntimeConfigError.current = null;
          if (mounted) setRuntime(config);
        })
        .catch((error) => {
          const reason = error instanceof Error ? error.message : String(error);
          if (lastRuntimeConfigError.current !== reason) {
            console.error(`[TTD runtime diagnostics] Could not get runtime configuration: ${reason}`);
            lastRuntimeConfigError.current = reason;
          }
          if (mounted) {
            setRuntime(null);
            reportConnectionError("Unable to initialize the local backend.");
          }
        });
    };
    loadRuntime();
    const id = window.setInterval(loadRuntime, 2000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!runtime) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(id);
  }, [refresh, runtime]);

  useEffect(() => {
    const pending = tasks.find((task) => task.captcha_required);
    if (!pending) return;

    // Open the blocking task automatically so the CAPTCHA controls are visible.
    setSelectedTaskId(pending.id);
    setPage("tasks");

    if (!captchaNotifiedTasks.includes(pending.id)) {
      setCaptchaNotifiedTasks((seen) => [...seen, pending.id]);
      setFlash(
        `CAPTCHA review required for booking ${pending.id.slice(0, 12)}. Verify or correct it below to continue.`,
      );
    }
  }, [tasks, captchaNotifiedTasks]);

  useEffect(() => {
    if (!selectedTaskId || !runtime) {
      setTaskLogs([]);
      return;
    }

    let cancelled = false;
    const loadLogs = async () => {
      try {
        const response = await fetch(
          `${API}/tasks/${selectedTaskId}/logs?limit=500`,
          { headers },
        );
        if (!response.ok) return;
        const payload: { lines: string[] } = await response.json();
        if (!cancelled) setTaskLogs(payload.lines);
      } catch {
        if (!cancelled) setTaskLogs([]);
      }
    };

    void loadLogs();
    const id = window.setInterval(() => void loadLogs(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [API, headers, runtime, selectedTaskId]);

  async function submit() {
    if (!runtime) { setFlash("Local backend is not ready."); return; }
    setSubmitting(true);
    setFlash(null);
    setFormErrors({});
    try {
      const body =
        mode === "manual"
          ? {
              mode: "manual",
              count: Number(manualCount),
              headless: manualHeadless,
              trace: false,
            }
          : {
              mode: "auto",
              headless: false,
              trace: false,
              bookings: bookings.map((booking) => ({
                username: booking.username.trim(),
                password: booking.password,
                donation: Number(booking.donation),
                booking_type: booking.booking_type,
                booking_strategy: booking.booking_strategy,
                ...(booking.booking_strategy === "http_payload"
                  ? {
                      clock_source: booking.clock_source,
                      continue_attempts: Number(booking.continue_attempts),
                      booking_attempts: Number(booking.booking_attempts),
                      attempt_stagger_seconds: Number(booking.attempt_stagger_seconds),
                      ...(booking.clock_source !== "ttd"
                        ? {
                            ntp_servers: booking.ntp_servers
                              .split(",")
                              .map((server) => server.trim())
                              .filter(Boolean),
                            ntp_timeout_seconds: Number(booking.ntp_timeout_seconds),
                          }
                        : {}),
                    }
                  : {}),
                ...(booking.booking_type === "future"
                  ? {
                      future_booking_dates: booking.future_booking_dates,
                      future_booking_forced: booking.future_booking_forced,
                      additional_laddus: Number(booking.additional_laddus),
                    }
                  : {}),
                pilgrim_details: booking.pilgrims.map((p) => ({
                  name: p.name.trim(),
                  age: Number(p.age),
                  gender: p.gender,
                  id_type: p.id_type,
                  id_doc_number: p.id_doc_number.trim(),
                })),
              })),
            };

      const response = await fetch(`${API}/register/ttd/`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        setFormErrors(parseApiErrors(payload));
        throw new Error(
          getApiMessage(payload, `Request failed (${response.status})`),
        );
      }

      setFlash(
        `${payload.enqueued} task${payload.enqueued === 1 ? "" : "s"} queued.`,
      );

      if (mode === "manual") {
        setManualReleaseId(
          typeof payload.manual_release_id === "string"
            ? payload.manual_release_id
            : null,
        );
        setManualReleaseTriggered(false);
      }

      const firstQueuedTaskId =
        Array.isArray(payload.tasks) && payload.tasks.length > 0 &&
        typeof payload.tasks[0]?.id === "string"
          ? payload.tasks[0].id
          : null;

      setSelectedTaskId(firstQueuedTaskId);
      setPage("tasks");
      await refresh();
    } catch (error) {
      setFlash(
        error instanceof Error ? error.message : "Unable to submit request",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function releaseManualBatch() {
    if (!manualReleaseId || manualReleaseSubmitting) return;

    setManualReleaseSubmitting(true);
    setFlash(null);

    try {
      const response = await fetch(
        `${API}/register/ttd/manual-release/${manualReleaseId}`,
        {
          method: "POST",
          headers,
        },
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          getApiMessage(
            payload,
            `Unable to release manual instances (${response.status})`,
          ),
        );
      }

      setManualReleaseTriggered(true);
      setFlash(
        "Manual instances released. Waiting for the portal release time.",
      );
      await refresh();
    } catch (error) {
      setFlash(
        error instanceof Error
          ? error.message
          : "Unable to release manual instances",
      );
    } finally {
      setManualReleaseSubmitting(false);
    }
  }

  async function cancelTask(id: string) {
    if (!window.confirm(`Kill task ${id.slice(0, 12)}?`)) return;
    setFlash(null);
    try {
      const response = await fetch(`${API}/tasks/${id}/cancel`, {
        method: "POST",
        headers,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          getApiMessage(payload, `Unable to kill task (${response.status})`),
        );
      setFlash("Task kill requested.");
      await refresh();
    } catch (error) {
      setFlash(error instanceof Error ? error.message : "Unable to kill task");
    }
  }

  async function showBrowser(id: string) {
    setFlash(null);
    try {
      const response = await fetch(`${API}/tasks/${id}/show-browser`, {
        method: "POST",
        headers,
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          getApiMessage(payload, `Unable to show browser (${response.status})`),
        );
      setFlash("Browser window brought to the foreground.");
    } catch (error) {
      setFlash(
        error instanceof Error ? error.message : "Unable to show browser",
      );
    }
  }

  async function updateConcurrency() {
    const value = Number(concurrency);
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      setFlash("Concurrency must be a whole number between 1 and 100.");
      return;
    }

    setSavingConcurrency(true);
    try {
      const response = await fetch(`${API}/settings/concurrency`, {
        method: "POST",
        headers,
        body: JSON.stringify({ max_concurrent: value }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          getApiMessage(
            payload,
            `Unable to change concurrency (${response.status})`,
          ),
        );
      setConcurrency(String(payload.max_concurrent));
      setConcurrencyDirty(false);
      setFlash(`Concurrency set to ${payload.max_concurrent}.`);
      await refresh();
    } catch (error) {
      setFlash(
        error instanceof Error ? error.message : "Unable to change concurrency",
      );
    } finally {
      setSavingConcurrency(false);
    }
  }

  const activeTasks = tasks.filter((task) => task.status === "RUNNING").length;
  const failedTasks = tasks.filter((task) => task.status === "FAILED").length;


  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Layers3 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">Booking Control Share</div>
              <div className="text-xs text-muted-foreground">
                Browser orchestration console
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              variant={health ? "default" : "destructive"}
              className="gap-1.5"
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  health ? "bg-emerald-400" : "bg-red-400",
                )}
              />
              {health ? "Backend online" : "Backend offline"}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1500px] grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="space-y-2">
          {(
            [
              ["overview", "Overview", Activity],
              ["new", "New run", Plus],
              ["tasks", "Tasks", Gauge],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setPage(key)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition",
                page === key
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/70",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}

          <Separator className="my-4" />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Settings2 className="h-4 w-4" />
                Worker settings
              </CardTitle>
              <CardDescription>
                Controls how many browser tasks can run at once.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Concurrent browser tasks">
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={concurrency}
                    onChange={(event) => {
                      setConcurrency(event.target.value);
                      setConcurrencyDirty(true);
                    }}
                  />
                  <Button
                    onClick={() => void updateConcurrency()}
                    disabled={savingConcurrency}
                  >
                    {savingConcurrency ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Apply"
                    )}
                  </Button>
                </div>
              </Field>
              <p className="text-[11px] leading-4 text-muted-foreground">
                Active browsers continue running if you lower the limit. The new
                limit applies to tasks waiting to start.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Local connection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground">Backend port</div>
              <div className="rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs">
                {runtime ? new URL(API).port || "80" : "—"}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => setShowConnectionDetails((value) => !value)}
              >
                {showConnectionDetails ? "Hide details" : "Show details"}
              </Button>
              {showConnectionDetails && (
                <div className="rounded-md border bg-muted/30 p-3 text-[10px] leading-4 break-all">
                  <div className="font-mono">API: {API}</div>
                  <div className="mt-2 border-t pt-2">
                    <div className="font-semibold">Backend log</div>
                    <div className="mt-1 font-mono text-muted-foreground">
                      {runtime?.diagnostics_log_path || "Unavailable"}
                    </div>
                  </div>
                  {connectionError && (
                    <div role="alert" className="mt-2 border-t border-destructive/30 pt-2 text-destructive">
                      {connectionError}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </aside>

        <section className="min-w-0">
          {flash && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm"
            >
              {flash}
            </div>
          )}

          {page === "overview" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  Operations
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Monitor workers and launch new TTD browser runs.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Metric
                  icon={Server}
                  label="Backend"
                  value={health ? "Online" : "Offline"}
                  sub={
                    health
                      ? `Port ${new URL(API).port || 80}`
                      : "Waiting for FastAPI"
                  }
                />
                <Metric
                  icon={Monitor}
                  label="Active browsers"
                  value={String(health?.active ?? 0)}
                  sub={health ? `of ${health.max_concurrent} slots` : "—"}
                />
                <Metric
                  icon={Gauge}
                  label="Queued"
                  value={String(health?.queue_size ?? 0)}
                  sub="Pending tasks"
                />
                <Metric
                  icon={CircleAlert}
                  label="Failed"
                  value={String(failedTasks)}
                  sub="Recent task history"
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Recent tasks</CardTitle>
                  <CardDescription>
                    Click a task to inspect its console log.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[360px] overflow-y-auto">
                    <TaskTable
                      tasks={tasks.slice(0, 8)}
                      selectedTaskId={selectedTaskId}
                      onSelect={(id) => {
                        setSelectedTaskId(id);
                        setPage("tasks");
                      }}
                      onCancel={cancelTask}
                      onShowBrowser={showBrowser}
                    />
                  </div>                  
                </CardContent>
              </Card>
            </div>
          )}

          {page === "new" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  New run
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Launch manual browser instances or fully automated account
                  bookings.
                </p>
              </div>

              <Tabs
                value={mode}
                onValueChange={(value) => setMode(value as "manual" | "auto")}
              >
                <TabsList>
                  <TabsTrigger value="auto">Automated bookings</TabsTrigger>
                  <TabsTrigger value="manual">Manual instances</TabsTrigger>
                </TabsList>

                <TabsContent value="manual" className="mt-4 space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Manual browser instances</CardTitle>
                      <CardDescription>
                        Launch visible browser windows, fill every instance
                        manually, then use the Tasks page to start the release
                        wait explicitly.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="max-w-sm">
                        <Field label="Instances">
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            value={manualCount}
                            onChange={(event) =>
                              setManualCount(event.target.value)
                            }
                          />
                        </Field>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border p-4">
                        <div>
                          <div className="text-sm font-medium">
                            Headless browser
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Normally disabled so you can operate the form.
                          </div>
                        </div>
                        <Switch
                          checked={manualHeadless}
                          onCheckedChange={setManualHeadless}
                        />
                      </div>
                      <Button
                        onClick={() => void submit()}
                        disabled={submitting || !health}
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Starting…
                          </>
                        ) : (
                          <>
                            Launch {manualCount || 0} instance
                            {Number(manualCount) === 1 ? "" : "s"}
                            <Plus className="ml-2 h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="auto" className="mt-4 space-y-4">
                  {bookings.map((booking, index) => (
                    <BookingEditor
                      key={index}
                      index={index}
                      booking={booking}
                      errors={formErrors}
                      onChange={(next) =>
                        setBookings((all) =>
                          all.map((item, itemIndex) =>
                            itemIndex === index ? next : item,
                          ),
                        )
                      }
                      onRemove={() =>
                        setBookings((all) =>
                          all.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      canRemove={bookings.length > 1}
                    />
                  ))}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setBookings((all) => [...all, emptyBooking()])
                      }
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add booking
                    </Button>
                    <Button
                      onClick={() => void submit()}
                      disabled={submitting || !health}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Starting…
                        </>
                      ) : (
                        <>
                          Queue {bookings.length} booking
                          {bookings.length === 1 ? "" : "s"}
                          <Bot className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Future bookings can target multiple Darshan dates. The
                    worker waits until any target becomes available; forced
                    selection is available for testing.
                  </p>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {page === "tasks" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Track queued, running, completed, failed, and cancelled jobs.
                </p>
              </div>

              {manualReleaseId && !manualReleaseTriggered && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Manual instances are ready
                    </CardTitle>
                    <CardDescription>
                      Fill in every browser instance first. Nothing will start
                      waiting for the portal release time until you press the
                      button below.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      onClick={() => void releaseManualBatch()}
                      disabled={manualReleaseSubmitting || !health}
                      className="w-full sm:w-auto"
                    >
                      {manualReleaseSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Releasing…
                        </>
                      ) : (
                        <>
                          Done — Start Release Wait
                          <CheckCircle2 className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="p-0">
                  <div className="h-[400px] overflow-y-auto">
                    <TaskTable
                      tasks={tasks}
                      selectedTaskId={selectedTaskId}
                      onSelect={setSelectedTaskId}
                      onCancel={cancelTask}
                      onShowBrowser={showBrowser}
                    />
                  </div>
                </CardContent>
              </Card>
              {selectedTask && (
                <TaskDetails
                  task={selectedTask}
                  logs={taskLogs}
                  api={API}
                  apiKey={runtime?.api_key || ""}
                  onShowBrowser={showBrowser}
                  onCancel={cancelTask}
                />
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">{label}</div>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="text-2xl font-semibold">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

function TaskTable({
  tasks,
  selectedTaskId,
  onSelect,
  onCancel,
  onShowBrowser,
  roomy = false,
}: {
  tasks: Task[];
  selectedTaskId: string | null;
  onSelect: (id: string) => void;
  onCancel: (id: string) => void;
  onShowBrowser: (id: string) => void;
  roomy?: boolean;
}) {
  if (!tasks.length)
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No tasks yet.
      </div>
    );

  return (
    <div className={cn("divide-y", roomy && "min-h-[420px]")}>
      {tasks.map((task) => {
        const browserLikelyAvailable = task.status === "RUNNING";
        return (
          <div
            key={task.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(task.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") onSelect(task.id);
            }}
            className={cn(
              "cursor-pointer px-5 py-4 transition hover:bg-muted/30",
              selectedTaskId === task.id && "bg-muted/40",
            )}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {task.id.slice(0, 12)}
                  </span>
                  <Badge variant={statusVariant(task.status)}>
                    {task.status}
                  </Badge>
                  {task.booking_type && (
                    <Badge variant="outline">{task.booking_type}</Badge>
                  )}
                  {task.captcha_required && (
                    <Badge variant="destructive">CAPTCHA review</Badge>
                  )}
                  {task.worker_id && (
                    <span className="text-[11px] text-muted-foreground">
                      worker {task.worker_id}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm">
                  {task.type} task
                  {task.pilgrim_count
                    ? ` · ${task.pilgrim_count} pilgrim${task.pilgrim_count === 1 ? "" : "s"}`
                    : ""}
                </div>
                {task.booking_type === "future" && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {task.future_booking_date
                      ? `Selected ${task.future_booking_date}`
                      : `Waiting for ${task.future_booking_dates.join(", ") || "selected dates"}`}
                    {task.future_booking_forced ? " · forced test mode" : ""}
                    {task.additional_laddus != null
                      ? ` · +${task.additional_laddus} laddus`
                      : ""}
                  </div>
                )}
                {task.error && (
                  <div className="mt-1 text-xs text-red-300">{task.error}</div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="mr-1 text-right text-[11px] text-muted-foreground">
                  {task.started_at
                    ? `Started ${new Date(task.started_at).toLocaleTimeString()}`
                    : `Queued ${new Date(task.created_at).toLocaleTimeString()}`}
                </div>
                {browserLikelyAvailable && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      void onShowBrowser(task.id);
                    }}
                  >
                    <Monitor className="mr-2 h-3.5 w-3.5" />
                    Show browser
                  </Button>
                )}
                {["PENDING", "RUNNING"].includes(task.status) && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      void onCancel(task.id);
                    }}
                  >
                    <XCircle className="mr-2 h-3.5 w-3.5" />
                    Kill
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskDetails({
  task,
  logs,
  api,
  apiKey,
  onShowBrowser,
  onCancel,
}: {
  task: Task;
  logs: string[];
  api: string;
  apiKey: string;
  onShowBrowser: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const [captcha, setCaptcha] = useState<CaptchaState | null>(null);
  const [captchaValue, setCaptchaValue] = useState("");
  const [captchaSubmitting, setCaptchaSubmitting] = useState(false);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const consoleRef = useRef<HTMLPreElement | null>(null);
  const resultSuccess =
    typeof task.result?.success === "boolean" ? task.result.success : undefined;

  useEffect(() => {
    if (task.booking_type !== "current" || task.status !== "RUNNING") {
      setCaptcha(null);
      setCaptchaValue("");
      setCaptchaError(null);
      return;
    }

    let cancelled = false;
    let initialized = false;
    let interval: number | null = null;

    const loadCaptcha = async () => {
      try {
        const response = await fetch(`${api}/tasks/${task.id}/captcha`, {
          headers: apiKey ? { "X-API-Key": apiKey } : undefined,
        });
        if (!response.ok) return;
        const payload: CaptchaState = await response.json();
        if (cancelled) return;
        setCaptcha(payload);
        if (!initialized) {
          setCaptchaValue(payload.ocr_text || "");
          initialized = true;
        }
        if (
          !payload.required &&
          payload.status === "submitted" &&
          interval !== null
        ) {
          window.clearInterval(interval);
          interval = null;
        }
      } catch {
        if (!cancelled) setCaptchaError("Unable to load CAPTCHA state.");
      }
    };

    void loadCaptcha();
    interval = window.setInterval(() => void loadCaptcha(), 1000);
    return () => {
      cancelled = true;
      if (interval !== null) window.clearInterval(interval);
    };
  }, [api, apiKey, task.id, task.booking_type, task.status]);

  async function submitCaptcha() {
    if (!captchaValue.trim()) {
      setCaptchaError("Enter the CAPTCHA before continuing.");
      return;
    }
    setCaptchaSubmitting(true);
    setCaptchaError(null);
    try {
      const response = await fetch(`${api}/tasks/${task.id}/captcha`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "X-API-Key": apiKey } : {}),
        },
        body: JSON.stringify({ value: captchaValue.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof payload?.detail === "string"
            ? payload.detail
            : `Unable to submit CAPTCHA (${response.status})`;
        throw new Error(message);
      }
      setCaptcha(payload);
    } catch (error) {
      setCaptchaError(
        error instanceof Error ? error.message : "Unable to submit CAPTCHA",
      );
    } finally {
      setCaptchaSubmitting(false);
    }
  }

  useEffect(() => {
    if (!autoScroll || !consoleRef.current) return;

    const element = consoleRef.current;
    const frame = window.requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [logs, autoScroll]);

  const reviewRequired = captcha ? captcha.required : task.captcha_required;
  const ocrLengthValid = Boolean(
    captcha?.ocr_text && captcha.ocr_text.length === 6,
  );
  const exhausted = Boolean(
    captcha && captcha.attempts >= captcha.max_attempts && !ocrLengthValid,
  );

  return (
    <div className="space-y-4">
      {(task.captcha_required || captcha?.available) && (
        <Card
          className={cn(
            "border-primary/30 bg-primary/5",
            reviewRequired && "border-amber-400/40 bg-amber-400/5",
          )}
        >
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CircleAlert className="h-4 w-4" />
                  CAPTCHA verification
                </CardTitle>
                <CardDescription className="mt-1">
                  {exhausted
                    ? "Automatic OCR attempts were exhausted. Enter the CAPTCHA shown below and submit it to continue."
                    : reviewRequired
                      ? "Verify the CAPTCHA visually. Correct the OCR suggestion when necessary, then submit it to continue."
                      : "The CAPTCHA has been captured from the booking browser."}
                </CardDescription>
              </div>
              {captcha && captcha.attempts > 0 && (
                <Badge variant={exhausted ? "destructive" : "outline"}>
                  {captcha.attempts}/{captcha.max_attempts} OCR attempts
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)] md:items-start">
              <div className="rounded-lg border bg-background p-3">
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  CAPTCHA image
                </div>
                {captcha?.image_base64 ? (
                  <img
                    src={`data:image/png;base64,${captcha.image_base64}`}
                    alt="Current booking CAPTCHA"
                    className="h-auto min-h-20 max-h-40 w-full rounded-md bg-white object-contain p-2"
                  />
                ) : (
                  <div className="flex min-h-20 items-center justify-center rounded-md bg-muted/30 px-3 text-center text-xs text-muted-foreground">
                    Waiting for the CAPTCHA image from the browser…
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <Label htmlFor={`captcha-${task.id}`}>OCR suggestion</Label>
                  <Input
                    id={`captcha-${task.id}`}
                    value={captchaValue}
                    onChange={(event) =>
                      setCaptchaValue(
                        event.target.value.toUpperCase().slice(0, 6),
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && reviewRequired) {
                        event.preventDefault();
                        void submitCaptcha();
                      }
                    }}
                    placeholder={captcha?.ocr_text || "Enter CAPTCHA"}
                    maxLength={6}
                    autoComplete="off"
                    autoFocus={reviewRequired}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    The value is prefilled from OCR when available. Please check
                    every character; OCR can confuse similar characters such as
                    Q/O or I/1.
                  </p>
                </div>

                {captchaError && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {captchaError}
                  </div>
                )}

                <Button
                  onClick={() => void submitCaptcha()}
                  disabled={
                    captchaSubmitting ||
                    !captcha ||
                    captcha.status === "submitted" ||
                    captchaValue.trim().length !== 6
                  }
                >
                  {captchaSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  {captchaSubmitting
                    ? "Submitting…"
                    : "Verify CAPTCHA & continue"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="font-mono text-base">{task.id}</CardTitle>
              <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant={statusVariant(task.status)}>
                  {task.status}
                </Badge>
                {task.booking_type && (
                  <Badge variant="outline">{task.booking_type}</Badge>
                )}
                {task.captcha_required && (
                  <Badge variant="destructive">Waiting for CAPTCHA</Badge>
                )}
                {task.worker_id && <span>worker {task.worker_id}</span>}
                {resultSuccess === false && (
                  <span>Browser retained for inspection</span>
                )}
              </CardDescription>
            </div>
            {task.status === "RUNNING" && (
              <div className="flex gap-2">
                <Button onClick={() => void onShowBrowser(task.id)}>
                  <Monitor className="mr-2 h-4 w-4" />
                  Show browser
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void onCancel(task.id)}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Kill task
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat
              label="Created"
              value={new Date(task.created_at).toLocaleString()}
            />
            <Stat
              label="Started"
              value={
                task.started_at
                  ? new Date(task.started_at).toLocaleString()
                  : "—"
              }
            />
            <Stat
              label="Completed"
              value={
                task.completed_at
                  ? new Date(task.completed_at).toLocaleString()
                  : "—"
              }
            />
            <Stat
              label="Pilgrims"
              value={
                task.pilgrim_count == null ? "—" : String(task.pilgrim_count)
              }
            />
          </div>
          <Separator />
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-sm font-medium">Console</div>
              <div className="flex items-center gap-2">
                <div className="text-[11px] text-muted-foreground">
                  {logs.length} lines
                </div>
                <div className="flex items-center gap-2">
                  <Separator orientation="vertical" />
                  <Switch
                    checked={autoScroll}
                    onCheckedChange={setAutoScroll}
                    aria-label="Toggle automatic scrolling"
                  />
                  <span className="text-xs text-muted-foreground">
                    Auto-scroll
                  </span>
                </div>
              </div>
            </div>
            <pre
              ref={consoleRef}
              className="h-[420px] w-full overflow-auto rounded-lg border bg-black/60 p-4 text-xs leading-5 text-foreground"
            >
              {logs.length ? logs.join("\n") : "Waiting for task output…"}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-xs">{value}</div>
    </div>
  );
}

function BookingEditor({
  index,
  booking,
  errors,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  booking: Booking;
  errors: FieldErrors;
  onChange: (booking: Booking) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const update = (patch: Partial<Booking>) =>
    onChange({ ...booking, ...patch });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Booking {index + 1}</CardTitle>
          <CardDescription>One account and one booking.</CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={!canRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-5">
          <Field
            label="Username"
            error={errors[`body.bookings.${index}.username`]}
          >
            <Input
            id="username"
              value={booking.username}
              onChange={(event) => update({ username: event.target.value })}
              autoComplete="off"
            />
          </Field>
          <Field
            label="Password"
            error={errors[`body.bookings.${index}.password`]}
          >
            <Input
              id="password"
              type="password"
              value={booking.password}
              onChange={(event) => update({ password: event.target.value })}
              autoComplete="new-password"
            />
          </Field>
          <Field
            label="Booking strategy"
            error={errors[`body.bookings.${index}.booking_strategy`]}
          >
            <select
              className="flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              id="booking_strategy"
              value={booking.booking_strategy}
              onChange={(event) =>
                update({ booking_strategy: event.target.value as BookingStrategy })
              }
            >
              <option value="browser">Fully browser-based</option>
              <option value="http_payload" disabled={booking.booking_type === "future"}>
                HTTP payload + Razorpay
              </option>
            </select>
          </Field>
          <Field
            label="Donation"
            error={errors[`body.bookings.${index}.donation`]}
          >
            <Input
              id="donation"
              type="number"
              min={10000}
              step={10000}
              value={booking.donation}
              onChange={(event) => update({ donation: event.target.value })}
            />
          </Field>
          <Field
            label="Booking type"
            error={errors[`body.bookings.${index}.booking_type`]}
          >
            <select
              className="flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              id="booking_type"
              value={booking.booking_type}
              onChange={(event) => {
                const bookingType = event.target.value as BookingType;
                update({
                  booking_type: bookingType,
                  booking_strategy:
                    bookingType === "future" ? "browser" : booking.booking_strategy,
                });
              }}
            >
              <option id="current" value="current">Current booking</option>
              <option id="future" value="future">Future booking</option>
            </select>
          </Field>
        </div>

        {booking.booking_strategy === "http_payload" && (
          <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground">
              Uses TTD's HTTP booking flow, then opens Razorpay in the visible browser. Current-day only;
              payment remains manual. NTP mode needs outbound UDP port 123 access.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                label="Release clock source"
                error={errors[`body.bookings.${index}.clock_source`]}
              >
                <select
                  className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={booking.clock_source}
                  onChange={(event) => update({ clock_source: event.target.value as ClockSource })}
                >
                  <option value="ttd">TTD server clock</option>
                  <option value="ntp">NTP</option>
                  <option value="both">NTP + TTD cross-check</option>
                </select>
              </Field>
              <Field
                label="Continue attempts"
                error={errors[`body.bookings.${index}.continue_attempts`]}
              >
                <Input
                  type="number"
                  min={1}
                  max={5}
                  step={1}
                  value={booking.continue_attempts}
                  onChange={(event) => update({ continue_attempts: event.target.value })}
                />
              </Field>
              <Field
                label="Booking attempts"
                error={errors[`body.bookings.${index}.booking_attempts`]}
              >
                <Input
                  type="number"
                  min={1}
                  max={3}
                  step={1}
                  value={booking.booking_attempts}
                  onChange={(event) => update({ booking_attempts: event.target.value })}
                />
              </Field>
              <Field
                label="Attempt stagger (seconds)"
                error={errors[`body.bookings.${index}.attempt_stagger_seconds`]}
              >
                <Input
                  type="number"
                  min={0}
                  max={2}
                  step={0.05}
                  value={booking.attempt_stagger_seconds}
                  onChange={(event) => update({ attempt_stagger_seconds: event.target.value })}
                />
              </Field>
              {booking.clock_source !== "ttd" && (
                <>
                  <Field
                    label="NTP servers (comma-separated)"
                    error={errors[`body.bookings.${index}.ntp_servers`]}
                  >
                    <Input
                      value={booking.ntp_servers}
                      onChange={(event) => update({ ntp_servers: event.target.value })}
                      placeholder="time.google.com"
                    />
                  </Field>
                  <Field
                    label="NTP timeout (seconds)"
                    error={errors[`body.bookings.${index}.ntp_timeout_seconds`]}
                  >
                    <Input
                      type="number"
                      min={0.1}
                      max={10}
                      step={0.1}
                      value={booking.ntp_timeout_seconds}
                      onChange={(event) => update({ ntp_timeout_seconds: event.target.value })}
                    />
                  </Field>
                </>
              )}
            </div>
            <p className="text-xs text-amber-200">
              Warning: concurrent booking attempts can create duplicate TTD orders. If logs report more
              than one successful booking response, check TTD booking/payment history before retrying.
              Cancellation of a losing request cannot roll back server-side processing.
            </p>
          </div>
        )}

        {booking.booking_type === "current" && (
          <div className="rounded-lg border border-amber-400/40 bg-amber-400/5 p-3 text-xs text-amber-100">
            <div className="flex gap-2">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <span className="font-medium">CAPTCHA verification:</span> the
                browser CAPTCHA will be shown in the Tasks view for each current
                booking. Please visually verify every CAPTCHA before continuing;
                OCR is only a suggestion and may confuse characters such as Q/O
                or I/1.
              </div>
            </div>
          </div>
        )}

        {booking.booking_type === "future" && (
          <FutureBookingOptions
            booking={booking}
            index={index}
            errors={errors}
            onChange={update}
          />
        )}

        <Separator />
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Pilgrims</div>
            <div className="text-xs text-muted-foreground">
              Up to four per booking, subject to the donation amount.
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={booking.pilgrims.length >= 4}
            onClick={() =>
              update({ pilgrims: [...booking.pilgrims, emptyPilgrim()] })
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Add pilgrim
          </Button>
        </div>
        <div className="space-y-4">
          {booking.pilgrims.map((pilgrim, pilgrimIndex) => (
            <PilgrimEditor
              key={pilgrimIndex}
              index={pilgrimIndex}
              pilgrim={pilgrim}
              onChange={(next) =>
                update({
                  pilgrims: booking.pilgrims.map((item, itemIndex) =>
                    itemIndex === pilgrimIndex ? next : item,
                  ),
                })
              }
              onRemove={() =>
                update({
                  pilgrims: booking.pilgrims.filter(
                    (_, itemIndex) => itemIndex !== pilgrimIndex,
                  ),
                })
              }
              canRemove={booking.pilgrims.length > 1}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function FutureBookingOptions({
  booking,
  index,
  errors,
  onChange,
}: {
  booking: Booking;
  index: number;
  errors: FieldErrors;
  onChange: (patch: Partial<Booking>) => void;
}) {
  const [draftDates, setDraftDates] = useState<string[]>(
    booking.future_booking_dates,
  );

  useEffect(() => {
    setDraftDates(booking.future_booking_dates);
  }, [booking.future_booking_dates]);

  const tomorrow = parseDateInput(addDays(1));
  const selectedDates = draftDates.map(parseDateInput);
  const dateError = errors[`body.bookings.${index}.future_booking_dates`];

  const updateDraftDates = (next: Date[] | undefined) => {
    const nextDates = next ?? [];
    const current = draftDates;
    const nextKeys = new Set(nextDates.map(formatDateInput));
    const retained = current.filter((value) => nextKeys.has(value));
    const retainedSet = new Set(retained);
    const added = nextDates
      .map(formatDateInput)
      .filter((value) => !retainedSet.has(value));
    setDraftDates([...retained, ...added]);
  };

  const applyDates = () => {
    onChange({ future_booking_dates: draftDates });
  };

  const clearDates = () => {
    setDraftDates([]);
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Gauge className="h-4 w-4" />
            Future booking options
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Select one or more preferred Darshan dates, then apply the
            selection.
          </p>
        </div>
        <Badge variant="outline">{draftDates.length} selected</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-lg border bg-background">
          <Calendar
            mode="multiple"
            selected={selectedDates}
            onSelect={updateDraftDates}
            disabled={{ before: tomorrow }}
            defaultMonth={selectedDates[0] || tomorrow}
            numberOfMonths={1}
            className="mx-auto"
          />
        </div>

        <div className="space-y-4">
          <Field label="Selected Darshan dates" error={dateError}>
            <div className="min-h-10 rounded-md border bg-background p-2">
              {draftDates.length ? (
                <div className="flex flex-wrap gap-2">
                  {draftDates.map((date, position) => (
                    <Badge
                      key={date}
                      variant="secondary"
                      className="gap-1 py-1"
                    >
                      <span className="font-mono text-[11px]">
                        {position + 1}.
                      </span>
                      {date}
                      <button
                        type="button"
                        className="ml-1 rounded-full px-1 text-muted-foreground hover:bg-background/60 hover:text-foreground"
                        onClick={() =>
                          setDraftDates((all) =>
                            all.filter((item) => item !== date),
                          )
                        }
                        aria-label={`Remove ${date}`}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="px-1 py-1 text-xs text-muted-foreground">
                  No dates selected.
                </div>
              )}
            </div>
          </Field>

          <Field
            label="Additional laddus"
            error={errors[`body.bookings.${index}.additional_laddus`]}
          >
            <Input
              type="number"
              min={1}
              max={999}
              value={booking.additional_laddus}
              placeholder="1–999"
              onChange={(event) =>
                onChange({ additional_laddus: event.target.value })
              }
            />
          </Field>

          <div className="rounded-lg border bg-background/50 p-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium">
                  Forced calendar selection
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Testing only. Ignores available/booked/unreleased status and
                  clicks the requested day directly.
                </p>
              </div>
              <Switch
                checked={booking.future_booking_forced}
                onCheckedChange={(checked) =>
                  onChange({ future_booking_forced: checked })
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={applyDates}
              disabled={!draftDates.length}
            >
              Apply dates
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={clearDates}
              disabled={!draftDates.length}
            >
              Clear selection
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            The order shown above is the preference order sent to the worker. In
            normal mode, it waits until one of those dates becomes available and
            selects the first available date in that order.
          </p>
        </div>
      </div>
    </div>
  );
}

function PilgrimEditor({
  index,
  pilgrim,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  pilgrim: Pilgrim;
  onChange: (p: Pilgrim) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const update = (patch: Partial<Pilgrim>) =>
    onChange({ ...pilgrim, ...patch });
  return (
    <div className="rounded-lg border bg-background/50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Users className="mr-2 inline h-3.5 w-3.5" />
          Pilgrim {index + 1}
        </div>
        {canRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Remove
          </Button>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Field label="Name" className="xl:col-span-2">
          <Input
            id={`name_${index + 1}`}
            value={pilgrim.name}
            onChange={(event) => update({ name: event.target.value })}
          />
        </Field>
        <Field label="Age">
          <Input
            id={`age_${index + 1}`}
            type="number"
            min={1}
            max={120}
            value={pilgrim.age}
            onChange={(event) => update({ age: event.target.value })}
          />
        </Field>
        <Field label="Gender">
          <select
            id={`gender_${index + 1}`}
            className="flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            value={pilgrim.gender}
            onChange={(event) =>
              update({ gender: event.target.value as Pilgrim["gender"] })
            }
          >
            <option value="M">Male</option>
            <option value="F">Female</option>
            <option value="T">Transgender</option>
          </select>
        </Field>
        <Field label="ID type">
          <select
            id={`id_${index + 1}`}
            className="flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            value={pilgrim.id_type}
            onChange={(event) =>
              update({ id_type: event.target.value as Pilgrim["id_type"] })
            }
          >
            <option value="Aadhaar Card">Aadhaar Card</option>
            <option value="Passport">Passport</option>
          </select>
        </Field>
        <Field label="ID number" className="xl:col-span-2">
          <Input
            id={`doc_${index + 1}`}
            value={pilgrim.id_doc_number}
            onChange={(event) => update({ id_doc_number: event.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  className,
  children,
  error,
}: {
  label: string;
  className?: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export default App;
