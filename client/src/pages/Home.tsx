import DashboardLayout from "@/components/DashboardLayout";
import CertificateManager from "@/components/CertificateManager";
import TelegramRecipientManager from "@/components/TelegramRecipientManager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { countExcludedCountdowns, getProductCountdowns } from "@/lib/countdown";
import { AlertTriangle, BellOff, BellRing, CalendarClock, CheckCircle2, ClipboardCheck, Loader2, MessageCircle, PauseCircle, Play, PlayCircle, Plus, Save, Send, Settings2, Square, WandSparkles } from "lucide-react";
import React, { lazy, Suspense, useMemo, useState } from "react";
import { toast } from "sonner";

type Status = "pending" | "safe" | "urgent" | "overdue" | "stopped" | "paused";
const InspectionInsights = lazy(() => import("@/components/InspectionInsights"));

const statusMeta: Record<Status, { label: string; className: string }> = {
  pending: { label: "입력 대기", className: "bg-slate-100 text-slate-600 border-slate-200" },
  safe: { label: "여유 있음", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  urgent: { label: "사전 알림", className: "bg-amber-50 text-amber-700 border-amber-200" },
  overdue: { label: "기간 초과", className: "bg-red-50 text-red-700 border-red-200" },
  stopped: { label: "생산 중단", className: "bg-slate-100 text-slate-600 border-slate-300" },
  paused: { label: "알림 일시 중지", className: "bg-violet-50 text-violet-700 border-violet-200" },
};

function dateText(iso: string | null) {
  if (!iso) return "-";
  const [year, month, day] = iso.split("-");
  return `${year}. ${Number(month)}. ${Number(day)}.`;
}

function dDayText(days: number | null) {
  if (days === null) return "-";
  if (days < 0) return `${Math.abs(days)}일 초과`;
  if (days === 0) return "오늘 마감";
  return `D-${days}`;
}

/**
 * All content in this page are only for example, replace with your own feature implementation
 * When building pages, remember your instructions in Frontend Workflow, Frontend Best Practices, Design Guide and Common Pitfalls
 */
export default function Home() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", intervalMonths: "2", lastManufactureDate: "", testItems: "" });
  const [stopTarget, setStopTarget] = useState<{ id: number; name: string } | null>(null);
  const [resumeTarget, setResumeTarget] = useState<{ id: number; name: string } | null>(null);
  const [stopReason, setStopReason] = useState("");
  const [resumeManufactureDate, setResumeManufactureDate] = useState("");
  const [typePauseTarget, setTypePauseTarget] = useState<{ id: number; name: string } | null>(null);
  const [typePauseReason, setTypePauseReason] = useState("");
  const [globalPauseOpen, setGlobalPauseOpen] = useState(false);
  const [globalPauseReason, setGlobalPauseReason] = useState("");
  const { data, isLoading, isError, error, refetch } = trpc.qualityScheduler.dashboard.useQuery(undefined, { enabled: isAuthenticated });
  const updateItem = trpc.qualityScheduler.updateInspectionType.useMutation({
    onSuccess: () => utils.qualityScheduler.dashboard.invalidate(),
    onError: error => toast.error(error.message),
  });
  const createItem = trpc.qualityScheduler.createInspectionType.useMutation({
    onSuccess: () => {
      utils.qualityScheduler.dashboard.invalidate();
      setAddOpen(false);
      setNewItem({ name: "", intervalMonths: "2", lastManufactureDate: "", testItems: "" });
      toast.success("검사 유형을 추가했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const updateSettings = trpc.qualityScheduler.updateSettings.useMutation({
    onSuccess: () => {
      utils.qualityScheduler.dashboard.invalidate();
      setSettingsOpen(false);
      toast.success("알림 설정을 저장했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const stopProduction = trpc.qualityScheduler.stopProduction.useMutation({
    onSuccess: () => {
      utils.qualityScheduler.dashboard.invalidate();
      setStopTarget(null);
      setStopReason("");
      toast.success("생산 중단으로 처리해 이 식품유형의 자동 알림을 멈췄습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const resumeProduction = trpc.qualityScheduler.resumeProduction.useMutation({
    onSuccess: () => {
      utils.qualityScheduler.dashboard.invalidate();
      setResumeTarget(null);
      setResumeManufactureDate("");
      toast.success("재생산 제조일 기준으로 검사 일정과 자동 알림을 다시 시작했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const setInspectionAlertPause = trpc.qualityScheduler.setInspectionAlertPause.useMutation({
    onSuccess: (_, input) => {
      utils.qualityScheduler.dashboard.invalidate();
      setTypePauseTarget(null);
      setTypePauseReason("");
      toast.success(input.paused ? "이 유형의 텔레그램 알림을 일시 중지했습니다." : "이 유형의 텔레그램 알림을 다시 시작했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const setGlobalAlertPause = trpc.qualityScheduler.setGlobalAlertPause.useMutation({
    onSuccess: (_, input) => {
      utils.qualityScheduler.dashboard.invalidate();
      setGlobalPauseOpen(false);
      setGlobalPauseReason("");
      toast.success(input.paused ? "전체 텔레그램 알림을 일시 중지했습니다." : "전체 텔레그램 알림을 다시 시작했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const connectTelegramGroup = trpc.qualityScheduler.connectTelegramGroup.useMutation({
    onSuccess: () => {
      utils.qualityScheduler.dashboard.invalidate();
      toast.success("텔레그램 알림 그룹을 연결했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const detectTelegramGroups = trpc.qualityScheduler.detectTelegramGroups.useQuery(undefined, { enabled: false, retry: false });
  const sendTestNotification = trpc.qualityScheduler.sendTestNotification.useMutation({
    onSuccess: result => {
      utils.qualityScheduler.dashboard.invalidate();
      toast.success(result.recipientCount ? `${result.recipientCount}개 담당자 그룹으로 시험 알림을 발송했습니다.` : "텔레그램으로 시험 알림을 발송했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const setAutomationSchedule = trpc.qualityScheduler.setAutomationSchedule.useMutation({
    onSuccess: result => {
      utils.qualityScheduler.dashboard.invalidate();
      toast.success(result.settings.automationConfigured ? "설정한 시간대 자동 알림을 시작했습니다." : "자동 알림을 중지했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const generateMonthlyReport = trpc.qualityScheduler.generateMonthlyReport.useMutation({
    onSuccess: result => {
      toast.success("월간 PDF 보고서를 생성했습니다.");
      window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
    },
    onError: error => toast.error(error.message),
  });
  const handleTelegramGroupDetection = async () => {
    const result = await detectTelegramGroups.refetch();
    const groups = result.data ?? [];
    const preferred = groups.find(group => group.title.includes("코엔에프 품질 알림")) ?? groups[0];
    if (!preferred) return toast.error("봇이 포함된 텔레그램 그룹을 찾지 못했습니다.");
    connectTelegramGroup.mutate({ chatId: preferred.chatId });
  };

  const summary = useMemo(() => {
    const schedules = data?.schedules ?? [];
    return {
      total: schedules.length,
      overdue: schedules.filter(item => item.status === "overdue").length,
      urgent: schedules.filter(item => item.status === "urgent").length,
      pending: schedules.filter(item => item.status === "pending").length,
      stopped: schedules.filter(item => item.status === "stopped").length,
      paused: schedules.filter(item => item.status === "paused").length,
    };
  }, [data?.schedules]);

  const productCountdowns = useMemo(() => {
    return getProductCountdowns(data?.productSchedules ?? []);
  }, [data?.productSchedules]);

  const excludedProductCount = useMemo(() => countExcludedCountdowns(data?.productSchedules ?? []), [data?.productSchedules]);
  const alertTimes = data?.alertTimes?.map(slot => slot.timeKst) ?? [];
  const configuredAlertTimes = alertTimes.length ? alertTimes : [data ? `${data.settings.alertHourKst.toString().padStart(2, "0")}:00` : "09:00"];
  const notificationRecipientName = (recipientId: number | null) => recipientId ? data?.telegramRecipients.find(recipient => recipient.id === recipientId)?.name ?? "담당자 그룹" : "기본 그룹";

  if (!isAuthenticated) return <DashboardLayout><div /></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6 pb-10">
        <section className="rounded-2xl bg-[linear-gradient(115deg,oklch(0.25_0.06_195),oklch(0.4_0.1_190))] px-6 py-7 text-white shadow-lg shadow-teal-950/10 sm:px-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold tracking-[0.16em] text-teal-100"><ClipboardCheck className="h-4 w-4" /> KOENF QUALITY CONTROL</div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">자가품질검사 스케줄러</h1>
              <p className="mt-2 text-sm text-teal-50/90">최근 제조일을 기준으로 검사 마감일을 계산하고 텔레그램으로 알립니다.</p>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-teal-50"><CalendarClock className="h-4 w-4" /> {new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })} 기준</div>
          </div>
        </section>

        {isLoading ? (
          <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
        ) : isError ? (
          <DashboardLoadError message={error.message} onRetry={() => refetch()} />
        ) : !data ? (
          <Card><CardContent className="flex min-h-56 items-center justify-center text-sm text-muted-foreground">일정 정보가 없습니다.</CardContent></Card>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <SummaryCard label="관리 품목" value={summary.total} detail="입력 대기 포함" icon={<ClipboardCheck className="h-5 w-5" />} tone="teal" />
              <SummaryCard label="기간 초과" value={summary.overdue} detail="마감일이 지난 품목" icon={<AlertTriangle className="h-5 w-5" />} tone="red" />
              <SummaryCard label="사전 알림" value={summary.urgent} detail={`마감 ${data.settings.warningDays}일 이내`} icon={<BellRing className="h-5 w-5" />} tone="amber" />
              <SummaryCard label="입력 대기" value={summary.pending} detail="최근 제조일 미입력" icon={<CalendarClock className="h-5 w-5" />} tone="slate" />
              <SummaryCard label="생산 중단" value={summary.stopped} detail="자동 알림 제외" icon={<PauseCircle className="h-5 w-5" />} tone="slate" />
              <SummaryCard label="알림 중지" value={summary.paused} detail="유형별 일시 중지" icon={<BellOff className="h-5 w-5" />} tone="slate" />
            </section>

            <Card className="overflow-hidden border-border/80 shadow-sm">
              <CardHeader className="flex flex-col gap-3 border-b bg-[linear-gradient(120deg,oklch(0.98_0.01_195),white)] sm:flex-row sm:items-center sm:justify-between">
                <div><CardTitle className="flex items-center gap-2 text-lg"><CalendarClock className="h-5 w-5 text-primary" />제품별 검사 만료일 카운트다운</CardTitle><CardDescription className="mt-1">제품별 검사 주기와 최근 제조일을 기준으로 마감이 가까운 순서입니다.</CardDescription></div>
                <Badge variant="outline" className="w-fit border-teal-200 bg-teal-50 text-teal-800">관리 대상 {productCountdowns.length}건</Badge>
              </CardHeader>
              <CardContent className="p-4 sm:p-5">
                {productCountdowns.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{productCountdowns.map(item => {
                  const tone = item.status === "overdue" ? "border-red-200 bg-red-50/70" : item.status === "urgent" ? "border-amber-200 bg-amber-50/70" : "border-emerald-200 bg-emerald-50/60";
                  const ddayTone = item.status === "overdue" ? "text-red-700" : item.status === "urgent" ? "text-amber-700" : "text-emerald-700";
                  return <div key={item.id} className={`flex min-w-0 items-center justify-between gap-3 rounded-xl border p-3.5 ${tone}`}><div className="min-w-0"><p className="truncate text-sm font-bold text-foreground">{item.name}</p><p className="mt-1 truncate text-xs text-muted-foreground">{item.parentTypeName ?? "식품유형 미지정"} · 마감 {dateText(item.nextDeadline)}</p><Badge variant="outline" className={`mt-2 ${statusMeta[item.status].className}`}>{statusMeta[item.status].label}</Badge></div><div className={`shrink-0 text-right ${ddayTone}`}><p className="text-2xl font-black tracking-tight">{dDayText(item.daysRemaining)}</p><p className="mt-1 text-[11px] font-semibold text-current/70">검사 마감</p></div></div>;
                })}</div> : <div className="rounded-xl border border-dashed bg-muted/30 px-5 py-8 text-center"><CalendarClock className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm font-semibold">제품별 제조일을 입력하면 카운트다운이 표시됩니다.</p><p className="mt-1 text-xs text-muted-foreground">생산 중단 또는 알림 일시 중지 제품은 카운트다운에서 제외됩니다.</p></div>}
                {excludedProductCount ? <p className="mt-3 text-xs text-muted-foreground">생산 중단 또는 알림 일시 중지로 제외된 제품: {excludedProductCount}건</p> : null}
              </CardContent>
            </Card>

            <Suspense fallback={<Card className="min-h-80 border-border/80"><CardContent className="flex min-h-80 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />시각화 정보를 불러오는 중입니다.</CardContent></Card>}><InspectionInsights productSchedules={data.productSchedules} certificates={data.certificates} onGenerateMonthlyReport={() => generateMonthlyReport.mutate({})} /></Suspense>

            <section className="grid gap-5 xl:grid-cols-[1fr_330px]">
              <Card className="overflow-hidden border-border/80 shadow-sm">
                <CardHeader className="flex flex-col gap-3 border-b bg-card sm:flex-row sm:items-center sm:justify-between">
                  <div><CardTitle className="text-lg">검사 일정 관리</CardTitle><CardDescription className="mt-1">제조일을 선택하면 다음 검사 마감일이 자동 계산됩니다.</CardDescription></div>
                  <Dialog open={addOpen} onOpenChange={setAddOpen}>
                    <DialogTrigger asChild><Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" />품목 추가</Button></DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>검사 품목 추가</DialogTitle><DialogDescription>추가 품목의 검사주기와 관리 항목을 입력하세요.</DialogDescription></DialogHeader>
                      <div className="grid gap-4 py-2">
                        <Field label="식품 유형"><Input value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} placeholder="예: 고형차" /></Field>
                        <Field label="검사 주기(개월)"><Input type="number" min="1" max="36" value={newItem.intervalMonths} onChange={e => setNewItem({ ...newItem, intervalMonths: e.target.value })} /></Field>
                        <Field label="최근 제조일"><Input type="date" value={newItem.lastManufactureDate} onChange={e => setNewItem({ ...newItem, lastManufactureDate: e.target.value })} /></Field>
                        <Field label="주요 검사항목"><Textarea value={newItem.testItems} onChange={e => setNewItem({ ...newItem, testItems: e.target.value })} placeholder="예: 세균수, 대장균군" /></Field>
                      </div>
                      <DialogFooter><Button onClick={() => createItem.mutate({ name: newItem.name, intervalMonths: Number(newItem.intervalMonths), lastManufactureDate: newItem.lastManufactureDate || null, testItems: newItem.testItems })} disabled={!newItem.name || !newItem.testItems || createItem.isPending}>추가하기</Button></DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow className="bg-muted/45 hover:bg-muted/45"><TableHead>식품 유형</TableHead><TableHead>주기</TableHead><TableHead>최근 제조일</TableHead><TableHead>다음 마감일</TableHead><TableHead>남은 일수</TableHead><TableHead>상태</TableHead><TableHead className="min-w-60">주요 검사항목</TableHead><TableHead>생산 관리</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {data.schedules.map(item => <TableRow key={item.id} className={item.status === "overdue" ? "bg-red-50/35" : item.status === "urgent" ? "bg-amber-50/35" : item.status === "paused" || item.status === "stopped" ? "bg-slate-50/60" : ""}>
                          <TableCell className="font-semibold text-foreground">{item.name}</TableCell>
                          <TableCell className="font-semibold text-primary">{item.intervalMonths}개월</TableCell>
                          <TableCell><Input disabled={item.status === "stopped" || item.status === "paused"} className="h-8 w-36 bg-white" type="date" defaultValue={item.lastManufactureDate ?? ""} onBlur={e => { const nextValue = e.currentTarget.value || null; if (nextValue !== item.lastManufactureDate) updateItem.mutate({ id: item.id, lastManufactureDate: nextValue }); }} /></TableCell>
                          <TableCell className="whitespace-nowrap font-medium">{dateText(item.nextDeadline)}</TableCell>
                          <TableCell className={item.status === "overdue" ? "font-bold text-red-700" : item.status === "urgent" ? "font-bold text-amber-700" : "font-medium text-emerald-700"}>{dDayText(item.daysRemaining)}</TableCell>
                          <TableCell><Badge variant="outline" className={statusMeta[item.status].className}>{statusMeta[item.status].label}</Badge></TableCell>
                          <TableCell className="text-xs leading-5 text-muted-foreground">{item.testItems}</TableCell>
                          <TableCell>{item.status === "stopped" ? <div className="space-y-1"><Button size="sm" variant="outline" className="gap-1" onClick={() => setResumeTarget({ id: item.id, name: item.name })}><PlayCircle className="h-3.5 w-3.5" />재생산</Button><p className="max-w-32 text-[11px] leading-4 text-muted-foreground">{item.productionStopReason ?? "생산 중단 · 알림 제외"}</p></div> : item.status === "paused" ? <div className="space-y-1"><Button size="sm" variant="outline" className="gap-1" disabled={setInspectionAlertPause.isPending} onClick={() => setInspectionAlertPause.mutate({ inspectionTypeId: item.id, paused: false })}><BellRing className="h-3.5 w-3.5" />알림 재개</Button><p className="max-w-32 text-[11px] leading-4 text-muted-foreground">{item.alertPausedAt ? `${dateText(item.alertPausedAt)} · ` : ""}{item.alertPauseReason ?? "알림 일시 중지"}</p></div> : <div className="flex gap-1"><Button size="sm" variant="ghost" className="gap-1 text-muted-foreground hover:text-violet-700" onClick={() => setTypePauseTarget({ id: item.id, name: item.name })}><BellOff className="h-3.5 w-3.5" />알림</Button><Button size="sm" variant="ghost" className="gap-1 text-muted-foreground hover:text-destructive" onClick={() => setStopTarget({ id: item.id, name: item.name })}><PauseCircle className="h-3.5 w-3.5" />생산</Button></div>}</TableCell>
                        </TableRow>)}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-5" id="notifications">
                <Card className="border-border/80 shadow-sm">
                  <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageCircle className="h-4 w-4 text-sky-500" />텔레그램 알림</CardTitle><CardDescription>브라우저가 닫혀 있어도 매일 자동 점검 후 그룹으로 알립니다.</CardDescription></CardHeader>
                  <CardContent className="space-y-4">
                    <div className={`rounded-xl border p-3 ${data.settings.isAlertPaused ? "border-violet-200 bg-violet-50" : "bg-slate-50"}`}><div className="flex items-center gap-2 text-sm font-semibold">{data.settings.isAlertPaused ? <BellOff className="h-4 w-4 text-violet-700" /> : data.settings.telegramConfigured ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}{data.settings.isAlertPaused ? "전체 알림 일시 중지됨" : data.settings.telegramConfigured ? "알림 그룹 연결됨" : "알림 그룹 연결 필요"}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{data.settings.isAlertPaused ? `${data.settings.alertPausedAt ? `${dateText(data.settings.alertPausedAt)}부터 · ` : ""}${data.settings.alertPauseReason ?? "사유 미입력"} · 자동 점검은 유지되며 텔레그램 발송만 중지됩니다.` : data.settings.automationConfigured ? `매일 ${configuredAlertTimes.join(", ")} (KST)에 자동 점검합니다.` : "그룹을 연결한 뒤 자동 알림을 시작할 수 있습니다."}</p></div>
                    {!data.settings.telegramConfigured ? <Button variant="outline" className="w-full gap-2" disabled={detectTelegramGroups.isFetching || connectTelegramGroup.isPending} onClick={handleTelegramGroupDetection}><WandSparkles className="h-4 w-4" />그룹 자동 연결</Button> : <>
                      <Button variant="outline" className="w-full gap-2" disabled={sendTestNotification.isPending} onClick={() => sendTestNotification.mutate()}><Send className="h-4 w-4" />시험 알림 보내기</Button>
                      {data.settings.isAlertPaused ? <Button variant="outline" className="w-full gap-2 border-violet-200 text-violet-800 hover:bg-violet-50" disabled={setGlobalAlertPause.isPending} onClick={() => setGlobalAlertPause.mutate({ paused: false })}><BellRing className="h-4 w-4" />전체 알림 재개</Button> : <Button variant="outline" className="w-full gap-2" onClick={() => setGlobalPauseOpen(true)}><BellOff className="h-4 w-4" />전체 알림 일시 중지</Button>}
                      <Button className="w-full gap-2" variant={data.settings.automationConfigured ? "outline" : "default"} disabled={setAutomationSchedule.isPending} onClick={() => setAutomationSchedule.mutate({ enabled: !data.settings.automationConfigured, times: configuredAlertTimes })}>{data.settings.automationConfigured ? <><Square className="h-4 w-4" />자동 알림 중지</> : <><Play className="h-4 w-4" />설정 시간 알림 시작</>}</Button>
                    </>}
                    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                      <DialogTrigger asChild><Button variant="outline" className="w-full gap-2"><Settings2 className="h-4 w-4" />알림 설정</Button></DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>알림 설정</DialogTitle><DialogDescription>텔레그램 그룹 ID와 자동 알림 기준을 관리합니다.</DialogDescription></DialogHeader>
                        <SettingsForm settings={data.settings} alertTimes={configuredAlertTimes} onSave={async values => { await updateSettings.mutateAsync({ warningDays: values.warningDays, alertHourKst: Number(values.times[0].slice(0, 2)), telegramChatId: values.telegramChatId }); await setAutomationSchedule.mutateAsync({ enabled: data.settings.automationConfigured, times: values.times }); setSettingsOpen(false); toast.success("알림 설정을 저장했습니다."); }} pending={updateSettings.isPending || setAutomationSchedule.isPending} />
                      </DialogContent>
                    </Dialog>
                  </CardContent>
                </Card>
                <TelegramRecipientManager recipients={data.telegramRecipients} inspectionTypes={data.schedules.map(item => ({ id: item.id, name: item.name }))} products={data.products} onChanged={() => utils.qualityScheduler.dashboard.invalidate()} />
                <Card className="border-border/80 shadow-sm">
                  <CardHeader><CardTitle className="text-base">최근 발송 이력</CardTitle><CardDescription>자동 알림 또는 시험 발송 결과입니다.</CardDescription></CardHeader>
                  <CardContent>{data.logs.length ? <div className="space-y-3">{data.logs.slice(0, 5).map(log => <div className="border-l-2 border-primary/50 pl-3 text-xs" key={log.id}><p className="font-semibold text-foreground">{log.alertLevel === "overdue" ? "기간 초과" : log.alertLevel === "urgent" ? "사전 알림" : "시험 발송"} · {log.status === "sent" ? "발송 완료" : log.status === "failed" ? "발송 실패" : "대기"} · {notificationRecipientName(log.recipientId)}</p><p className="mt-1 line-clamp-2 text-muted-foreground">{log.message}</p><p className="mt-1 text-muted-foreground">{new Date(log.createdAt).toLocaleString("ko-KR")}</p></div>)}</div> : <p className="rounded-xl bg-muted/50 px-3 py-7 text-center text-sm text-muted-foreground">발송 이력이 없습니다.</p>}</CardContent>
                </Card>
              </div>
            </section>
            <CertificateManager inspectionTypes={data.schedules.map(item => ({ id: item.id, name: item.name }))} products={data.products} productSchedules={data.productSchedules} certificates={data.certificates} manufactureRecords={data.manufactureRecords} certificateNumberRule={data.certificateNumberRule} onChanged={() => utils.qualityScheduler.dashboard.invalidate()} />
          </>
        )}
      </div>
      <Dialog open={Boolean(stopTarget)} onOpenChange={open => !open && setStopTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>생산 중단 처리</DialogTitle><DialogDescription><b>{stopTarget?.name}</b> 유형의 생산이 없으면 검사 주기와 무관하게 알림에서 제외합니다. 재생산 시 제조일을 다시 등록하면 알림이 재개됩니다.</DialogDescription></DialogHeader>
          <Field label="중단 사유"><Textarea value={stopReason} onChange={event => setStopReason(event.target.value)} placeholder="예: 수주 없음, 계절 품목, 단종 검토" /></Field>
          <DialogFooter><Button variant="outline" onClick={() => setStopTarget(null)}>취소</Button><Button variant="destructive" disabled={!stopTarget || !stopReason || stopProduction.isPending} onClick={() => stopTarget && stopProduction.mutate({ inspectionTypeId: stopTarget.id, reason: stopReason })}>알림 중지</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(resumeTarget)} onOpenChange={open => !open && setResumeTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>재생산 등록</DialogTitle><DialogDescription><b>{resumeTarget?.name}</b> 유형의 최근 제조일을 등록하면 해당 날짜를 기준으로 검사 마감일과 텔레그램 알림이 다시 시작됩니다.</DialogDescription></DialogHeader>
          <Field label="최근 제조일"><Input type="date" value={resumeManufactureDate} onChange={event => setResumeManufactureDate(event.target.value)} /></Field>
          <DialogFooter><Button variant="outline" onClick={() => setResumeTarget(null)}>취소</Button><Button disabled={!resumeTarget || !resumeManufactureDate || resumeProduction.isPending} onClick={() => resumeTarget && resumeProduction.mutate({ inspectionTypeId: resumeTarget.id, lastManufactureDate: resumeManufactureDate })}>일정 재개</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(typePauseTarget)} onOpenChange={open => !open && setTypePauseTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>유형별 알림 일시 중지</DialogTitle><DialogDescription><b>{typePauseTarget?.name}</b> 유형만 검사 마감 계산과 텔레그램 알림에서 일시 제외합니다. 생산 중단과 달리 제품 생산 여부는 유지하며, 필요할 때 즉시 알림을 재개할 수 있습니다.</DialogDescription></DialogHeader>
          <Field label="일시 중지 사유"><Textarea value={typePauseReason} onChange={event => setTypePauseReason(event.target.value)} placeholder="예: 검사 일정 조정, 외주 생산 대기" /></Field>
          <DialogFooter><Button variant="outline" onClick={() => setTypePauseTarget(null)}>취소</Button><Button variant="secondary" disabled={!typePauseTarget || !typePauseReason || setInspectionAlertPause.isPending} onClick={() => typePauseTarget && setInspectionAlertPause.mutate({ inspectionTypeId: typePauseTarget.id, paused: true, reason: typePauseReason })}>알림 일시 중지</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={globalPauseOpen} onOpenChange={setGlobalPauseOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>전체 텔레그램 알림 일시 중지</DialogTitle><DialogDescription>모든 유형의 자동 텔레그램 발송을 일시 중지합니다. 정기 점검 자체는 유지되며, 다시 시작하면 기존 일정 기준으로 즉시 관리됩니다.</DialogDescription></DialogHeader>
          <Field label="일시 중지 사유"><Textarea value={globalPauseReason} onChange={event => setGlobalPauseReason(event.target.value)} placeholder="예: 휴무 기간, 설비 점검, 업무 담당자 부재" /></Field>
          <DialogFooter><Button variant="outline" onClick={() => setGlobalPauseOpen(false)}>취소</Button><Button variant="secondary" disabled={!globalPauseReason || setGlobalAlertPause.isPending} onClick={() => setGlobalAlertPause.mutate({ paused: true, reason: globalPauseReason })}>전체 알림 중지</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

export function DashboardLoadError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return <Card className="border-red-200 bg-red-50/60"><CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 p-6 text-center"><AlertTriangle className="h-7 w-7 text-red-600" /><div><p className="font-semibold text-red-900">일정 정보를 불러오지 못했습니다.</p><p className="mt-1 text-sm text-red-700">{message || "잠시 후 다시 시도해 주세요."}</p></div><Button variant="outline" className="border-red-200 bg-white text-red-800 hover:bg-red-100" onClick={onRetry}>다시 시도</Button></CardContent></Card>;
}

function SummaryCard({ label, value, detail, icon, tone }: { label: string; value: number; detail: string; icon: React.ReactNode; tone: "teal" | "red" | "amber" | "slate" }) {
  const tones = { teal: "border-teal-200 bg-teal-50/80 text-teal-800", red: "border-red-200 bg-red-50/80 text-red-800", amber: "border-amber-200 bg-amber-50/80 text-amber-800", slate: "border-slate-200 bg-slate-50 text-slate-700" };
  return <Card className={`border ${tones[tone]} shadow-none`}><CardContent className="flex items-start justify-between p-5"><div><p className="text-xs font-bold text-current/70">{label}</p><p className="mt-1 text-3xl font-bold tracking-tight">{value}</p><p className="mt-1 text-xs text-current/70">{detail}</p></div><div className="rounded-lg bg-white/70 p-2.5">{icon}</div></CardContent></Card>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label>{label}</Label>{children}</div>;
}

function SettingsForm({ settings, alertTimes, onSave, pending }: { settings: { warningDays: number; alertHourKst: number; telegramChatId: string | null }; alertTimes: string[]; onSave: (values: { warningDays: number; telegramChatId: string | null; times: string[] }) => void | Promise<void>; pending: boolean }) {
  const [warningDays, setWarningDays] = useState(String(settings.warningDays));
  const [telegramChatId, setTelegramChatId] = useState(settings.telegramChatId ?? "");
  const [times, setTimes] = useState(alertTimes);
  const updateTime = (index: number, time: string) => setTimes(current => current.map((item, itemIndex) => itemIndex === index ? time : item));
  return <><div className="grid gap-4 py-4"><Field label="텔레그램 그룹 ID"><Input value={telegramChatId} onChange={e => setTelegramChatId(e.target.value)} placeholder="예: -1234567890" /><p className="text-xs text-muted-foreground">봇 연결 과정에서 자동 확인한 그룹 ID를 입력합니다.</p></Field><Field label="사전 알림(일 전)"><Input type="number" min="1" max="90" value={warningDays} onChange={e => setWarningDays(e.target.value)} /></Field><Field label="자동 발송 시간(KST)"><div className="space-y-2">{times.map((time, index) => <div className="flex gap-2" key={`${time}-${index}`}><Input type="time" value={time} onChange={e => updateTime(index, e.target.value)} /><Button type="button" size="icon" variant="outline" disabled={times.length === 1} onClick={() => setTimes(current => current.filter((_, itemIndex) => itemIndex !== index))}>−</Button></div>)}{times.length < 6 ? <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setTimes(current => [...current, "14:00"])}>+ 시간대 추가</Button> : null}<p className="text-xs text-muted-foreground">최대 6개 시간대를 지정할 수 있습니다. 각 시간대에는 하루 한 번씩 알림을 확인합니다.</p></div></Field></div><DialogFooter><Button className="gap-1.5" disabled={pending || times.some(time => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))} onClick={() => onSave({ warningDays: Number(warningDays), telegramChatId: telegramChatId || null, times: Array.from(new Set(times)).sort() })}><Save className="h-4 w-4" />저장</Button></DialogFooter></>;
}
