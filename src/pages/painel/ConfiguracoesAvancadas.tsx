import React, { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { normalizePhone, formatPhoneForDisplay, applyPhoneMask } from "@/lib/phoneUtils";
import { Link } from "react-router-dom";
import {
  Clock, ClipboardList, MessageSquare, Users, DoorOpen,
  CalendarOff, FileDown, Database, FlaskConical, ExternalLink,
  Plus, Pencil, Trash2, Save, Send, Check, X, AlertTriangle, Info
} from "lucide-react";

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// ─── Section 1: Horários ──────────────────────────────────────────────────────
const HorariosSection: React.FC = () => {
  const [horarios, setHorarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadHorarios = useCallback(async () => {
    const { data } = await supabase
      .from("horarios_funcionamento")
      .select("*")
      .order("dia_semana");
    if (data) setHorarios(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadHorarios(); }, [loadHorarios]);

  const updateField = (idx: number, field: string, value: any) => {
    setHorarios(prev => prev.map((h, i) => i === idx ? { ...h, [field]: value } : h));
  };

  const saveHorarios = async () => {
    for (const h of horarios) {
      await supabase.from("horarios_funcionamento").update({
        ativo: h.ativo,
        hora_inicio: h.hora_inicio,
        hora_fim: h.hora_fim,
        intervalo_slots: h.intervalo_slots,
        updated_at: new Date().toISOString(),
      }).eq("id", h.id);
    }
    toast.success("✅ Horários salvos!");
    setConfirmOpen(false);
  };

  if (loading) return <div className="p-4 text-muted-foreground">Carregando...</div>;

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Horários de Funcionamento</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {horarios.map((h, idx) => (
          <div key={h.id} className="flex items-center gap-4 flex-wrap border-b pb-3">
            <div className="w-24 font-medium text-sm">{DIAS_SEMANA[h.dia_semana]}</div>
            <div className="flex items-center gap-2">
              <Switch checked={h.ativo} onCheckedChange={v => updateField(idx, "ativo", v)} />
              <span className="text-xs text-muted-foreground">{h.ativo ? "Ativo" : "Inativo"}</span>
            </div>
            {h.ativo && (
              <>
                <div className="flex items-center gap-1">
                  <Label className="text-xs">Início:</Label>
                  <Input type="time" value={h.hora_inicio} onChange={e => updateField(idx, "hora_inicio", e.target.value)} className="w-28 h-8 text-sm" />
                </div>
                <div className="flex items-center gap-1">
                  <Label className="text-xs">Fim:</Label>
                  <Input type="time" value={h.hora_fim} onChange={e => updateField(idx, "hora_fim", e.target.value)} className="w-28 h-8 text-sm" />
                </div>
                <div className="flex items-center gap-1">
                  <Label className="text-xs">Intervalo:</Label>
                  <Select value={String(h.intervalo_slots)} onValueChange={v => updateField(idx, "intervalo_slots", Number(v))}>
                    <SelectTrigger className="w-24 h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 min</SelectItem>
                      <SelectItem value="30">30 min</SelectItem>
                      <SelectItem value="60">60 min</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        ))}
        <Button onClick={() => setConfirmOpen(true)} className="mt-4"><Save className="h-4 w-4 mr-2" /> Salvar Horários</Button>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar alteração?</AlertDialogTitle>
              <AlertDialogDescription>Será aplicada imediatamente.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={saveHorarios}>Confirmar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
};

// ─── Section 2: Regras ────────────────────────────────────────────────────────
const RegrasSection: React.FC = () => {
  const { configuracoes, setConfiguracoes } = useData();
  const [regras, setRegras] = useState({
    antecedencia_minima_horas: 2,
    antecedencia_maxima_dias: 90,
    limite_agendamentos_mes: 4,
    permitir_mesmo_dia: true,
  });
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (configuracoes?.regras_agendamento) {
      setRegras(prev => ({ ...prev, ...configuracoes.regras_agendamento }));
    }
  }, [configuracoes]);

  const saveRegras = async () => {
    const updated = { ...configuracoes, regras_agendamento: regras };
    const { error } = await supabase.from("system_config").upsert({
      id: "default",
      configuracoes: updated as any,
      updated_at: new Date().toISOString(),
    });
    if (!error) {
      setConfiguracoes(updated);
      toast.success("✅ Regras de agendamento salvas!");
    } else toast.error("Erro ao salvar regras");
    setConfirmOpen(false);
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" /> Regras de Agendamento</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Antecedência mínima para agendar (horas)</Label>
            <Input type="number" min={0} value={regras.antecedencia_minima_horas} onChange={e => setRegras(r => ({ ...r, antecedencia_minima_horas: Number(e.target.value) }))} />
            <p className="text-xs text-muted-foreground">Ex: 2 = não pode agendar com menos de 2h de antecedência</p>
          </div>
          <div className="space-y-2">
            <Label>Antecedência máxima para agendar (dias)</Label>
            <Input type="number" min={1} value={regras.antecedencia_maxima_dias} onChange={e => setRegras(r => ({ ...r, antecedencia_maxima_dias: Number(e.target.value) }))} />
          </div>
          <div className="space-y-2">
            <Label>Limite de agendamentos por paciente/mês</Label>
            <Input type="number" min={1} value={regras.limite_agendamentos_mes} onChange={e => setRegras(r => ({ ...r, limite_agendamentos_mes: Number(e.target.value) }))} />
          </div>
          <div className="flex items-center gap-3 pt-6">
            <Switch checked={regras.permitir_mesmo_dia} onCheckedChange={v => setRegras(r => ({ ...r, permitir_mesmo_dia: v }))} />
            <Label>Permitir agendamento no mesmo dia</Label>
          </div>
        </div>
        <Button onClick={() => setConfirmOpen(true)}><Save className="h-4 w-4 mr-2" /> Salvar Regras</Button>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar alteração?</AlertDialogTitle>
              <AlertDialogDescription>Será aplicada imediatamente.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={saveRegras}>Confirmar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
};

// ─── Section 3: Notificações ──────────────────────────────────────────────────
const NotificacoesSection: React.FC = () => {
  const { configuracoes, setConfiguracoes } = useData();
  const [notif, setNotif] = useState({
    enviar_confirmacao: true,
    enviar_lembrete_24h: true,
    enviar_lembrete_1h: true,
    enviar_cancelamento: true,
    enviar_falta: false,
    enviar_remarcacao: true,
    enviar_troca_horario: true,
    lembrete_antecipado_1_horas: 24,
    lembrete_antecipado_2_minutos: 60,
    horario_envio_inicio: "07:00",
    horario_envio_fim: "20:00",
  });
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (configuracoes?.regras_notificacao) {
      setNotif(prev => ({ ...prev, ...configuracoes.regras_notificacao }));
    }
  }, [configuracoes]);

  const saveNotif = async () => {
    const updated = { ...configuracoes, regras_notificacao: notif };
    const { error } = await supabase.from("system_config").upsert({
      id: "default",
      configuracoes: updated as any,
      updated_at: new Date().toISOString(),
    });
    if (!error) {
      setConfiguracoes(updated);
      toast.success("✅ Configurações de notificação salvas!");
    } else toast.error("Erro ao salvar");
    setConfirmOpen(false);
  };

  const toggles = [
    { key: "enviar_confirmacao", label: "Enviar confirmação ao agendar" },
    { key: "enviar_lembrete_24h", label: "Enviar lembrete 24h antes" },
    { key: "enviar_lembrete_1h", label: "Enviar lembrete 1h antes" },
    { key: "enviar_cancelamento", label: "Enviar aviso de cancelamento" },
    { key: "enviar_falta", label: "Enviar aviso de falta" },
    { key: "enviar_remarcacao", label: "Enviar aviso de remarcação" },
    { key: "enviar_troca_horario", label: "Enviar aviso de troca de horário" },
  ];

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" /> Notificações WhatsApp</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Gatilhos de envio</h4>
          {toggles.map(t => (
            <div key={t.key} className="flex items-center gap-3">
              <Switch checked={(notif as any)[t.key]} onCheckedChange={v => setNotif(n => ({ ...n, [t.key]: v }))} />
              <Label className="text-sm">{t.label}</Label>
            </div>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Lembrete antecipado 1 (horas antes)</Label>
            <Input type="number" min={1} value={notif.lembrete_antecipado_1_horas} onChange={e => setNotif(n => ({ ...n, lembrete_antecipado_1_horas: Number(e.target.value) }))} />
          </div>
          <div className="space-y-2">
            <Label>Lembrete antecipado 2 (minutos antes)</Label>
            <Input type="number" min={1} value={notif.lembrete_antecipado_2_minutos} onChange={e => setNotif(n => ({ ...n, lembrete_antecipado_2_minutos: Number(e.target.value) }))} />
          </div>
          <div className="space-y-2">
            <Label>Horário permitido — Início</Label>
            <Input type="time" value={notif.horario_envio_inicio} onChange={e => setNotif(n => ({ ...n, horario_envio_inicio: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Horário permitido — Fim</Label>
            <Input type="time" value={notif.horario_envio_fim} onChange={e => setNotif(n => ({ ...n, horario_envio_fim: e.target.value }))} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1"><Info className="h-3 w-3" /> Mensagens fora da janela serão enfileiradas e enviadas quando abrir.</p>
        <Button onClick={() => setConfirmOpen(true)}><Save className="h-4 w-4 mr-2" /> Salvar Notificações</Button>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar alteração?</AlertDialogTitle>
              <AlertDialogDescription>Será aplicada imediatamente.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={saveNotif}>Confirmar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
};

// ─── Section 4: Equipe (links + Especialidades CRUD) ──────────────────────────
const EquipeSection: React.FC = () => {
  const [especialidades, setEspecialidades] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ nome: "", cor: "#3b82f6", ativo: true });
  const [toDelete, setToDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("especialidades").select("*").order("nome");
    if (data) setEspecialidades(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ nome: "", cor: "#3b82f6", ativo: true }); setModalOpen(true); };
  const openEdit = (e: any) => { setEditing(e); setForm({ nome: e.nome, cor: e.cor, ativo: e.ativo }); setModalOpen(true); };

  const save = async () => {
    if (!form.nome.trim()) { toast.error("Nome obrigatório"); return; }
    if (editing) {
      await supabase.from("especialidades").update({ ...form, updated_at: new Date().toISOString() }).eq("id", editing.id);
    } else {
      await supabase.from("especialidades").insert({ ...form });
    }
    toast.success("✅ Especialidade salva!");
    setModalOpen(false);
    load();
  };

  const confirmDelete = async () => {
    if (toDelete) await supabase.from("especialidades").delete().eq("id", toDelete);
    toast.success("Especialidade removida");
    setDeleteOpen(false);
    setToDelete(null);
    load();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Profissionais</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">Gerencie profissionais na página dedicada:</p>
          <Button variant="outline" asChild>
            <Link to="/painel/funcionarios"><ExternalLink className="h-4 w-4 mr-2" /> Abrir Gestão de Funcionários</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Especialidades</CardTitle>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Cor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {especialidades.map(e => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.nome}</TableCell>
                  <TableCell><Badge style={{ backgroundColor: e.cor, color: "#fff" }}>{e.cor}</Badge></TableCell>
                  <TableCell>{e.ativo ? <Badge variant="default">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}</TableCell>
                  <TableCell className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => { setToDelete(e.id); setDeleteOpen(true); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {especialidades.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Nenhuma especialidade cadastrada</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar" : "Nova"} Especialidade</DialogTitle><DialogDescription>Preencha os dados abaixo.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome</Label><Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Cor</Label><Input type="color" value={form.cor} onChange={e => setForm(f => ({ ...f, cor: e.target.value }))} className="h-10 w-20" /></div>
            <div className="flex items-center gap-3"><Switch checked={form.ativo} onCheckedChange={v => setForm(f => ({ ...f, ativo: v }))} /><Label>Ativo</Label></div>
          </div>
          <DialogFooter><Button onClick={save}><Save className="h-4 w-4 mr-2" /> Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Excluir especialidade?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ─── Section 5: Salas ─────────────────────────────────────────────────────────
const SalasSection: React.FC = () => (
  <Card>
    <CardHeader><CardTitle className="flex items-center gap-2"><DoorOpen className="h-5 w-5" /> Salas e Recursos</CardTitle></CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground mb-3">Gerencie salas na página dedicada:</p>
      <Button variant="outline" asChild>
        <Link to="/painel/unidades"><ExternalLink className="h-4 w-4 mr-2" /> Abrir Gestão de Unidades e Salas</Link>
      </Button>
    </CardContent>
  </Card>
);

// ─── Section 6: Bloqueios ─────────────────────────────────────────────────────
const BloqueiosSection: React.FC = () => (
  <Card>
    <CardHeader><CardTitle className="flex items-center gap-2"><CalendarOff className="h-5 w-5" /> Feriados e Bloqueios</CardTitle></CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground mb-3">Gerencie bloqueios e feriados na página dedicada:</p>
      <Button variant="outline" asChild>
        <Link to="/painel/bloqueios"><ExternalLink className="h-4 w-4 mr-2" /> Abrir Gestão de Bloqueios</Link>
      </Button>
    </CardContent>
  </Card>
);

// ─── Section 7: Importação ────────────────────────────────────────────────────
const ImportacaoSection: React.FC = () => (
  <Card>
    <CardHeader><CardTitle className="flex items-center gap-2"><FileDown className="h-5 w-5" /> Importação de Pacientes</CardTitle></CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground mb-3">A ferramenta de importação CSV está disponível na tela de Pacientes:</p>
      <Button variant="outline" asChild>
        <Link to="/painel/pacientes"><ExternalLink className="h-4 w-4 mr-2" /> Abrir Pacientes (Importar CSV)</Link>
      </Button>
    </CardContent>
  </Card>
);

// ─── Section 8: Dados ─────────────────────────────────────────────────────────
const DadosSection: React.FC = () => {
  const [stats, setStats] = useState({ pacientes: 0, agendamentos: 0, notificacoes: 0, erros: 0 });
  const [exporting, setExporting] = useState("");

  useEffect(() => {
    (async () => {
      const [p, a, n, e] = await Promise.all([
        supabase.from("pacientes").select("id", { count: "exact", head: true }),
        supabase.from("agendamentos").select("id", { count: "exact", head: true }),
        supabase.from("notification_logs").select("id", { count: "exact", head: true }).eq("status", "enviado"),
        supabase.from("notification_logs").select("id", { count: "exact", head: true }).eq("status", "erro"),
      ]);
      setStats({
        pacientes: p.count || 0,
        agendamentos: a.count || 0,
        notificacoes: n.count || 0,
        erros: e.count || 0,
      });
    })();
  }, []);

  const exportCSV = async (table: string, filename: string) => {
    setExporting(table);
    try {
      let allData: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data } = await supabase.from(table as any).select("*").range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      if (allData.length === 0) { toast.error("Nenhum registro encontrado"); return; }
      const headers = Object.keys(allData[0]);
      const csv = [headers.join(","), ...allData.map(r => headers.map(h => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      toast.success(`✅ ${allData.length} registros exportados!`);
    } catch { toast.error("Erro na exportação"); }
    setExporting("");
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" /> Backup e Dados</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Total Pacientes", value: stats.pacientes, color: "text-primary" },
            { label: "Total Agendamentos", value: stats.agendamentos, color: "text-primary" },
            { label: "Notificações Enviadas", value: stats.notificacoes, color: "text-primary" },
            { label: "Erros de Envio", value: stats.erros, color: "text-destructive" },
          ].map(s => (
            <div key={s.label} className="border rounded-lg p-4 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => exportCSV("pacientes", "pacientes.csv")} disabled={!!exporting}>
            <FileDown className="h-4 w-4 mr-2" /> {exporting === "pacientes" ? "Exportando..." : "Exportar Pacientes"}
          </Button>
          <Button variant="outline" onClick={() => exportCSV("agendamentos", "agendamentos.csv")} disabled={!!exporting}>
            <FileDown className="h-4 w-4 mr-2" /> {exporting === "agendamentos" ? "Exportando..." : "Exportar Agendamentos"}
          </Button>
          <Button variant="outline" onClick={() => exportCSV("notification_logs", "notificacoes.csv")} disabled={!!exporting}>
            <FileDown className="h-4 w-4 mr-2" /> {exporting === "notification_logs" ? "Exportando..." : "Exportar Notificações"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Section 9: Teste ─────────────────────────────────────────────────────────
const TesteSection: React.FC = () => {
  const [telefone, setTelefone] = useState("");
  const [tipo, setTipo] = useState("teste");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [preview, setPreview] = useState("");

  const tipos = [
    { value: "teste", label: "Mensagem de teste" },
    { value: "confirmacao", label: "Confirmação de agendamento" },
    { value: "lembrete_24h", label: "Lembrete 24h" },
    { value: "lembrete_1h", label: "Lembrete 1h" },
    { value: "cancelamento", label: "Cancelamento" },
    { value: "remarcacao", label: "Remarcação" },
  ];

  useEffect(() => {
    const previews: Record<string, string> = {
      teste: "🏥 *Clínica*\n\n🧪 *Mensagem de Teste*\nEsta é uma mensagem de teste do sistema de notificações.\n\n✅ Se você recebeu esta mensagem, a integração está funcionando.",
      confirmacao: "🏥 *Clínica*\n\n✅ *Agendamento Confirmado*\nOlá, *João*!\n📅 Data: 15/04/2026\n🕐 Hora: 09:00\n👨‍⚕️ Dr. Silva - Fisioterapia",
      lembrete_24h: "🏥 *Clínica*\n\n⏰ *Lembrete - Amanhã*\nOlá, *João*!\n📅 Data: 15/04/2026\n🕐 Hora: 09:00\n👨‍⚕️ Dr. Silva",
      lembrete_1h: "🏥 *Clínica*\n\n⏰ *Lembrete - Em 1 hora*\nOlá, *João*!\n🕐 Hora: 09:00\n👨‍⚕️ Dr. Silva",
      cancelamento: "🏥 *Clínica*\n\n❌ *Agendamento Cancelado*\nOlá, *João*!\nSeu agendamento de 15/04/2026 às 09:00 foi cancelado.",
      remarcacao: "🏥 *Clínica*\n\n🔄 *Agendamento Remarcado*\nOlá, *João*!\n📅 Nova data: 20/04/2026\n🕐 Novo horário: 10:00",
    };
    setPreview(previews[tipo] || "");
  }, [tipo]);

  const enviarTeste = async () => {
    const normalized = normalizePhone(telefone);
    if (!normalized) { toast.error("Telefone inválido — use formato (93) 99999-0000"); return; }
    setSending(true);
    setResult(null);
    try {
      const { data: config } = await supabase.from("clinica_config").select("*").limit(1).single();
      if (!config?.evolution_instance_name) { setResult({ ok: false, message: "Instância Evolution não configurada" }); return; }
      const res = await fetch(`${config.evolution_base_url}/message/sendText/${config.evolution_instance_name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.evolution_api_key },
        body: JSON.stringify({ number: normalized, text: preview.replace(/\n/g, "\n") }),
      });
      if (res.ok) {
        setResult({ ok: true, message: "Mensagem enviada com sucesso!" });
        toast.success("✅ Enviado!");
      } else {
        const err = await res.text();
        setResult({ ok: false, message: err });
        toast.error("Erro no envio");
      }
    } catch (e: any) {
      setResult({ ok: false, message: e.message });
    }
    setSending(false);
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><FlaskConical className="h-5 w-5" /> Teste de Disparo</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Número de teste</Label>
            <Input
              placeholder="(93) 99999-0000"
              value={telefone}
              onChange={e => setTelefone(applyPhoneMask(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label>Tipo de mensagem</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {tipos.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Prévia da mensagem</Label>
          <pre className="bg-muted p-4 rounded-lg text-sm whitespace-pre-wrap font-mono border">{preview}</pre>
        </div>
        <Button onClick={enviarTeste} disabled={sending}>
          <Send className="h-4 w-4 mr-2" /> {sending ? "Enviando..." : "Enviar mensagem de teste"}
        </Button>
        {result && (
          <div className={`flex items-center gap-2 p-3 rounded-lg border ${result.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
            {result.ok ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
            <span className="text-sm">{result.message}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const ConfiguracoesAvancadas: React.FC = () => {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border">
        <AlertTriangle className="h-5 w-5 text-primary shrink-0" />
        <p className="text-sm">⚙️ Todas as configurações desta página têm efeito imediato em todo o sistema.</p>
      </div>

      <Tabs defaultValue="horarios" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted p-1">
          <TabsTrigger value="horarios" className="text-xs gap-1"><Clock className="h-3 w-3" /> Horários</TabsTrigger>
          <TabsTrigger value="regras" className="text-xs gap-1"><ClipboardList className="h-3 w-3" /> Regras</TabsTrigger>
          <TabsTrigger value="notificacoes" className="text-xs gap-1"><MessageSquare className="h-3 w-3" /> Notificações</TabsTrigger>
          <TabsTrigger value="equipe" className="text-xs gap-1"><Users className="h-3 w-3" /> Equipe</TabsTrigger>
          <TabsTrigger value="salas" className="text-xs gap-1"><DoorOpen className="h-3 w-3" /> Salas</TabsTrigger>
          <TabsTrigger value="bloqueios" className="text-xs gap-1"><CalendarOff className="h-3 w-3" /> Bloqueios</TabsTrigger>
          <TabsTrigger value="importacao" className="text-xs gap-1"><FileDown className="h-3 w-3" /> Importação</TabsTrigger>
          <TabsTrigger value="dados" className="text-xs gap-1"><Database className="h-3 w-3" /> Dados</TabsTrigger>
          <TabsTrigger value="teste" className="text-xs gap-1"><FlaskConical className="h-3 w-3" /> Teste</TabsTrigger>
        </TabsList>

        <TabsContent value="horarios"><HorariosSection /></TabsContent>
        <TabsContent value="regras"><RegrasSection /></TabsContent>
        <TabsContent value="notificacoes"><NotificacoesSection /></TabsContent>
        <TabsContent value="equipe"><EquipeSection /></TabsContent>
        <TabsContent value="salas"><SalasSection /></TabsContent>
        <TabsContent value="bloqueios"><BloqueiosSection /></TabsContent>
        <TabsContent value="importacao"><ImportacaoSection /></TabsContent>
        <TabsContent value="dados"><DadosSection /></TabsContent>
        <TabsContent value="teste"><TesteSection /></TabsContent>
      </Tabs>
    </div>
  );
};

export default ConfiguracoesAvancadas;
