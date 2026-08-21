import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Archive, ArchiveRestore, BellOff, BellRing, CalendarPlus, Download, FileSpreadsheet, FileUp, History, PackagePlus, PauseCircle, PlayCircle, Search, Settings2 } from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type InspectionTypeOption = { id: number; name: string };
type Product = { id: number; inspectionTypeId: number; name: string; intervalMonths: number; lastManufactureDate: string | null; isActive: boolean; productionStatus: "active" | "stopped"; productionStopReason: string | null; alertStatus: "active" | "paused"; alertPauseReason: string | null };
type ProductSchedule = { id: number; nextDeadline: string | null; daysRemaining: number | null; status: "pending" | "safe" | "urgent" | "overdue" | "stopped" | "paused" };
type Certificate = {
  id: number;
  inspectionTypeId: number;
  productId: number | null;
  certificateNumber: string | null;
  inspectionDate: string | null;
  fileName: string;
  fileSize: number;
  createdAt: Date;
  downloadUrl: string;
};
type ManufactureRecord = { id: number; productId: number; manufactureDate: string; previousManufactureDate: string | null; memo: string | null; createdAt: Date };
type CertificateNumberRule = { prefix: string; sequenceDigits: number };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label>{label}</Label>{children}</div>;
}

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

function sizeText(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function contentTypeFor(file: File) {
  if (file.type) return file.type;
  const suffix = file.name.toLowerCase().split(".").pop();
  return ({ pdf: "application/pdf", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" } as Record<string, string>)[suffix ?? ""] ?? "application/octet-stream";
}

export default function CertificateManager({
  inspectionTypes,
  products,
  productSchedules,
  certificates,
  manufactureRecords,
  certificateNumberRule,
  onChanged,
}: {
  inspectionTypes: InspectionTypeOption[];
  products: Product[];
  productSchedules: ProductSchedule[];
  certificates: Certificate[];
  manufactureRecords: ManufactureRecord[];
  certificateNumberRule: CertificateNumberRule;
  onChanged: () => void;
}) {
  const [productOpen, setProductOpen] = useState(false);
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [newProduct, setNewProduct] = useState({ inspectionTypeId: "", name: "", intervalMonths: "2", lastManufactureDate: "" });
  const [certificate, setCertificate] = useState({ inspectionTypeId: "", productId: "", certificateNumber: "", inspectionDate: "" });
  const [file, setFile] = useState<File | null>(null);
  const [useStandardNumber, setUseStandardNumber] = useState(true);
  const [numberRuleOpen, setNumberRuleOpen] = useState(false);
  const [numberRuleDraft, setNumberRuleDraft] = useState({ prefix: certificateNumberRule.prefix, sequenceDigits: String(certificateNumberRule.sequenceDigits) });
  const [manufactureBatchOpen, setManufactureBatchOpen] = useState(false);
  const [manufactureDates, setManufactureDates] = useState<Record<number, string>>({});
  const [manufactureMemo, setManufactureMemo] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedCertificateIds, setSelectedCertificateIds] = useState<number[]>([]);
  const [productControl, setProductControl] = useState<{ product: Product; mode: "alert" | "production" } | null>(null);
  const [productControlReason, setProductControlReason] = useState("");

  const createProduct = trpc.qualityScheduler.createProduct.useMutation({
    onSuccess: () => {
      onChanged();
      setNewProduct({ inspectionTypeId: "", name: "", intervalMonths: "2", lastManufactureDate: "" });
      setProductOpen(false);
      toast.success("제품명을 등록했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const uploadCertificate = trpc.qualityScheduler.uploadCertificate.useMutation({
    onSuccess: result => {
      onChanged();
      setFile(null);
      setCertificate({ inspectionTypeId: "", productId: "", certificateNumber: "", inspectionDate: "" });
      setUseStandardNumber(true);
      setCertificateOpen(false);
      toast.success(`검사성적서를 ${result.certificateNumber ? `${result.certificateNumber} 번호로 ` : ""}보관함에 저장했습니다.`);
    },
    onError: error => toast.error(error.message),
  });
  const updateProduct = trpc.qualityScheduler.updateProduct.useMutation({
    onSuccess: () => { onChanged(); toast.success("제품별 검사 일정을 저장했습니다."); },
    onError: error => toast.error(error.message),
  });
  const setProductAlertPause = trpc.qualityScheduler.setProductAlertPause.useMutation({
    onSuccess: (_, input) => {
      onChanged();
      setProductControl(null);
      setProductControlReason("");
      toast.success(input.paused ? "제품 알림을 일시 중지했습니다." : "제품 알림을 재개했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const setProductProduction = trpc.qualityScheduler.setProductProduction.useMutation({
    onSuccess: (_, input) => {
      onChanged();
      setProductControl(null);
      setProductControlReason("");
      toast.success(input.stopped ? "제품 생산을 중단 처리했습니다." : "제품 생산·알림을 재개했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const recordManufactureDates = trpc.qualityScheduler.recordManufactureDates.useMutation({
    onSuccess: result => {
      onChanged();
      setManufactureBatchOpen(false);
      setManufactureMemo("");
      toast.success(`${result.filter(item => item.recorded).length}개 제품의 최근 제조일을 저장했습니다.`);
    },
    onError: error => toast.error(error.message),
  });
  const updateCertificateNumberRule = trpc.qualityScheduler.updateCertificateNumberRule.useMutation({
    onSuccess: () => { onChanged(); setNumberRuleOpen(false); toast.success("성적서 발급번호 규칙을 저장했습니다."); },
    onError: error => toast.error(error.message),
  });
  const certificateSuggestionInput = useMemo(() => ({ inspectionDate: certificate.inspectionDate || undefined }), [certificate.inspectionDate]);
  const certificateNumberSuggestion = trpc.qualityScheduler.suggestCertificateNumber.useQuery(certificateSuggestionInput, { enabled: certificateOpen && useStandardNumber });

  useEffect(() => {
    setNumberRuleDraft({ prefix: certificateNumberRule.prefix, sequenceDigits: String(certificateNumberRule.sequenceDigits) });
  }, [certificateNumberRule.prefix, certificateNumberRule.sequenceDigits]);

  const productsForCertificate = useMemo(
    () => products.filter(product => product.inspectionTypeId === Number(certificate.inspectionTypeId)),
    [certificate.inspectionTypeId, products]
  );

  const certificateTypeName = (id: number) => inspectionTypes.find(type => type.id === id)?.name ?? "-";
  const productName = (id: number | null) => id ? products.find(product => product.id === id)?.name ?? "제품 미지정" : "제품 미지정";
  const matchesFilter = (inspectionTypeId: number, productId: number | null, extraText = "") => {
    const term = search.trim().toLowerCase();
    const product = productName(productId).toLowerCase();
    const type = certificateTypeName(inspectionTypeId).toLowerCase();
    return (typeFilter === "all" || String(inspectionTypeId) === typeFilter) && (!term || product.includes(term) || type.includes(term) || extraText.toLowerCase().includes(term));
  };
  const filteredProducts = products.filter(product => matchesFilter(product.inspectionTypeId, product.id, product.name));
  const productSchedule = (id: number) => productSchedules.find(schedule => schedule.id === id);
  const scheduleStatusText = (schedule: ProductSchedule | undefined) => {
    if (!schedule || schedule.status === "pending") return "제조일 입력 대기";
    if (schedule.status === "overdue") return `${Math.abs(schedule.daysRemaining ?? 0)}일 초과`;
    if (schedule.status === "urgent") return `D-${schedule.daysRemaining}`;
    if (schedule.status === "safe") return `D-${schedule.daysRemaining}`;
    return schedule.status === "stopped" ? "생산 중단" : "알림 중지";
  };
  const filteredCertificates = certificates.filter(certificate => matchesFilter(certificate.inspectionTypeId, certificate.productId, certificate.fileName));
  const toggleCertificate = (id: number) => setSelectedCertificateIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const toggleVisibleCertificates = () => {
    const visibleIds = filteredCertificates.map(certificate => certificate.id);
    const hasEveryVisible = visibleIds.length > 0 && visibleIds.every(id => selectedCertificateIds.includes(id));
    setSelectedCertificateIds(current => hasEveryVisible ? current.filter(id => !visibleIds.includes(id)) : Array.from(new Set([...current, ...visibleIds])));
  };
  const backupHref = (ids: "all" | number[]) => `/api/quality-certificates/backup?ids=${ids === "all" ? "all" : ids.join(",")}`;

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null;
    if (picked && picked.size > 20 * 1024 * 1024) return toast.error("성적서 파일은 20MB 이하만 업로드할 수 있습니다.");
    setFile(picked);
  };

  const submitCertificate = async () => {
    if (!file) return toast.error("검사성적서 파일을 선택해 주세요.");
    if (!certificate.inspectionTypeId) return toast.error("식품 유형을 선택해 주세요.");
    try {
      const fileBase64 = await toBase64(file);
      uploadCertificate.mutate({
        inspectionTypeId: Number(certificate.inspectionTypeId),
        productId: certificate.productId ? Number(certificate.productId) : null,
        certificateNumber: certificate.certificateNumber || null,
        useStandardNumber,
        inspectionDate: certificate.inspectionDate || null,
        fileName: file.name,
        contentType: contentTypeFor(file),
        fileBase64,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "파일 준비에 실패했습니다.");
    }
  };

  return <section className="space-y-5">
    <Card className="border-border/80 shadow-sm"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="제품명, 식품 유형, 성적서 파일명 검색" /></div><select className="h-10 rounded-md border bg-background px-3 text-sm sm:w-48" value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="all">전체 식품 유형</option>{inspectionTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</select></CardContent></Card>
    <div className="grid gap-5 xl:grid-cols-[0.86fr_1.14fr]">
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="flex flex-col gap-3 border-b sm:flex-row sm:items-center sm:justify-between">
        <div><CardTitle className="flex items-center gap-2 text-lg"><PackagePlus className="h-5 w-5 text-primary" />제품별 검사 일정</CardTitle><CardDescription className="mt-1">제품마다 검사 주기와 최근 제조일을 다르게 설정하면 개별 마감일과 사전 알림을 계산합니다.</CardDescription></div>
        <div className="flex flex-wrap gap-2"><Button asChild size="sm" variant="outline" className="gap-1.5"><a href="/api/quality-products/export.xlsx"><FileSpreadsheet className="h-4 w-4" />제품 현황</a></Button><Button asChild size="sm" variant="outline" className="gap-1.5"><a href="/api/product-manufacture-records/export.xlsx"><History className="h-4 w-4" />제조일 이력</a></Button><Dialog open={manufactureBatchOpen} onOpenChange={open => { setManufactureBatchOpen(open); if (open) setManufactureDates(Object.fromEntries(products.map(product => [product.id, product.lastManufactureDate ?? ""]))); }}>
          <DialogTrigger asChild><Button size="sm" variant="outline" className="gap-1.5"><CalendarPlus className="h-4 w-4" />제조일 순차 입력</Button></DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader><DialogTitle>실제 생산 제품 제조일 순차 입력</DialogTitle><DialogDescription>생산된 제품만 제조일을 차례로 입력하세요. 변경한 날짜는 입력 이력에 남고 다음 검사 마감일이 즉시 다시 계산됩니다.</DialogDescription></DialogHeader>
            <div className="space-y-2 py-2">{products.map(product => <div className="grid grid-cols-[1fr_150px] items-center gap-3 rounded-lg border p-3" key={product.id}><div><p className="text-sm font-semibold">{product.name}</p><p className="mt-1 text-xs text-muted-foreground">{certificateTypeName(product.inspectionTypeId)} · 현재 {product.lastManufactureDate ?? "미입력"}</p></div><Input type="date" value={manufactureDates[product.id] ?? ""} onChange={event => setManufactureDates(current => ({ ...current, [product.id]: event.target.value }))} /></div>)}</div>
            <Field label="공통 메모(선택)"><Input value={manufactureMemo} onChange={event => setManufactureMemo(event.target.value)} placeholder="예: 8월 정기 생산분" /></Field>
            <DialogFooter><Button variant="outline" onClick={() => setManufactureBatchOpen(false)}>취소</Button><Button disabled={recordManufactureDates.isPending || !products.some(product => manufactureDates[product.id] && manufactureDates[product.id] !== product.lastManufactureDate)} onClick={() => recordManufactureDates.mutate({ entries: products.filter(product => manufactureDates[product.id] && manufactureDates[product.id] !== product.lastManufactureDate).map(product => ({ productId: product.id, manufactureDate: manufactureDates[product.id], memo: manufactureMemo || null })) })}>{recordManufactureDates.isPending ? "저장 중..." : "변경 제조일 저장"}</Button></DialogFooter>
          </DialogContent>
        </Dialog><Dialog open={productOpen} onOpenChange={setProductOpen}>
          <DialogTrigger asChild><Button size="sm" className="gap-1.5"><PackagePlus className="h-4 w-4" />제품명 추가</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>제품명 등록</DialogTitle><DialogDescription>제품별 검사 주기와 제조일을 설정하면 유형 공통 주기 대신 제품 일정으로 알림을 관리합니다.</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-2">
              <Field label="식품 유형"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={newProduct.inspectionTypeId} onChange={event => setNewProduct({ ...newProduct, inspectionTypeId: event.target.value })}><option value="">선택하세요</option>{inspectionTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</select></Field>
              <Field label="제품명"><Input value={newProduct.name} onChange={event => setNewProduct({ ...newProduct, name: event.target.value })} placeholder="예: 홍삼진액 골드 100ml" /></Field>
              <div className="grid gap-4 sm:grid-cols-2"><Field label="검사 주기(개월)"><Input type="number" min="1" max="36" value={newProduct.intervalMonths} onChange={event => setNewProduct({ ...newProduct, intervalMonths: event.target.value })} /></Field><Field label="최근 제조일"><Input type="date" value={newProduct.lastManufactureDate} onChange={event => setNewProduct({ ...newProduct, lastManufactureDate: event.target.value })} /></Field></div>
            </div>
            <DialogFooter><Button disabled={!newProduct.inspectionTypeId || !newProduct.name || !newProduct.intervalMonths || createProduct.isPending} onClick={() => createProduct.mutate({ inspectionTypeId: Number(newProduct.inspectionTypeId), name: newProduct.name, intervalMonths: Number(newProduct.intervalMonths), lastManufactureDate: newProduct.lastManufactureDate || null })}>등록</Button></DialogFooter>
          </DialogContent>
        </Dialog></div>
      </CardHeader>
      <CardContent className="p-0">
        {products.length ? <div className="max-h-[360px] overflow-auto"><Table><TableHeader><TableRow className="bg-muted/45"><TableHead>제품명</TableHead><TableHead>주기</TableHead><TableHead>최근 제조일</TableHead><TableHead>다음 마감 / 상태</TableHead><TableHead>제품 관리</TableHead><TableHead>성적서</TableHead></TableRow></TableHeader><TableBody>{filteredProducts.length ? filteredProducts.map(product => { const schedule = productSchedule(product.id); return <TableRow key={product.id}><TableCell><p className="font-medium">{product.name}</p><p className="mt-1 text-xs text-muted-foreground">{certificateTypeName(product.inspectionTypeId)}</p></TableCell><TableCell><Input className="h-8 w-20" type="number" min="1" max="36" defaultValue={product.intervalMonths} onBlur={event => { const nextValue = Number(event.currentTarget.value); if (nextValue && nextValue !== product.intervalMonths) updateProduct.mutate({ id: product.id, intervalMonths: nextValue }); }} /></TableCell><TableCell><Input className="h-8 w-36" type="date" defaultValue={product.lastManufactureDate ?? ""} onBlur={event => { const nextValue = event.currentTarget.value || null; if (nextValue !== product.lastManufactureDate) updateProduct.mutate({ id: product.id, lastManufactureDate: nextValue }); }} /></TableCell><TableCell><p className="text-sm font-medium">{schedule?.nextDeadline ?? "-"}</p><p className={`mt-1 text-xs ${schedule?.status === "overdue" ? "text-red-700" : schedule?.status === "urgent" ? "text-amber-700" : "text-muted-foreground"}`}>{scheduleStatusText(schedule)}</p></TableCell><TableCell>{product.productionStatus === "stopped" ? <Button size="sm" variant="outline" className="gap-1" onClick={() => setProductProduction.mutate({ productId: product.id, stopped: false })}><PlayCircle className="h-3.5 w-3.5" />생산 재개</Button> : product.alertStatus === "paused" ? <Button size="sm" variant="outline" className="gap-1" onClick={() => setProductAlertPause.mutate({ productId: product.id, paused: false })}><BellRing className="h-3.5 w-3.5" />알림 재개</Button> : <div className="flex gap-1"><Button size="sm" variant="ghost" className="gap-1 px-2" onClick={() => setProductControl({ product, mode: "alert" })}><BellOff className="h-3.5 w-3.5" />알림</Button><Button size="sm" variant="ghost" className="gap-1 px-2" onClick={() => setProductControl({ product, mode: "production" })}><PauseCircle className="h-3.5 w-3.5" />생산</Button></div>}</TableCell><TableCell><Badge variant="outline">{certificates.filter(cert => cert.productId === product.id).length}건</Badge></TableCell></TableRow>; }) : <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">검색 결과가 없습니다.</TableCell></TableRow>}</TableBody></Table></div> : <p className="px-6 py-12 text-center text-sm text-muted-foreground">등록된 제품명이 없습니다.</p>}
        {manufactureRecords.length ? <div className="border-t bg-muted/15 px-5 py-3"><p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><History className="h-3.5 w-3.5" />최근 제조일 입력 이력</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{manufactureRecords.slice(0, 6).map(record => <span key={record.id}>{productName(record.productId)} · {record.manufactureDate}{record.memo ? ` (${record.memo})` : ""}</span>)}</div></div> : null}
      </CardContent>
    </Card>

    <Card className="border-border/80 shadow-sm">
      <CardHeader className="flex flex-col gap-3 border-b sm:flex-row sm:items-center sm:justify-between">
        <div><CardTitle className="flex items-center gap-2 text-lg"><Archive className="h-5 w-5 text-primary" />검사성적서 보관함</CardTitle><CardDescription className="mt-1">업로드한 파일은 제품명과 연결되어 필요할 때 내려받아 외부에 공유할 수 있습니다.</CardDescription></div>
        <div className="flex flex-wrap gap-2"><Button asChild size="sm" variant="outline" className="gap-1.5" disabled={!certificates.length}><a href={backupHref("all")}><ArchiveRestore className="h-4 w-4" />전체 백업</a></Button><Dialog open={numberRuleOpen} onOpenChange={setNumberRuleOpen}><DialogTrigger asChild><Button size="sm" variant="outline" className="gap-1.5"><Settings2 className="h-4 w-4" />번호 규칙</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>성적서 발급번호 규칙</DialogTitle><DialogDescription>자동 발급번호는 접두어-연도-순번 형식으로 생성됩니다.</DialogDescription></DialogHeader><div className="grid gap-4 py-3">        <Field label="접두어"><Input value={numberRuleDraft.prefix} onChange={event => setNumberRuleDraft(current => ({ ...current, prefix: event.target.value }))} placeholder="예: CONF-QC" /></Field><Field label="순번 자릿수"><Input type="number" min="2" max="6" value={numberRuleDraft.sequenceDigits} onChange={event => setNumberRuleDraft(current => ({ ...current, sequenceDigits: event.target.value }))} /></Field><p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">예시: {numberRuleDraft.prefix || "CONF-QC"}-{new Date().getFullYear()}-{String(1).padStart(Number(numberRuleDraft.sequenceDigits) || 3, "0")}</p></div><DialogFooter><Button disabled={updateCertificateNumberRule.isPending || !numberRuleDraft.prefix || !numberRuleDraft.sequenceDigits} onClick={() => updateCertificateNumberRule.mutate({ prefix: numberRuleDraft.prefix.trim(), sequenceDigits: Number(numberRuleDraft.sequenceDigits) })}>규칙 저장</Button></DialogFooter></DialogContent></Dialog><Dialog open={certificateOpen} onOpenChange={setCertificateOpen}>
          <DialogTrigger asChild><Button size="sm" className="gap-1.5"><FileUp className="h-4 w-4" />성적서 업로드</Button></DialogTrigger>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader><DialogTitle>검사성적서 업로드</DialogTitle><DialogDescription>PDF, Excel, JPG, PNG 형식의 성적서를 20MB 이하로 업로드할 수 있습니다.</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="식품 유형"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={certificate.inspectionTypeId} onChange={event => setCertificate({ ...certificate, inspectionTypeId: event.target.value, productId: "" })}><option value="">선택하세요</option>{inspectionTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</select></Field>
                <Field label="제품명"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={certificate.productId} onChange={event => setCertificate({ ...certificate, productId: event.target.value })}><option value="">미지정</option>{productsForCertificate.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2"><Field label="검사일"><Input type="date" value={certificate.inspectionDate} onChange={event => setCertificate({ ...certificate, inspectionDate: event.target.value })} /></Field><Field label="성적서 번호"><Input value={useStandardNumber ? certificateNumberSuggestion.data?.number ?? "번호 계산 중..." : certificate.certificateNumber} disabled={useStandardNumber} onChange={event => setCertificate({ ...certificate, certificateNumber: event.target.value })} placeholder="선택 입력" /><label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={useStandardNumber} onChange={event => setUseStandardNumber(event.target.checked)} />표준 발급번호 자동 적용</label></Field></div>
              <Field label="성적서 파일"><Input type="file" accept=".pdf,.xls,.xlsx,.jpg,.jpeg,.png,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png" onChange={onFileChange} />{file ? <p className="text-xs text-muted-foreground">선택됨: {file.name} · {sizeText(file.size)}</p> : null}</Field>
            </div>
            <DialogFooter><Button disabled={!file || !certificate.inspectionTypeId || uploadCertificate.isPending} onClick={submitCertificate}>{uploadCertificate.isPending ? "업로드 중..." : "보관함에 저장"}</Button></DialogFooter>
          </DialogContent>
        </Dialog></div>
      </CardHeader>
      <CardContent className="p-0">
        {certificates.length ? <><div className="max-h-[360px] overflow-auto"><Table><TableHeader><TableRow className="bg-muted/45"><TableHead className="w-11"><input aria-label="현재 검색 결과 전체 선택" type="checkbox" checked={filteredCertificates.length > 0 && filteredCertificates.every(certificate => selectedCertificateIds.includes(certificate.id))} onChange={toggleVisibleCertificates} /></TableHead><TableHead>검사일 / 제품명</TableHead><TableHead>파일명 / 발급번호</TableHead><TableHead>공유</TableHead></TableRow></TableHeader><TableBody>{filteredCertificates.length ? filteredCertificates.map(certificate => <TableRow key={certificate.id} data-state={selectedCertificateIds.includes(certificate.id) ? "selected" : undefined}><TableCell><input aria-label={`${certificate.fileName} 선택`} type="checkbox" checked={selectedCertificateIds.includes(certificate.id)} onChange={() => toggleCertificate(certificate.id)} /></TableCell><TableCell><p className="font-medium">{productName(certificate.productId)}</p><p className="mt-1 text-xs text-muted-foreground">{certificate.inspectionDate ?? "검사일 미입력"} · {certificateTypeName(certificate.inspectionTypeId)}</p></TableCell><TableCell><p className="max-w-45 truncate text-sm">{certificate.fileName}</p><p className="mt-1 text-xs text-muted-foreground">{certificate.certificateNumber ?? "번호 미입력"} · {sizeText(certificate.fileSize)}</p></TableCell><TableCell><Button asChild size="sm" variant="outline" className="gap-1.5"><a href={certificate.downloadUrl} target="_blank" rel="noreferrer"><Download className="h-3.5 w-3.5" />다운로드</a></Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">검색 결과가 없습니다.</TableCell></TableRow>}</TableBody></Table></div><div className="flex flex-col gap-3 border-t bg-muted/20 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">선택한 {selectedCertificateIds.length}건을 하나의 ZIP 파일로 내려받습니다. 한 번에 최대 100건, 250MB까지 가능합니다.</p><Button asChild size="sm" disabled={!selectedCertificateIds.length} className="gap-1.5"><a href={backupHref(selectedCertificateIds)}><ArchiveRestore className="h-4 w-4" />선택 백업</a></Button></div></> : <p className="px-6 py-12 text-center text-sm text-muted-foreground">보관된 검사성적서가 없습니다.</p>}
      </CardContent>
    </Card>
    </div>
    <Dialog open={Boolean(productControl)} onOpenChange={open => { if (!open) { setProductControl(null); setProductControlReason(""); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{productControl?.mode === "alert" ? "제품 알림 일시 중지" : "제품 생산 중단"}</DialogTitle><DialogDescription><b>{productControl?.product.name}</b> {productControl?.mode === "alert" ? "제품의 검사 마감 계산과 텔레그램 사전 알림만 일시 중지합니다. 생산 관리는 유지됩니다." : "제품의 검사 일정과 텔레그램 알림을 모두 예외 처리합니다. 재생산 시 제조일을 수정한 뒤 생산 재개를 누르세요."}</DialogDescription></DialogHeader>
        <Field label="사유"><Input value={productControlReason} onChange={event => setProductControlReason(event.target.value)} placeholder={productControl?.mode === "alert" ? "예: 시즌 생산 대기" : "예: 단종 또는 생산 보류"} /></Field>
        <DialogFooter><Button variant="outline" onClick={() => { setProductControl(null); setProductControlReason(""); }}>취소</Button><Button variant="secondary" disabled={!productControlReason || setProductAlertPause.isPending || setProductProduction.isPending} onClick={() => { if (!productControl) return; if (productControl.mode === "alert") setProductAlertPause.mutate({ productId: productControl.product.id, paused: true, reason: productControlReason }); else setProductProduction.mutate({ productId: productControl.product.id, stopped: true, reason: productControlReason }); }}>{productControl?.mode === "alert" ? "알림 일시 중지" : "생산 중단"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
