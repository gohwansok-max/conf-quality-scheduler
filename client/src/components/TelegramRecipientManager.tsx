import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BellOff, BellRing, ClipboardPaste, Copy, MessageCircle, Pencil, Plus, RefreshCw, Trash2, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type Scope = { scopeType: "inspection_type" | "product"; scopeId: number };
type Recipient = { id: number; name: string; telegramChatId: string; isActive: boolean; receivesHealthAlerts: boolean; scopes: Scope[] };
type InspectionType = { id: number; name: string };
type Product = { id: number; inspectionTypeId: number; name: string };
type DetectedGroup = { chatId: string; title: string };

const blankForm = { name: "", telegramChatId: "", isActive: true, receivesHealthAlerts: true, scopes: [] as Scope[] };
const normalizeChatId = (value: string) => value.match(/-?\d{5,}/)?.[0] ?? value.trim().replaceAll(" ", "");

export default function TelegramRecipientManager({ recipients, inspectionTypes, products, onChanged }: { recipients: Recipient[]; inspectionTypes: InspectionType[]; products: Product[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(blankForm);
  const [detectedGroups, setDetectedGroups] = useState<DetectedGroup[]>([]);
  const detectGroups = trpc.qualityScheduler.detectTelegramGroups.useQuery(undefined, { enabled: false, retry: false });
  const createRecipient = trpc.qualityScheduler.createTelegramRecipient.useMutation({ onSuccess: () => { onChanged(); closeDialog(); toast.success("담당자 수신 그룹을 추가했습니다."); }, onError: error => toast.error(error.message) });
  const updateRecipient = trpc.qualityScheduler.updateTelegramRecipient.useMutation({ onSuccess: () => { onChanged(); closeDialog(); toast.success("담당자 수신 그룹을 저장했습니다."); }, onError: error => toast.error(error.message) });
  const deleteRecipient = trpc.qualityScheduler.deleteTelegramRecipient.useMutation({ onSuccess: () => { onChanged(); toast.success("담당자 수신 그룹을 삭제했습니다."); }, onError: error => toast.error(error.message) });
  const pending = createRecipient.isPending || updateRecipient.isPending || deleteRecipient.isPending;
  const scopeLabel = useMemo(() => {
    const typeMap = new Map(inspectionTypes.map(item => [item.id, item.name]));
    const productMap = new Map(products.map(item => [item.id, item.name]));
    return (scope: Scope) => scope.scopeType === "inspection_type" ? `유형: ${typeMap.get(scope.scopeId) ?? "삭제된 유형"}` : `제품: ${productMap.get(scope.scopeId) ?? "삭제된 제품"}`;
  }, [inspectionTypes, products]);
  const closeDialog = () => { setOpen(false); setEditingId(null); setForm(blankForm); setDetectedGroups([]); };
  const openCreate = () => { setEditingId(null); setForm(blankForm); setDetectedGroups([]); setOpen(true); };
  const openEdit = (recipient: Recipient) => { setEditingId(recipient.id); setForm({ name: recipient.name, telegramChatId: recipient.telegramChatId, isActive: recipient.isActive, receivesHealthAlerts: recipient.receivesHealthAlerts, scopes: recipient.scopes }); setDetectedGroups([]); setOpen(true); };
  const toggleScope = (scope: Scope) => setForm(current => {
    const exists = current.scopes.some(item => item.scopeType === scope.scopeType && item.scopeId === scope.scopeId);
    return { ...current, scopes: exists ? current.scopes.filter(item => item.scopeType !== scope.scopeType || item.scopeId !== scope.scopeId) : [...current.scopes, scope] };
  });
  const isSelected = (scope: Scope) => form.scopes.some(item => item.scopeType === scope.scopeType && item.scopeId === scope.scopeId);
  const save = () => {
    const telegramChatId = normalizeChatId(form.telegramChatId);
    if (!form.name.trim() || !/^-?\d+$/.test(telegramChatId) || !form.scopes.length) return toast.error("담당자명, 텔레그램 그룹 ID, 담당 범위를 모두 입력해 주세요.");
    if (editingId) updateRecipient.mutate({ id: editingId, ...form, telegramChatId, name: form.name.trim() });
    else createRecipient.mutate({ ...form, telegramChatId, name: form.name.trim() });
  };
  const loadDetectedGroups = async () => {
    const result = await detectGroups.refetch();
    if (result.error) return toast.error(result.error.message);
    const groups = result.data ?? [];
    setDetectedGroups(groups);
    toast.success(groups.length ? `${groups.length}개 최근 그룹을 찾았습니다.` : "최근 메시지에서 찾은 그룹이 없습니다. 봇을 그룹에 추가한 뒤 메시지를 보내 주세요.");
  };
  const pasteChatId = async () => {
    try {
      const value = normalizeChatId(await navigator.clipboard.readText());
      if (!value) return toast.error("클립보드에서 숫자 형태의 그룹 ID를 찾지 못했습니다.");
      setForm(current => ({ ...current, telegramChatId: value }));
      toast.success("텔레그램 그룹 ID를 붙여넣었습니다.");
    } catch {
      toast.error("클립보드 접근이 허용되지 않았습니다. 그룹 ID를 직접 붙여넣어 주세요.");
    }
  };
  const copyChatId = async (chatId: string) => {
    try {
      await navigator.clipboard.writeText(chatId);
      toast.success("텔레그램 그룹 ID를 복사했습니다.");
    } catch {
      toast.error("그룹 ID를 복사하지 못했습니다.");
    }
  };

  return <Card className="border-border/80 shadow-sm">
    <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="flex items-center gap-2 text-base"><UsersRound className="h-4 w-4 text-sky-600" />담당자별 텔레그램 수신 그룹</CardTitle><CardDescription className="mt-1">담당 식품유형 또는 제품 범위만 포함해 맞춤형 알림을 보냅니다.</CardDescription></div><Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="h-4 w-4" />담당자 추가</Button></CardHeader>
    <CardContent className="space-y-3">
      <p className="rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2 text-xs leading-5 text-sky-900">그룹에서 봇을 추가한 뒤 아무 메시지나 보내고 <b>최근 그룹 불러오기</b>를 누르면 그룹 ID를 선택할 수 있습니다. 직접 붙여넣기도 가능합니다.</p>
      {recipients.length ? recipients.map(recipient => <div key={recipient.id} className="rounded-xl border bg-card p-3"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{recipient.name}</p><Badge variant="outline" className={recipient.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}>{recipient.isActive ? "발송 활성" : "발송 중지"}</Badge>{recipient.receivesHealthAlerts && <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700">보건증 수신</Badge>}</div><div className="mt-1 flex items-center gap-1"><p className="text-xs text-muted-foreground">그룹 ID: {recipient.telegramChatId}</p><Button size="icon" variant="ghost" className="h-6 w-6" title="그룹 ID 복사" onClick={() => void copyChatId(recipient.telegramChatId)}><Copy className="h-3.5 w-3.5" /></Button></div></div><div className="flex gap-1"><Button size="icon" variant="ghost" title="수정" onClick={() => openEdit(recipient)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" title={recipient.isActive ? "발송 중지" : "발송 활성"} disabled={pending} onClick={() => updateRecipient.mutate({ id: recipient.id, isActive: !recipient.isActive })}>{recipient.isActive ? <BellOff className="h-3.5 w-3.5" /> : <BellRing className="h-3.5 w-3.5" />}</Button><Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" title="삭제" disabled={pending} onClick={() => { if (window.confirm(`${recipient.name} 담당자 수신 그룹을 삭제할까요?`)) deleteRecipient.mutate({ id: recipient.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button></div></div><div className="mt-3 flex flex-wrap gap-1.5">{recipient.scopes.map(scope => <Badge key={`${scope.scopeType}-${scope.scopeId}`} variant="secondary" className="text-xs">{scopeLabel(scope)}</Badge>)}</div></div>) : <div className="rounded-xl border border-dashed px-4 py-6 text-center"><MessageCircle className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm font-medium">등록된 담당자 수신 그룹이 없습니다.</p><p className="mt-1 text-xs text-muted-foreground">기본 텔레그램 그룹으로 전체 알림을 보내고 있습니다.</p></div>}
    </CardContent>
    <Dialog open={open} onOpenChange={next => next ? setOpen(true) : closeDialog()}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{editingId ? "담당자 수신 그룹 수정" : "담당자 수신 그룹 추가"}</DialogTitle><DialogDescription>그룹 ID는 봇이 입장한 텔레그램 그룹의 숫자 ID입니다. 최근 그룹을 불러오거나 직접 붙여넣을 수 있습니다.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-1.5"><Label>담당자명</Label><Input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="예: 음료 생산 담당" /></div><div className="grid gap-1.5"><Label>텔레그램 그룹 ID</Label><div className="flex gap-2"><Input value={form.telegramChatId} onChange={event => setForm(current => ({ ...current, telegramChatId: event.target.value }))} placeholder="예: -1001234567890" /><Button type="button" size="icon" variant="outline" title="그룹 ID 붙여넣기" onClick={() => void pasteChatId()}><ClipboardPaste className="h-4 w-4" /></Button></div></div></div><div className="rounded-lg border bg-muted/30 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">봇이 최근 메시지를 받은 그룹을 불러와 바로 선택합니다.</p><Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={detectGroups.isFetching} onClick={() => void loadDetectedGroups()}><RefreshCw className={`h-3.5 w-3.5 ${detectGroups.isFetching ? "animate-spin" : ""}`} />최근 그룹 불러오기</Button></div>{detectedGroups.length ? <div className="mt-3 grid gap-2">{detectedGroups.map(group => <button type="button" key={group.chatId} onClick={() => { setForm(current => ({ ...current, telegramChatId: group.chatId })); toast.success(`${group.title} 그룹을 선택했습니다.`); }} className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${form.telegramChatId === group.chatId ? "border-sky-400 bg-sky-50" : "bg-background hover:bg-muted"}`}><span className="font-medium">{group.title}</span><span className="ml-2 text-xs text-muted-foreground">{group.chatId}</span></button>)}</div> : null}</div><div className="grid gap-2 rounded-lg border border-teal-100 bg-teal-50/50 p-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={event => setForm(current => ({ ...current, isActive: event.target.checked }))} />자가품질검사 알림 수신</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.receivesHealthAlerts} onChange={event => setForm(current => ({ ...current, receivesHealthAlerts: event.target.checked }))} />보건증 만료 알림 수신</label></div><div className="grid gap-2"><Label>담당 식품유형</Label><div className="grid gap-2 sm:grid-cols-2">{inspectionTypes.map(type => <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" key={type.id}><input type="checkbox" checked={isSelected({ scopeType: "inspection_type", scopeId: type.id })} onChange={() => toggleScope({ scopeType: "inspection_type", scopeId: type.id })} />{type.name}</label>)}</div></div><div className="grid gap-2"><Label>담당 제품</Label>{products.length ? <div className="grid gap-2 sm:grid-cols-2">{products.map(product => <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" key={product.id}><input type="checkbox" checked={isSelected({ scopeType: "product", scopeId: product.id })} onChange={() => toggleScope({ scopeType: "product", scopeId: product.id })} />{product.name}</label>)}</div> : <p className="text-xs text-muted-foreground">등록된 제품이 없습니다.</p>}</div></div><DialogFooter><Button variant="outline" onClick={closeDialog}>취소</Button><Button disabled={pending} onClick={save}>{editingId ? "저장" : "추가"}</Button></DialogFooter></DialogContent></Dialog>
  </Card>;
}
