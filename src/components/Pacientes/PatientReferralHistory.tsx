import React, { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { 
  getPatientReferrals, 
  createPatientReferral, 
  updatePatientReferral, 
  deletePatientReferral, 
  uploadReferralAttachment, 
  deleteReferralAttachment,
  getReferralFileUrl,
  type PatientReferral,
  type ReferralAttachment
} from "@/services/patientReferralService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Plus, History, FileText, Trash2, Printer, Eye, Upload, Loader2,
  FileIcon, CheckCircle2, Pencil, Clock
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { printReferral } from "@/lib/referralPrinter";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import EspecialidadeDestinoCombobox from "@/components/Pacientes/EspecialidadeDestinoCombobox";

const UBS_LIST = [
  "UBS Dr. Lauro Corrêa Pinto", "UBS Penta", "UBS Corino Guerreiro",
  "UBS Santa Luzia", "UBS Tânia Siqueira da Fonseca", "UBS Antônio Miléo",
  "Hospital Municipal de Oriximiná", "UBS Nossa Sra. das Graças",
  "UBS Fluvial Manoel Andrade", "UBS Ribeirinho", "Hospital Regional Menino Jesus",
];

const emptyForm = () => ({
  especialidade_destino: "",
  ubs_origem: "",
  profissional_solicitante: "",
  tipo_encaminhamento: "ubs",
  cid: "",
  diagnostico_resumido: "",
  justificativa: "",
  data_encaminhamento: format(new Date(), "yyyy-MM-dd"),
  status: "pendente",
  observacoes: "",
});

interface PendingReferral {
  _localId: string;
  data: ReturnType<typeof emptyForm>;
  pendingFiles: File[];
}

interface Props {
  patientId?: string | null;
  patientData: any;
  unidadeId?: string;
  professionalId?: string;
}

export interface PatientReferralHistoryHandle {
  flushPending: (newPatientId: string) => Promise<void>;
  hasPending: () => boolean;
}

const PatientReferralHistory = forwardRef<PatientReferralHistoryHandle, Props>(
  ({ patientId, patientData, unidadeId, professionalId }, ref) => {
  const isPendingMode = !patientId;

  const [referrals, setReferrals] = useState<PatientReferral[]>([]);
  const [pending, setPending] = useState<PendingReferral[]>([]);
  const [loading, setLoading] = useState(!isPendingMode);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedReferral, setSelectedReferral] = useState<PatientReferral | null>(null);
  const [selectedPending, setSelectedPending] = useState<PendingReferral | null>(null);
  const [editing, setEditing] = useState<PatientReferral | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState(emptyForm());
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);

  useEffect(() => {
    if (patientId) loadReferrals();
  }, [patientId]);

  useImperativeHandle(ref, () => ({
    hasPending: () => pending.length > 0,
    flushPending: async (newPatientId: string) => {
      for (const p of pending) {
        try {
          const created = await createPatientReferral({
            ...p.data,
            patient_id: newPatientId,
            unidade_id: unidadeId,
            professional_id: professionalId,
          } as any);
          for (const f of p.pendingFiles) {
            try { await uploadReferralAttachment(created.id, f); }
            catch (e) { console.error("Falha ao enviar anexo pendente:", e); }
          }
        } catch (e) {
          console.error("Falha ao salvar encaminhamento pendente:", e);
        }
      }
      setPending([]);
    },
  }), [pending, unidadeId, professionalId]);

  const loadReferrals = async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const data = await getPatientReferrals(patientId);
      setReferrals(data);
    } catch {
      toast.error("Erro ao carregar histórico");
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => {
    setEditing(null);
    setFormData(emptyForm());
    setStagedFiles([]);
    setModalOpen(true);
  };

  const openEdit = (r: PatientReferral) => {
    setEditing(r);
    setFormData({
      especialidade_destino: r.especialidade_destino || "",
      ubs_origem: r.ubs_origem || "",
      profissional_solicitante: r.profissional_solicitante || "",
      tipo_encaminhamento: r.tipo_encaminhamento || "ubs",
      cid: r.cid || "",
      diagnostico_resumido: r.diagnostico_resumido || "",
      justificativa: r.justificativa || "",
      data_encaminhamento: r.data_encaminhamento || format(new Date(), "yyyy-MM-dd"),
      status: r.status || "pendente",
      observacoes: (r as any).observacoes || "",
    });
    setStagedFiles([]);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.especialidade_destino) {
      toast.error("Selecione a especialidade de destino");
      return;
    }
    setSaving(true);
    try {
      if (isPendingMode) {
        // Add to local pending queue
        setPending(prev => [
          ...prev,
          {
            _localId: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            data: { ...formData },
            pendingFiles: [...stagedFiles],
          },
        ]);
        toast.success("Encaminhamento adicionado (será salvo após cadastrar o paciente)");
      } else if (editing) {
        await updatePatientReferral(editing.id, formData as any);
        for (const f of stagedFiles) {
          try { await uploadReferralAttachment(editing.id, f); } catch {}
        }
        toast.success("Encaminhamento atualizado");
        await loadReferrals();
      } else {
        const created = await createPatientReferral({
          ...formData,
          patient_id: patientId!,
          unidade_id: unidadeId,
          professional_id: professionalId,
        } as any);
        for (const f of stagedFiles) {
          try { await uploadReferralAttachment(created.id, f); } catch {}
        }
        toast.success("Encaminhamento registrado");
        await loadReferrals();
      }
      setModalOpen(false);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao salvar encaminhamento");
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, refId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadReferralAttachment(refId, file);
      toast.success("Arquivo anexado");
      await loadReferrals();
      const updated = await getPatientReferrals(patientId!);
      const found = updated.find(r => r.id === refId);
      if (found) setSelectedReferral(found);
    } catch {
      toast.error("Erro ao enviar arquivo");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDeleteAttachment = async (att: ReferralAttachment) => {
    if (!confirm("Remover este anexo?")) return;
    try {
      await deleteReferralAttachment(att);
      toast.success("Anexo removido");
      await loadReferrals();
      if (selectedReferral) {
        const updated = await getPatientReferrals(patientId!);
        const found = updated.find(r => r.id === selectedReferral.id);
        if (found) setSelectedReferral(found);
      }
    } catch {
      toast.error("Erro ao remover");
    }
  };

  const handleViewFile = async (path: string) => {
    try {
      const url = await getReferralFileUrl(path);
      window.open(url, "_blank");
    } catch {
      toast.error("Erro ao abrir arquivo");
    }
  };

  const removePending = (localId: string) => {
    setPending(p => p.filter(x => x._localId !== localId));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <History className="w-4 h-4" /> Histórico de Encaminhamentos
          {isPendingMode && pending.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-[10px]">
              {pending.length} pendente{pending.length > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <Button size="sm" type="button" onClick={openNew} className="h-8 gap-1">
          <Plus className="w-4 h-4" /> Novo Encaminhamento
        </Button>
      </div>

      {isPendingMode && (
        <div className="text-[11px] text-muted-foreground bg-amber-500/10 border border-amber-500/30 rounded p-2 flex items-start gap-2">
          <Clock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>O paciente ainda não foi salvo. Encaminhamentos e anexos adicionados aqui serão enviados automaticamente após clicar em <b>Cadastrar Paciente</b>.</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (referrals.length === 0 && pending.length === 0) ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-6 text-muted-foreground">
            <FileText className="w-8 h-8 mb-1 opacity-20" />
            <p className="text-xs">Nenhum encaminhamento registrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[90px]">Data</TableHead>
                <TableHead>Especialidade</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Anexos</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map(p => (
                <TableRow key={p._localId} className="bg-amber-500/5">
                  <TableCell className="font-medium text-xs">
                    {p.data.data_encaminhamento ? format(new Date(p.data.data_encaminhamento), "dd/MM/yy") : "-"}
                  </TableCell>
                  <TableCell className="text-xs font-semibold uppercase text-primary">{p.data.especialidade_destino}</TableCell>
                  <TableCell className="text-xs">{p.data.ubs_origem || "---"}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]"><Clock className="w-2.5 h-2.5 mr-0.5" />pendente</Badge></TableCell>
                  <TableCell>
                    {p.pendingFiles.length > 0 ? (
                      <Badge variant="secondary" className="text-[10px] h-4">{p.pendingFiles.length} anexo{p.pendingFiles.length > 1 ? "s" : ""}</Badge>
                    ) : <span className="text-muted-foreground text-[10px]">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removePending(p._localId)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {referrals.map((r) => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/30" onClick={() => { setSelectedReferral(r); setViewModalOpen(true); }}>
                  <TableCell className="font-medium text-xs">
                    {r.data_encaminhamento ? format(new Date(r.data_encaminhamento), "dd/MM/yy") : "-"}
                  </TableCell>
                  <TableCell className="text-xs font-semibold uppercase text-primary">{r.especialidade_destino}</TableCell>
                  <TableCell className="text-xs">{r.ubs_origem || "---"}</TableCell>
                  <TableCell><Badge variant={r.status === 'ativo' ? 'default' : 'secondary'} className="text-[10px]">{r.status}</Badge></TableCell>
                  <TableCell>
                    {r.attachments && r.attachments.length > 0 ? (
                      <Badge variant="secondary" className="text-[10px] h-4">{r.attachments.length}</Badge>
                    ) : <span className="text-muted-foreground text-[10px]">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)} title="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => printReferral(r, patientData)} title="Imprimir">
                        <Printer className="w-3.5 h-3.5" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Excluir" onClick={async () => {
                        if (confirm("Excluir este encaminhamento?")) {
                          await deletePatientReferral(r.id);
                          toast.success("Removido");
                          loadReferrals();
                        }
                      }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Form Modal: Novo / Editar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Encaminhamento" : "Novo Encaminhamento (UBS)"}</DialogTitle>
            <DialogDescription>
              {isPendingMode
                ? "O encaminhamento será salvo automaticamente após o cadastro do paciente."
                : "Preencha os dados do encaminhamento."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-3">
            <div className="md:col-span-2 p-3 rounded-lg border-2 border-primary/30 bg-primary/5">
              <Label className="text-sm font-semibold text-primary">Especialidade Destino *</Label>
              <div className="mt-1">
                <EspecialidadeDestinoCombobox
                  value={formData.especialidade_destino}
                  onChange={(v) => setFormData({ ...formData, especialidade_destino: v })}
                />
              </div>
            </div>
            <div>
              <Label>UBS origem</Label>
              <Select value={formData.ubs_origem} onValueChange={(v) => setFormData({...formData, ubs_origem: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{UBS_LIST.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo encaminhamento</Label>
              <Select value={formData.tipo_encaminhamento} onValueChange={(v) => setFormData({...formData, tipo_encaminhamento: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ubs">UBS</SelectItem>
                  <SelectItem value="hospital">Hospital</SelectItem>
                  <SelectItem value="caps">CAPS</SelectItem>
                  <SelectItem value="espontaneo">Espontâneo</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Profissional solicitante</Label>
              <Input value={formData.profissional_solicitante} onChange={(e) => setFormData({...formData, profissional_solicitante: e.target.value.toUpperCase()})} />
            </div>
            <div>
              <Label>CID-10</Label>
              <Input value={formData.cid} onChange={(e) => setFormData({...formData, cid: e.target.value.toUpperCase()})} placeholder="Ex: G80.0" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({...formData, status: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="enviado">Enviado</SelectItem>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="agendado">Agendado</SelectItem>
                  <SelectItem value="finalizado">Finalizado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data encaminhamento</Label>
              <Input type="date" value={formData.data_encaminhamento} onChange={(e) => setFormData({...formData, data_encaminhamento: e.target.value})} />
            </div>
            <div className="md:col-span-2">
              <Label>Diagnóstico resumido</Label>
              <Input value={formData.diagnostico_resumido} onChange={(e) => setFormData({...formData, diagnostico_resumido: e.target.value})} />
            </div>
            <div className="md:col-span-2">
              <Label>Justificativa</Label>
              <Textarea value={formData.justificativa} onChange={(e) => setFormData({...formData, justificativa: e.target.value})} className="min-h-[70px]" />
            </div>
            <div className="md:col-span-2">
              <Label>Observações</Label>
              <Textarea value={formData.observacoes} onChange={(e) => setFormData({...formData, observacoes: e.target.value})} className="min-h-[50px]" />
            </div>

            {/* Anexos staged */}
            <div className="md:col-span-2 border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" /> Anexar documentos</Label>
                <div className="relative">
                  <input type="file" className="absolute inset-0 opacity-0 cursor-pointer w-full"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setStagedFiles(prev => [...prev, f]);
                      e.target.value = "";
                    }} />
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs"><Plus className="w-3 h-3 mr-1" />Adicionar</Button>
                </div>
              </div>
              {stagedFiles.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Nenhum arquivo selecionado.</p>
              ) : (
                <div className="space-y-1">
                  {stagedFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between p-1.5 rounded bg-muted/50 text-xs">
                      <span className="truncate flex items-center gap-1.5"><FileIcon className="w-3 h-3" />{f.name}</span>
                      <Button type="button" size="icon" variant="ghost" className="h-5 w-5 text-destructive" onClick={() => setStagedFiles(prev => prev.filter((_, idx) => idx !== i))}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              {isPendingMode ? "Adicionar à lista" : (editing ? "Atualizar" : "Salvar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Modal */}
      <Dialog open={viewModalOpen} onOpenChange={setViewModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedReferral && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between pr-6">
                  <DialogTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    {selectedReferral.especialidade_destino.toUpperCase()}
                  </DialogTitle>
                  <Badge>{selectedReferral.status?.toUpperCase()}</Badge>
                </div>
              </DialogHeader>
              <div className="space-y-3 py-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-muted-foreground block text-xs">Data:</span><span className="font-semibold">{selectedReferral.data_encaminhamento ? format(new Date(selectedReferral.data_encaminhamento), "dd/MM/yyyy") : "-"}</span></div>
                  <div><span className="text-muted-foreground block text-xs">UBS:</span><span className="font-semibold">{selectedReferral.ubs_origem || "—"}</span></div>
                  <div><span className="text-muted-foreground block text-xs">Solicitante:</span><span className="font-semibold">{selectedReferral.profissional_solicitante || "—"}</span></div>
                  <div><span className="text-muted-foreground block text-xs">CID-10:</span><span className="font-semibold">{selectedReferral.cid || "—"}</span></div>
                </div>
                {selectedReferral.diagnostico_resumido && (
                  <div className="border-t pt-2"><span className="text-muted-foreground block text-xs">Diagnóstico:</span><p className="font-medium">{selectedReferral.diagnostico_resumido}</p></div>
                )}
                {selectedReferral.justificativa && (
                  <div className="border-t pt-2"><span className="text-muted-foreground block text-xs">Justificativa:</span><p className="bg-muted/30 p-2 rounded italic whitespace-pre-wrap">{selectedReferral.justificativa}</p></div>
                )}
                <div className="border-t pt-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold flex items-center gap-1.5"><Upload className="w-4 h-4" /> Anexos</span>
                    <div className="relative">
                      <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleFileUpload(e, selectedReferral.id)} disabled={uploading} />
                      <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={uploading}>
                        {uploading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />} Anexar
                      </Button>
                    </div>
                  </div>
                  {selectedReferral.attachments && selectedReferral.attachments.length > 0 ? (
                    selectedReferral.attachments.map((file) => (
                      <div key={file.id} className="flex items-center justify-between p-2 rounded bg-muted/50 text-xs">
                        <span className="truncate flex items-center gap-1.5"><FileIcon className="w-3.5 h-3.5 text-primary" />{file.file_name}</span>
                        <div className="flex gap-1">
                          <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleViewFile(file.file_path)}><Eye className="w-3 h-3" /></Button>
                          <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => handleDeleteAttachment(file)}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      </div>
                    ))
                  ) : <p className="text-xs text-muted-foreground italic text-center py-1">Nenhum anexo.</p>}
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setViewModalOpen(false)}>Fechar</Button>
                <Button type="button" onClick={() => { setViewModalOpen(false); openEdit(selectedReferral); }}><Pencil className="w-4 h-4 mr-2" />Editar</Button>
                <Button type="button" onClick={() => printReferral(selectedReferral, patientData)}><Printer className="w-4 h-4 mr-2" />Imprimir</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
});

PatientReferralHistory.displayName = "PatientReferralHistory";
export default PatientReferralHistory;
