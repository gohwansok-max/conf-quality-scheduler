import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  BellRing,
  CalendarDays,
  Download,
  FileText,
  PauseCircle,
  Pencil,
  Plus,
  Share2,
  Upload,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type CertificateForm = {
  employeeName: string;
  department: string;
  issuedAt: string;
  expiresAt: string;
  validityMonths: number;
  warningDays: number;
  memo: string;
};

const today = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const emptyForm = (): CertificateForm => ({
  employeeName: "",
  department: "",
  issuedAt: today(),
  expiresAt: "",
  validityMonths: 12,
  warningDays: 30,
  memo: "",
});

function addMonths(date: string, months: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + months, day))
    .toISOString()
    .slice(0, 10);
}

function statusMeta(status: string) {
  if (status === "overdue")
    return {
      label: "기간 초과",
      className: "border-red-200 bg-red-50 text-red-700",
    };
  if (status === "urgent")
    return {
      label: "만료 임박",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  if (status === "paused")
    return {
      label: "알림 중지",
      className: "border-slate-200 bg-slate-100 text-slate-600",
    };
  if (status === "inactive")
    return {
      label: "재직 제외",
      className: "border-slate-200 bg-slate-100 text-slate-600",
    };
  return {
    label: "유효",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
}

async function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("PDF 파일을 읽지 못했습니다."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(file);
  });
}

export default function HealthCertificates() {
  const utils = trpc.useUtils();
  const { data, isLoading, isError, error, refetch } =
    trpc.healthCertificate.dashboard.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CertificateForm>(emptyForm);
  const [editForm, setEditForm] = useState<CertificateForm>(emptyForm);
  const invalidate = () => utils.healthCertificate.dashboard.invalidate();

  const create = trpc.healthCertificate.create.useMutation({
    onSuccess: () => {
      toast.success("보건증 관리 대상이 등록되었습니다.");
      setCreateOpen(false);
      setForm(emptyForm());
      void invalidate();
    },
    onError: mutationError => toast.error(mutationError.message),
  });
  const update = trpc.healthCertificate.update.useMutation({
    onSuccess: () => {
      toast.success("보건증 담당자 정보가 수정되었습니다.");
      setEditingId(null);
      void invalidate();
    },
    onError: mutationError => toast.error(mutationError.message),
  });
  const upload = trpc.healthCertificate.uploadPdf.useMutation({
    onSuccess: () => {
      toast.success("보건증 PDF를 보관했습니다.");
      void invalidate();
    },
    onError: mutationError => toast.error(mutationError.message),
  });
  const pause = trpc.healthCertificate.setAlertPause.useMutation({
    onSuccess: () => void invalidate(),
    onError: mutationError => toast.error(mutationError.message),
  });
  const employment = trpc.healthCertificate.setEmploymentStatus.useMutation({
    onSuccess: () => void invalidate(),
    onError: mutationError => toast.error(mutationError.message),
  });
  const remove = trpc.healthCertificate.delete.useMutation({
    onSuccess: () => {
      toast.success("보건증 관리 항목을 삭제했습니다.");
      void invalidate();
    },
    onError: mutationError => toast.error(mutationError.message),
  });
  const test = trpc.healthCertificate.sendTestNotification.useMutation({
    onSuccess: result =>
      toast.success(
        result.sent
          ? `보건증 시험 알림 ${result.messageCount}건을 발송했습니다.`
          : "현재 발송 대상 보건증이 없습니다."
      ),
    onError: mutationError => toast.error(mutationError.message),
  });

  const schedules = data?.schedules ?? [];
  const stats = useMemo(
    () => ({
      overdue: schedules.filter(item => item.status === "overdue").length,
      urgent: schedules.filter(item => item.status === "urgent").length,
      active: schedules.filter(
        item =>
          item.status === "safe" ||
          item.status === "urgent" ||
          item.status === "overdue"
      ).length,
      missingPdf: schedules.filter(item => !item.fileName).length,
    }),
    [schedules]
  );

  const submitCreate = () => {
    const expiresAt =
      form.expiresAt || addMonths(form.issuedAt, form.validityMonths);
    if (expiresAt < form.issuedAt) {
      toast.error("만료일은 발급일 이후로 입력해 주세요.");
      return;
    }
    create.mutate({
      employeeName: form.employeeName,
      department: form.department || null,
      issuedAt: form.issuedAt,
      expiresAt,
      validityMonths: form.validityMonths,
      warningDays: form.warningDays,
      memo: form.memo || null,
    });
  };

  const openEdit = (item: (typeof schedules)[number]) => {
    setEditingId(item.id);
    setEditForm({
      employeeName: item.employeeName,
      department: item.department ?? "",
      issuedAt: item.issuedAt,
      expiresAt: item.expiresAt,
      validityMonths: item.validityMonths,
      warningDays: item.warningDays,
      memo: item.memo ?? "",
    });
  };

  const submitEdit = () => {
    if (editingId === null) return;
    if (editForm.expiresAt < editForm.issuedAt) {
      toast.error("만료일은 발급일 이후로 입력해 주세요.");
      return;
    }
    update.mutate({
      id: editingId,
      employeeName: editForm.employeeName,
      department: editForm.department || null,
      issuedAt: editForm.issuedAt,
      expiresAt: editForm.expiresAt,
      validityMonths: editForm.validityMonths,
      warningDays: editForm.warningDays,
      memo: editForm.memo || null,
    });
  };

  const uploadPdf = async (id: number, file?: File) => {
    if (!file) return;
    try {
      upload.mutate({
        id,
        fileName: file.name,
        contentType: file.type || "application/pdf",
        fileBase64: await fileToBase64(file),
      });
    } catch (uploadError) {
      toast.error(
        uploadError instanceof Error
          ? uploadError.message
          : "PDF 파일을 준비하지 못했습니다."
      );
    }
  };

  return (
    <DashboardLayout>
      <main className="min-h-screen bg-[#f7fbfa] p-4 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-3xl bg-gradient-to-br from-teal-950 to-emerald-800 px-6 py-7 text-white shadow-lg md:px-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="mb-2 flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-emerald-100">
                  <UserRoundCheck className="h-4 w-4" /> KOENF HEALTH
                  CERTIFICATE
                </p>
                <h1 className="text-3xl font-bold tracking-tight">
                  보건증 관리
                </h1>
                <p className="mt-2 text-sm text-emerald-50">
                  담당자별 유효기간과 보건증 PDF를 한 곳에서 관리하고
                  텔레그램으로 미리 알립니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  className="bg-white text-teal-900 hover:bg-emerald-50"
                  onClick={() => test.mutate()}
                  disabled={test.isPending}
                >
                  <BellRing className="mr-2 h-4 w-4" />
                  {test.isPending ? "발송 중..." : "보건증 시험 알림"}
                </Button>
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-emerald-400 text-emerald-950 hover:bg-emerald-300">
                      <Plus className="mr-2 h-4 w-4" />
                      담당자 등록
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                    <DialogHeader>
                      <DialogTitle>보건증 담당자 등록</DialogTitle>
                      <DialogDescription>
                        주기는 기본 12개월이며, 발급일 기준 만료일을 자동
                        계산합니다. 주민등록번호 등 불필요한 민감정보는 입력하지
                        마세요.
                      </DialogDescription>
                    </DialogHeader>
                    <CertificateFields
                      form={form}
                      onChange={setForm}
                      allowAutoExpiration
                    />
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setCreateOpen(false)}
                      >
                        취소
                      </Button>
                      <Button
                        onClick={submitCreate}
                        disabled={
                          !form.employeeName.trim() ||
                          !form.issuedAt ||
                          Boolean(
                            form.expiresAt && form.expiresAt < form.issuedAt
                          ) ||
                          create.isPending
                        }
                      >
                        {create.isPending ? "등록 중..." : "담당자 등록"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </section>

          {isLoading ? (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                보건증 정보를 불러오는 중입니다.
              </CardContent>
            </Card>
          ) : isError ? (
            <Card className="border-red-200">
              <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
                <AlertTriangle className="h-7 w-7 text-red-600" />
                <p className="font-semibold">
                  보건증 정보를 불러오지 못했습니다.
                </p>
                <p className="text-sm text-muted-foreground">{error.message}</p>
                <Button variant="outline" onClick={() => refetch()}>
                  다시 시도
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat
                  icon={UsersRound}
                  label="관리 담당자"
                  value={`${stats.active}명`}
                  detail="재직·알림 대상"
                  tone="emerald"
                />
                <Stat
                  icon={AlertTriangle}
                  label="기간 초과"
                  value={`${stats.overdue}명`}
                  detail="즉시 갱신 확인"
                  tone="red"
                />
                <Stat
                  icon={CalendarDays}
                  label="만료 임박"
                  value={`${stats.urgent}명`}
                  detail="사전 알림 대상"
                  tone="amber"
                />
                <Stat
                  icon={FileText}
                  label="PDF 미보관"
                  value={`${stats.missingPdf}건`}
                  detail="보관 필요"
                  tone="slate"
                />
              </section>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserRoundCheck className="h-5 w-5 text-teal-700" />
                    담당자별 보건증 현황
                  </CardTitle>
                  <CardDescription>
                    PDF는 담당자별 현재 보건증 1건을 보관합니다. 갱신 시 수정
                    버튼으로 발급일·만료일을 바꾸고 새 PDF를 업로드해 주세요.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {schedules.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                      등록된 보건증 담당자가 없습니다. 상단의 담당자 등록을 눌러
                      시작하세요.
                    </div>
                  ) : (
                    schedules.map(item => {
                      const meta = statusMeta(item.status);
                      const statusReason =
                        item.employmentStatus === "inactive"
                          ? item.inactiveReason
                          : item.alertStatus === "paused"
                            ? item.alertPauseReason
                            : null;
                      return (
                        <div
                          key={item.id}
                          className="rounded-2xl border bg-white p-4 shadow-sm"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h2 className="font-semibold">
                                  {item.employeeName}
                                </h2>
                                {item.department && (
                                  <span className="text-sm text-muted-foreground">
                                    {item.department}
                                  </span>
                                )}
                                <Badge
                                  variant="outline"
                                  className={meta.className}
                                >
                                  {meta.label}
                                </Badge>
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">
                                발급 {item.issuedAt.replaceAll("-", ".")} · 만료{" "}
                                {item.expiresAt.replaceAll("-", ".")} ·{" "}
                                {item.daysRemaining < 0
                                  ? `${Math.abs(item.daysRemaining)}일 초과`
                                  : `D-${item.daysRemaining}`}{" "}
                                · 사전 알림 {item.warningDays}일
                              </p>
                              {item.memo && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  메모: {item.memo}
                                </p>
                              )}
                              {statusReason && (
                                <p className="mt-1 text-xs text-slate-500">
                                  {item.employmentStatus === "inactive"
                                    ? "재직 제외"
                                    : "알림 중지"}{" "}
                                  사유: {statusReason}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEdit(item)}
                              >
                                <Pencil className="mr-1.5 h-4 w-4" />
                                수정
                              </Button>
                              <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
                                <Upload className="mr-1.5 h-4 w-4" />
                                {item.fileName ? "PDF 교체" : "PDF 업로드"}
                                <input
                                  className="hidden"
                                  type="file"
                                  accept="application/pdf,.pdf"
                                  onChange={event => {
                                    void uploadPdf(
                                      item.id,
                                      event.target.files?.[0]
                                    );
                                    event.currentTarget.value = "";
                                  }}
                                />
                              </label>
                              {item.downloadUrl && (
                                <Button variant="outline" size="sm" asChild>
                                  <a href={item.downloadUrl}>
                                    <Download className="mr-1.5 h-4 w-4" />
                                    다운로드
                                  </a>
                                </Button>
                              )}
                              {item.shareUrl && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    void navigator.clipboard?.writeText(
                                      item.shareUrl ?? ""
                                    );
                                    toast.success(
                                      "7일 유효 공유 링크를 복사했습니다."
                                    );
                                  }}
                                >
                                  <Share2 className="mr-1.5 h-4 w-4" />
                                  공유
                                </Button>
                              )}
                              {item.alertStatus === "active" ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const reason =
                                      window.prompt(
                                        "알림 중지 사유를 입력해 주세요."
                                      );
                                    if (reason)
                                      pause.mutate({
                                        id: item.id,
                                        paused: true,
                                        reason,
                                      });
                                  }}
                                >
                                  <PauseCircle className="mr-1.5 h-4 w-4" />
                                  알림 중지
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    pause.mutate({ id: item.id, paused: false })
                                  }
                                >
                                  알림 재개
                                </Button>
                              )}
                              {item.employmentStatus === "active" ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const reason =
                                      window.prompt(
                                        "재직 제외 사유를 입력해 주세요."
                                      );
                                    if (reason)
                                      employment.mutate({
                                        id: item.id,
                                        inactive: true,
                                        reason,
                                      });
                                  }}
                                >
                                  재직 제외
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    employment.mutate({
                                      id: item.id,
                                      inactive: false,
                                    })
                                  }
                                >
                                  재직 복귀
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `${item.employeeName} 담당자의 보건증 관리 항목을 삭제할까요?`
                                    )
                                  ) {
                                    remove.mutate({ id: item.id });
                                  }
                                }}
                              >
                                삭제
                              </Button>
                            </div>
                          </div>
                          {item.fileName ? (
                            <p className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                              <FileText className="h-4 w-4 text-teal-700" />
                              보관 PDF: {item.fileName}
                            </p>
                          ) : (
                            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                              PDF가 아직 보관되지 않았습니다.
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    최근 보건증 알림 이력
                  </CardTitle>
                  <CardDescription>
                    자동 알림과 시험 알림의 담당자·수신 그룹별 발송 결과입니다.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data?.logs.length ? (
                    <div className="space-y-2">
                      {data.logs.slice(0, 8).map(log => (
                        <div
                          key={log.id}
                          className="rounded-lg border p-3 text-sm"
                        >
                          <div className="flex flex-wrap justify-between gap-2">
                            <span className="font-medium">
                              {log.alertLevel === "test"
                                ? "시험 알림"
                                : log.alertLevel === "overdue"
                                  ? "기간 초과"
                                  : "만료 임박"}{" "}
                              ·{" "}
                              {log.status === "sent"
                                ? "발송 완료"
                                : log.status === "failed"
                                  ? "발송 실패"
                                  : "발송 대기"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {log.createdAt.toLocaleString("ko-KR")}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">
                            {log.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      아직 보건증 알림 발송 이력이 없습니다.
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>

      <Dialog
        open={editingId !== null}
        onOpenChange={open => !open && setEditingId(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>보건증 담당자 수정</DialogTitle>
            <DialogDescription>
              담당자 정보와 갱신된 발급일·만료일을 수정합니다. PDF를 갱신할 때는
              저장 후 목록의 PDF 교체를 이용해 주세요.
            </DialogDescription>
          </DialogHeader>
          <CertificateFields
            form={editForm}
            onChange={setEditForm}
            allowAutoExpiration
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingId(null)}>
              취소
            </Button>
            <Button
              onClick={submitEdit}
              disabled={
                !editForm.employeeName.trim() ||
                !editForm.issuedAt ||
                !editForm.expiresAt ||
                editForm.expiresAt < editForm.issuedAt ||
                update.isPending
              }
            >
              {update.isPending ? "저장 중..." : "수정 저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function CertificateFields({
  form,
  onChange,
  allowAutoExpiration,
}: {
  form: CertificateForm;
  onChange: (form: CertificateForm) => void;
  allowAutoExpiration?: boolean;
}) {
  const calculatedExpiration = form.issuedAt
    ? addMonths(form.issuedAt, form.validityMonths)
    : "";
  return (
    <div className="grid gap-4 py-2 md:grid-cols-2">
      <div className="space-y-2">
        <Label>담당자명</Label>
        <Input
          value={form.employeeName}
          onChange={event =>
            onChange({ ...form, employeeName: event.target.value })
          }
          placeholder="예: 홍길동"
        />
      </div>
      <div className="space-y-2">
        <Label>부서 / 업무</Label>
        <Input
          value={form.department}
          onChange={event =>
            onChange({ ...form, department: event.target.value })
          }
          placeholder="예: 생산팀"
        />
      </div>
      <div className="space-y-2">
        <Label>발급일</Label>
        <Input
          type="date"
          value={form.issuedAt}
          onChange={event =>
            onChange({ ...form, issuedAt: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label>유효 주기 (개월)</Label>
        <Input
          type="number"
          min={1}
          max={36}
          value={form.validityMonths}
          onChange={event =>
            onChange({
              ...form,
              validityMonths: Number(event.target.value) || 12,
            })
          }
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>만료일</Label>
          {allowAutoExpiration && calculatedExpiration && (
            <button
              type="button"
              className="text-xs font-medium text-teal-700 hover:underline"
              onClick={() =>
                onChange({ ...form, expiresAt: calculatedExpiration })
              }
            >
              발급일+주기 적용
            </button>
          )}
        </div>
        <Input
          type="date"
          value={form.expiresAt || calculatedExpiration}
          min={form.issuedAt}
          onChange={event =>
            onChange({ ...form, expiresAt: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label>사전 알림 (일)</Label>
        <Input
          type="number"
          min={1}
          max={180}
          value={form.warningDays}
          onChange={event =>
            onChange({ ...form, warningDays: Number(event.target.value) || 30 })
          }
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label>메모</Label>
        <Textarea
          value={form.memo}
          onChange={event => onChange({ ...form, memo: event.target.value })}
          placeholder="예: 갱신 예정일, 보관 위치 등"
        />
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof UsersRound;
  label: string;
  value: string;
  detail: string;
  tone: "emerald" | "red" | "amber" | "slate";
}) {
  const colors = {
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    red: "border-red-100 bg-red-50 text-red-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    slate: "border-slate-200 bg-white text-slate-700",
  };
  return (
    <Card className={colors[tone]}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium opacity-80">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
            <p className="mt-1 text-xs opacity-75">{detail}</p>
          </div>
          <Icon className="h-5 w-5 opacity-70" />
        </div>
      </CardContent>
    </Card>
  );
}
