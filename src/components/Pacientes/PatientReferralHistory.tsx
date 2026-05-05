import React, { useState, useEffect } from "react";
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
  Plus, 
  History, 
  FileText, 
  Trash2, 
  Printer, 
  Eye, 
  Upload, 
  Loader2, 
  AlertCircle,
  FileIcon,
  X,
  CheckCircle2
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { printReferral } from "@/lib/referralPrinter";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const ESPECIALIDADES_DESTINO = [
  { value: "fisioterapia", label: "Fisioterapia" },
  { value: "fonoaudiologia", label: "Fonoaudiologia" },
  { value: "nutricao", label: "Nutrição" },
  { value: "psicologia", label: "Psicologia" },
  { value: "terapia_ocupacional", label: "Terapia Ocupacional" },
  { value: "outros", label: "Outros" },
];

const UBS_LIST = [
  "UBS Dr. Lauro Corrêa Pinto", "UBS Penta", "UBS Corino Guerreiro",
  "UBS Santa Luzia", "UBS Tânia Siqueira da Fonseca", "UBS Antônio Miléo",
  "Hospital Municipal de Oriximiná", "UBS Nossa Sra. das Graças",
  "UBS Fluvial Manoel Andrade", "UBS Ribeirinho", "Hospital Regional Menino Jesus",
];

interface Props {
  patientId: string;
  patientData: any;
  unidadeId?: string;
  professionalId?: string;
}

const PatientReferralHistory: React.FC<Props> = ({ patientId, patientData, unidadeId, professionalId }) => {
  const [referrals, setReferrals] = useState<PatientReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedReferral, setSelectedReferral] = useState<PatientReferral | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState<any>({
    especialidade_destino: "",
    ubs_origem: "",
    profissional_solicitante: "",
    tipo_encaminhamento: "ubs",
    cid: "",
    diagnostico_resumido: "",
    justificativa: "",
    data_encaminhamento: format(new Date(), "yyyy-MM-dd"),
    status: "ativo"
  });

  useEffect(() => {
    if (patientId) {
      loadReferrals();
    }
  }, [patientId]);

  const loadReferrals = async () => {
    setLoading(true);
    try {
      const data = await getPatientReferrals(patientId);
      setReferrals(data);
    } catch (error) {
      toast.error("Erro ao carregar histórico de encaminhamentos");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.especialidade_destino) {
      toast.error("Selecione a especialidade de destino");
      return;
    }

    setSaving(true);
    try {
      if (selectedReferral && modalOpen) {
        // Edit mode (not fully implemented in UI but service supports it)
        await updatePatientReferral(selectedReferral.id, formData);
        toast.success("Encaminhamento atualizado");
      } else {
        // Create mode
        const newReferral = await createPatientReferral({
          ...formData,
          patient_id: patientId,
          unidade_id: unidadeId,
          professional_id: professionalId
        });
        toast.success("Encaminhamento registrado com sucesso");
      }
      setModalOpen(false);
      loadReferrals();
    } catch (error) {
      toast.error("Erro ao salvar encaminhamento");
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, referralId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      await uploadReferralAttachment(referralId, file);
      toast.success("Arquivo anexado com sucesso");
      loadReferrals();
    } catch (error) {
      toast.error("Erro ao enviar arquivo");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAttachment = async (attachment: ReferralAttachment) => {
    if (!confirm("Tem certeza que deseja remover este anexo?")) return;

    try {
      await deleteReferralAttachment(attachment);
      toast.success("Anexo removido");
      loadReferrals();
    } catch (error) {
      toast.error("Erro ao remover anexo");
    }
  };

  const handleViewFile = async (filePath: string) => {
    try {
      const url = await getReferralFileUrl(filePath);
      window.open(url, "_blank");
    } catch (error) {
      toast.error("Erro ao abrir arquivo");
    }
  };

  const handlePrint = (referral: PatientReferral) => {
    printReferral(referral, patientData);
  };

  const openNewModal = () => {
    setSelectedReferral(null);
    setFormData({
      especialidade_destino: "",
      ubs_origem: "",
      profissional_solicitante: "",
      tipo_encaminhamento: "ubs",
      cid: "",
      diagnostico_resumido: "",
      justificativa: "",
      data_encaminhamento: format(new Date(), "yyyy-MM-dd"),
      status: "ativo"
    });
    setModalOpen(true);
  };

  const openViewModal = (referral: PatientReferral) => {
    setSelectedReferral(referral);
    setViewModalOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <History className="w-4 h-4" /> Histórico de Encaminhamentos
        </div>
        <Button size="sm" onClick={openNewModal} className="h-8 gap-1">
          <Plus className="w-4 h-4" /> Novo Encaminhamento
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : referrals.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <FileText className="w-10 h-10 mb-2 opacity-20" />
            <p className="text-sm">Nenhum encaminhamento registrado para este paciente.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[100px]">Data</TableHead>
                <TableHead>Especialidade</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Anexos</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referrals.map((ref) => (
                <TableRow key={ref.id} className="cursor-pointer hover:bg-muted/30" onClick={() => openViewModal(ref)}>
                  <TableCell className="font-medium text-xs">
                    {ref.data_encaminhamento ? format(new Date(ref.data_encaminhamento), "dd/MM/yy") : "-"}
                  </TableCell>
                  <TableCell className="text-xs font-semibold uppercase text-primary">
                    {ref.especialidade_destino}
                  </TableCell>
                  <TableCell className="text-xs">
                    {ref.ubs_origem || "---"}
                  </TableCell>
                  <TableCell>
                    {ref.attachments && ref.attachments.length > 0 ? (
                      <Badge variant="secondary" className="text-[10px] h-4">
                        {ref.attachments.length} {ref.attachments.length === 1 ? "anexo" : "anexos"}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-[10px]">Sem anexos</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handlePrint(ref)}>
                        <Printer className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={async () => {
                        if (confirm("Deseja excluir este encaminhamento?")) {
                          await deletePatientReferral(ref.id);
                          toast.success("Encaminhamento removido");
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

      {/* Modal: Novo Encaminhamento */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo Encaminhamento (UBS)</DialogTitle>
            <DialogDescription>
              Registre um novo encaminhamento para o histórico do paciente.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="md:col-span-2 p-3 rounded-lg border-2 border-primary/30 bg-primary/5">
              <Label className="text-sm font-semibold text-primary">Especialidade Destino *</Label>
              <Select value={formData.especialidade_destino} onValueChange={(v) => setFormData({...formData, especialidade_destino: v})}>
                <SelectTrigger className="border-primary/30 mt-1">
                  <SelectValue placeholder="Selecione a especialidade" />
                </SelectTrigger>
                <SelectContent>
                  {ESPECIALIDADES_DESTINO.map((e) => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>UBS origem</Label>
              <Select value={formData.ubs_origem} onValueChange={(v) => setFormData({...formData, ubs_origem: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione a UBS" /></SelectTrigger>
                <SelectContent>
                  {UBS_LIST.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Tipo encaminhamento</Label>
              <Select value={formData.tipo_encaminhamento} onValueChange={(v) => setFormData({...formData, tipo_encaminhamento: v})}>
                <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
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
              <Input 
                value={formData.profissional_solicitante}
                onChange={(e) => setFormData({...formData, profissional_solicitante: e.target.value.toUpperCase()})}
                placeholder="NOME DO PROFISSIONAL"
              />
            </div>

            <div>
              <Label>CID-10</Label>
              <Input 
                value={formData.cid}
                onChange={(e) => setFormData({...formData, cid: e.target.value.toUpperCase()})}
                placeholder="Ex: G80.0"
              />
            </div>

            <div className="md:col-span-2">
              <Label>Diagnóstico resumido</Label>
              <Input 
                value={formData.diagnostico_resumido}
                onChange={(e) => setFormData({...formData, diagnostico_resumido: e.target.value})}
                placeholder="Resumo em uma linha"
              />
            </div>

            <div className="md:col-span-2">
              <Label>Justificativa</Label>
              <Textarea 
                value={formData.justificativa}
                onChange={(e) => setFormData({...formData, justificativa: e.target.value})}
                placeholder="Justificativa clínica para encaminhamento"
                className="min-h-[80px]"
              />
            </div>

            <div>
              <Label>Data encaminhamento</Label>
              <Input 
                type="date"
                value={formData.data_encaminhamento}
                onChange={(e) => setFormData({...formData, data_encaminhamento: e.target.value})}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Salvar Encaminhamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Visualizar Detalhes */}
      <Dialog open={viewModalOpen} onOpenChange={setViewModalOpen}>
        <DialogContent className="max-w-2xl">
          {selectedReferral && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between pr-6">
                  <DialogTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    Encaminhamento - {selectedReferral.especialidade_destino.toUpperCase()}
                  </DialogTitle>
                  <Badge variant={selectedReferral.status === 'ativo' ? 'default' : 'secondary'}>
                    {selectedReferral.status.toUpperCase()}
                  </Badge>
                </div>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground block mb-1">Data:</span>
                    <span className="font-semibold">{selectedReferral.data_encaminhamento ? format(new Date(selectedReferral.data_encaminhamento), "dd/MM/yyyy") : "-"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-1">UBS Origem:</span>
                    <span className="font-semibold">{selectedReferral.ubs_origem || "Não informado"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-1">Profissional Solicitante:</span>
                    <span className="font-semibold">{selectedReferral.profissional_solicitante || "Não informado"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-1">CID-10:</span>
                    <span className="font-semibold">{selectedReferral.cid || "Não informado"}</span>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <span className="text-muted-foreground text-sm block mb-1">Diagnóstico Resumido:</span>
                  <p className="text-sm font-medium">{selectedReferral.diagnostico_resumido || "---"}</p>
                </div>

                <div className="border-t pt-3">
                  <span className="text-muted-foreground text-sm block mb-1">Justificativa:</span>
                  <div className="text-sm bg-muted/30 p-3 rounded-md min-h-[60px] whitespace-pre-wrap italic">
                    {selectedReferral.justificativa || "Nenhuma justificativa fornecida."}
                  </div>
                </div>

                <div className="border-t pt-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold flex items-center gap-1.5">
                      <Upload className="w-4 h-4" /> Documentos Anexados
                    </span>
                    <div className="relative">
                      <input 
                        type="file" 
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                        onChange={(e) => handleFileUpload(e, selectedReferral.id)}
                        disabled={uploading}
                      />
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={uploading}>
                        {uploading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                        Anexar Arquivo
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {selectedReferral.attachments && selectedReferral.attachments.length > 0 ? (
                      selectedReferral.attachments.map((file) => (
                        <div key={file.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50 border text-xs">
                          <div className="flex items-center gap-2 truncate">
                            <FileIcon className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                            <span className="truncate">{file.file_name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleViewFile(file.file_path)}>
                              <Eye className="w-3 h-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => handleDeleteAttachment(file)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground italic text-center py-2">
                        Nenhum anexo para este encaminhamento.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" className="w-full sm:w-auto" onClick={() => setViewModalOpen(false)}>Fechar</Button>
                <Button className="w-full sm:w-auto gap-2" onClick={() => handlePrint(selectedReferral)}>
                  <Printer className="w-4 h-4" /> Imprimir Guia
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PatientReferralHistory;
