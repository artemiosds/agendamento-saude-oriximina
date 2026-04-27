import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Eye, FlaskConical, Calendar, Building2, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface ResultadosExamesProps {
  pacienteId: string;
  pacienteNome?: string;
  prontuarioId?: string;
  atendimentoId?: string;
  unidadeId?: string;
  canEdit?: boolean;
  canDelete?: boolean;
}

interface ExameRow {
  id: string;
  paciente_id: string;
  prontuario_id: string;
  atendimento_id: string;
  unidade_id: string;
  profissional_id: string;
  profissional_nome: string;
  nome_exame: string;
  tipo_exame: string;
  data_exame: string | null;
  laboratorio: string;
  medico_solicitante: string;
  resultado_descrito: string;
  interpretacao_profissional: string;
  observacoes_medicas: string;
  status: string;
  tipo_atendimento_vinculado: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const STATUS_OPTIONS = [
  { value: "pendente", label: "Pendente" },
  { value: "liberado", label: "Liberado" },
  { value: "revisado", label: "Revisado" },
  { value: "urgente", label: "Urgente" },
];

const TIPO_ATEND_OPTIONS = [
  { value: "retorno", label: "Retorno" },
  { value: "avaliacao_inicial", label: "Avaliação Inicial" },
  { value: "procedimentos", label: "Procedimentos" },
  { value: "urgencia", label: "Urgência" },
];

const STATUS_VARIANT: Record<string, string> = {
  pendente: "bg-muted text-muted-foreground",
  liberado: "bg-success/15 text-success border-success/30",
  revisado: "bg-primary/15 text-primary border-primary/30",
  urgente: "bg-destructive/15 text-destructive border-destructive/30",
};

const empty = {
  nome_exame: "",
  tipo_exame: "",
  data_exame: "",
  laboratorio: "",
  medico_solicitante: "",
  resultado_descrito: "",
  interpretacao_profissional: "",
  observacoes_medicas: "",
  status: "liberado",
  tipo_atendimento_vinculado: "",
};

export default function ResultadosExames({
  pacienteId,
  pacienteNome,
  prontuarioId,
  atendimentoId,
  unidadeId,
  canEdit = true,
  canDelete = true,
}: ResultadosExamesProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<ExameRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewItem, setViewItem] = useState<ExameRow | null>(null);
  const [form, setForm] = useState({ ...empty });

  const load = async () => {
    if (!pacienteId) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("prontuario_exames")
      .select("*")
      .eq("paciente_id", pacienteId)
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível carregar resultados de exames.");
      return;
    }
    setItems((data || []) as ExameRow[]);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pacienteId]);

  const openNew = () => {
    setEditId(null);
    setForm({ ...empty });
    setDialogOpen(true);
  };

  const openEdit = (row: ExameRow) => {
    setEditId(row.id);
    setForm({
      nome_exame: row.nome_exame || "",
      tipo_exame: row.tipo_exame || "",
      data_exame: row.data_exame || "",
      laboratorio: row.laboratorio || "",
      medico_solicitante: row.medico_solicitante || "",
      resultado_descrito: row.resultado_descrito || "",
      interpretacao_profissional: row.interpretacao_profissional || "",
      observacoes_medicas: row.observacoes_medicas || "",
      status: row.status || "liberado",
      tipo_atendimento_vinculado: row.tipo_atendimento_vinculado || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!pacienteId) {
      toast.error("Paciente não identificado.");
      return;
    }
    const payload: any = {
      paciente_id: pacienteId,
      prontuario_id: prontuarioId || "",
      atendimento_id: atendimentoId || "",
      unidade_id: unidadeId || "",
      profissional_id: user?.id || "",
      profissional_nome: user?.nome || "",
      nome_exame: form.nome_exame || "",
      tipo_exame: form.tipo_exame || "",
      data_exame: form.data_exame ? form.data_exame : null,
      laboratorio: form.laboratorio || "",
      medico_solicitante: form.medico_solicitante || "",
      resultado_descrito: form.resultado_descrito || "",
      interpretacao_profissional: form.interpretacao_profissional || "",
      observacoes_medicas: form.observacoes_medicas || "",
      status: form.status || "liberado",
      tipo_atendimento_vinculado: form.tipo_atendimento_vinculado || "",
      created_by: user?.id || "",
    };
    if (editId) {
      const { error } = await (supabase as any)
        .from("prontuario_exames")
        .update(payload)
        .eq("id", editId);
      if (error) {
        toast.error("Erro ao atualizar resultado.");
        return;
      }
      toast.success("Resultado atualizado.");
    } else {
      const { error } = await (supabase as any).from("prontuario_exames").insert(payload);
      if (error) {
        toast.error("Erro ao salvar resultado.");
        return;
      }
      toast.success("Resultado registrado.");
    }
    setDialogOpen(false);
    setEditId(null);
    setForm({ ...empty });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este resultado de exame?")) return;
    const { error } = await (supabase as any).from("prontuario_exames").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir.");
      return;
    }
    toast.success("Resultado excluído.");
    load();
  };

  const fmtDate = (d?: string | null) => {
    if (!d) return "";
    try {
      const [y, m, day] = d.split("T")[0].split("-");
      return `${day}/${m}/${y}`;
    } catch {
      return d;
    }
  };

  const fmtDateTime = (d?: string) => {
    if (!d) return "";
    try {
      return new Date(d).toLocaleString("pt-BR");
    } catch {
      return d;
    }
  };

  const statusLabel = (s: string) => STATUS_OPTIONS.find((o) => o.value === s)?.label || s || "—";
  const tipoAtendLabel = (s: string) => TIPO_ATEND_OPTIONS.find((o) => o.value === s)?.label || s || "";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-primary" />
          <h3 className="font-display text-base font-semibold">Resultados de Exames</h3>
          <Badge variant="secondary" className="text-xs">{items.length}</Badge>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openNew} className="gradient-primary text-primary-foreground">
            <Plus className="w-4 h-4 mr-1.5" />
            Adicionar resultado de exame
          </Button>
        )}
      </div>

      {loading && <p className="text-xs text-muted-foreground">Carregando…</p>}

      {!loading && items.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          Nenhum resultado de exame registrado para este paciente.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map((row) => (
          <Card key={row.id} className="border shadow-sm">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{row.nome_exame || "Exame sem nome"}</p>
                  {row.tipo_exame && (
                    <p className="text-xs text-muted-foreground truncate">{row.tipo_exame}</p>
                  )}
                </div>
                {row.status && (
                  <Badge className={`text-[10px] border ${STATUS_VARIANT[row.status] || STATUS_VARIANT.liberado}`}>
                    {statusLabel(row.status)}
                  </Badge>
                )}
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                {row.data_exame && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" /> {fmtDate(row.data_exame)}
                  </div>
                )}
                {row.laboratorio && (
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3 h-3" /> {row.laboratorio}
                  </div>
                )}
                {row.medico_solicitante && (
                  <div className="flex items-center gap-1.5">
                    <Stethoscope className="w-3 h-3" /> Solic.: {row.medico_solicitante}
                  </div>
                )}
              </div>

              {row.resultado_descrito && (
                <p className="text-xs line-clamp-2 text-foreground/80">{row.resultado_descrito}</p>
              )}

              <div className="flex items-center justify-between pt-1 border-t">
                <div className="text-[10px] text-muted-foreground">
                  {row.profissional_nome || "—"} • {fmtDateTime(row.created_at)}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setViewItem(row); setViewOpen(true); }}>
                    <Eye className="w-4 h-4" />
                  </Button>
                  {canEdit && (
                    <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(row.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Form dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              {editId ? "Editar" : "Adicionar"} Resultado de Exame
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Nome do exame</Label>
              <Input value={form.nome_exame} onChange={(e) => setForm({ ...form, nome_exame: e.target.value })} placeholder="Ex.: Hemograma completo" />
            </div>
            <div>
              <Label>Tipo de exame</Label>
              <Input value={form.tipo_exame} onChange={(e) => setForm({ ...form, tipo_exame: e.target.value })} placeholder="Ex.: Laboratorial, Imagem…" />
            </div>
            <div>
              <Label>Data do exame</Label>
              <Input type="date" value={form.data_exame} onChange={(e) => setForm({ ...form, data_exame: e.target.value })} />
            </div>
            <div>
              <Label>Laboratório</Label>
              <Input value={form.laboratorio} onChange={(e) => setForm({ ...form, laboratorio: e.target.value })} />
            </div>
            <div>
              <Label>Médico solicitante</Label>
              <Input value={form.medico_solicitante} onChange={(e) => setForm({ ...form, medico_solicitante: e.target.value })} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de atendimento vinculado</Label>
              <Select value={form.tipo_atendimento_vinculado || "__none"} onValueChange={(v) => setForm({ ...form, tipo_atendimento_vinculado: v === "__none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Nenhum</SelectItem>
                  {TIPO_ATEND_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Resultado descrito</Label>
              <Textarea rows={4} value={form.resultado_descrito} onChange={(e) => setForm({ ...form, resultado_descrito: e.target.value })} placeholder="Transcreva os achados/valores principais do exame…" />
            </div>
            <div className="md:col-span-2">
              <Label>Interpretação do profissional</Label>
              <Textarea rows={3} value={form.interpretacao_profissional} onChange={(e) => setForm({ ...form, interpretacao_profissional: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Observações médicas</Label>
              <Textarea rows={3} value={form.observacoes_medicas} onChange={(e) => setForm({ ...form, observacoes_medicas: e.target.value })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="gradient-primary text-primary-foreground">
              {editId ? "Salvar alterações" : "Salvar resultado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Resultado de Exame</DialogTitle>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-xs text-muted-foreground">Nome</span><p className="font-medium">{viewItem.nome_exame || "—"}</p></div>
                <div><span className="text-xs text-muted-foreground">Tipo</span><p>{viewItem.tipo_exame || "—"}</p></div>
                <div><span className="text-xs text-muted-foreground">Data do exame</span><p>{fmtDate(viewItem.data_exame) || "—"}</p></div>
                <div><span className="text-xs text-muted-foreground">Status</span><p>{statusLabel(viewItem.status)}</p></div>
                <div><span className="text-xs text-muted-foreground">Laboratório</span><p>{viewItem.laboratorio || "—"}</p></div>
                <div><span className="text-xs text-muted-foreground">Médico solicitante</span><p>{viewItem.medico_solicitante || "—"}</p></div>
                <div><span className="text-xs text-muted-foreground">Tipo de atendimento</span><p>{tipoAtendLabel(viewItem.tipo_atendimento_vinculado) || "—"}</p></div>
                <div><span className="text-xs text-muted-foreground">Registrado por</span><p>{viewItem.profissional_nome || "—"}</p></div>
              </div>
              {viewItem.resultado_descrito && (
                <div><span className="text-xs text-muted-foreground">Resultado descrito</span><p className="whitespace-pre-wrap">{viewItem.resultado_descrito}</p></div>
              )}
              {viewItem.interpretacao_profissional && (
                <div><span className="text-xs text-muted-foreground">Interpretação</span><p className="whitespace-pre-wrap">{viewItem.interpretacao_profissional}</p></div>
              )}
              {viewItem.observacoes_medicas && (
                <div><span className="text-xs text-muted-foreground">Observações</span><p className="whitespace-pre-wrap">{viewItem.observacoes_medicas}</p></div>
              )}
              <p className="text-[11px] text-muted-foreground border-t pt-2">
                Criado em {fmtDateTime(viewItem.created_at)} • Atualizado em {fmtDateTime(viewItem.updated_at)}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
