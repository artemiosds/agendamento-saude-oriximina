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
import { useOperacional } from '@/contexts/OperacionalContext';
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { normalizePhone, formatPhoneForDisplay, applyPhoneMask } from "@/lib/phoneUtils";
import { Link } from "react-router-dom";
import { RecoveryPackageBuilder } from "@/components/painel/RecoveryPackageBuilder";
import {
  Clock, ClipboardList, MessageSquare, Users, DoorOpen,
  CalendarOff, FileDown, Database, FlaskConical, ExternalLink,
  Plus, Pencil, Trash2, Save, Send, Check, X, AlertTriangle, Info
} from "lucide-react";

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

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

  const generateBackup = async () => {
    if (!confirm("Esta exportação auxiliar não contém uma cópia integral e restaurável do banco. Para recuperação, use a exportação nativa do Lovable Cloud. Deseja baixar a exportação auxiliar mesmo assim?")) {
      return;
    }

    setExporting("auxiliary_export");
    const t = toast.loading("Preparando exportação auxiliar...");
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão não encontrada");

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/system-backup`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Falha ao gerar backup");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_sistema_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast.info("Exportação auxiliar baixada. Este ZIP não é um backup completo nem permite restauração integral.", { id: t });
    } catch (err: any) {
      console.error(err);
      toast.error(`❌ Erro: ${err.message}`, { id: t });
    } finally {
      setExporting("");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" /> Backup e Exportação do Sistema</CardTitle>
        </div>
      </CardHeader>
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

        <Tabs defaultValue="backup" className="w-full space-y-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 p-1" aria-label="Etapas de backup e recuperação">
            <TabsTrigger value="backup">Backup</TabsTrigger>
            <TabsTrigger value="verificar">Verificar pacote</TabsTrigger>
            <TabsTrigger value="recuperar">Recuperar no Lovable</TabsTrigger>
            <TabsTrigger value="migrar">Migrar para Supabase</TabsTrigger>
          </TabsList>
          <TabsContent value="backup" className="space-y-4">
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
            <strong>Para recuperar todos os dados, use a exportação nativa do Lovable Cloud.</strong> A exportação auxiliar desta página pode omitir registros e não inclui a estrutura completa do banco ou as contas de autenticação. Não a utilize como único backup.
          </div>
          <div className="space-y-3 rounded-lg border p-4">
              <h4 className="font-semibold">Preparar a exportação nativa</h4>
              <p className="text-sm text-muted-foreground">No Lovable: More → Database → Manage → Settings → Export project data. Baixe o arquivo PostgreSQL .backup em More → Storage. Baixe também todos os arquivos dos buckets e uma cópia do código no GitHub.</p>
              <p className="text-xs text-muted-foreground">A exportação nativa inclui estrutura, dados e contas, mas não os arquivos do Storage, segredos, configurações dos provedores de login ou código das funções. Guarde uma cópia fora do Lovable.</p>
              <Button variant="outline" asChild><a href="https://github.com/artemiosds/agendamento-saude-oriximina" target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" /> Abrir repositório</a></Button>
          </div>
          <RecoveryPackageBuilder mode="build" />
          <div className="space-y-2 rounded-lg border p-4">
            <Label className="text-sm font-medium">Exportações Rápidas (CSV)</Label>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" size="sm" onClick={() => exportCSV("pacientes", "pacientes.csv")} disabled={!!exporting}><FileDown className="mr-1 h-3.5 w-3.5" /> {exporting === "pacientes" ? "Exportando..." : "Pacientes"}</Button>
              <Button variant="outline" size="sm" onClick={() => exportCSV("agendamentos", "agendamentos.csv")} disabled={!!exporting}><FileDown className="mr-1 h-3.5 w-3.5" /> {exporting === "agendamentos" ? "Exportando..." : "Agendamentos"}</Button>
              <Button variant="outline" size="sm" onClick={() => exportCSV("notification_logs", "notificacoes.csv")} disabled={!!exporting}><FileDown className="mr-1 h-3.5 w-3.5" /> {exporting === "notification_logs" ? "Exportando..." : "Notificações"}</Button>
            </div>
          </div>
          <Button variant="outline" onClick={generateBackup} disabled={!!exporting}><FileDown className="mr-2 h-4 w-4" />{exporting === "auxiliary_export" ? "Exportando..." : "Baixar exportação auxiliar"}</Button>
          </TabsContent>
          <TabsContent value="verificar"><RecoveryPackageBuilder mode="verify" /></TabsContent>
          <TabsContent value="recuperar">
            <div className="space-y-3 rounded-lg border p-4">
              <h4 className="font-semibold">1. Recuperar no Lovable Cloud</h4>
              <p className="text-sm text-muted-foreground">No editor do Lovable, siga <strong>More → Database → Manage → Backups</strong> e escolha um backup diário anterior ao problema. A restauração substitui o banco atual, inclusive os registros de autenticação; contas e senhas armazenadas acompanham o banco daquele dia. Alterações e usuários criados depois desse ponto são perdidos. Provedores externos e sessões de login exigem conferência separada.</p>
              <p className="text-sm text-muted-foreground">O backup diário <strong>não restaura arquivos do Storage</strong>. Se houver arquivos perdidos, recupere-os da cópia externa e reenvie aos mesmos buckets e caminhos em More → Storage; confira permissões, vínculos e abertura dos documentos. Caso a estrutura restaurada contenha metadados de arquivos ausentes, planeje a reposição com suporte técnico antes de sobrescrever algo.</p>
              <p className="text-xs text-muted-foreground">Antes de restaurar, preserve uma exportação do estado atual e confirme a data do backup. O link do projeto abre o editor; o Lovable não documenta um link direto estável para a aba Backups.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" asChild><a href="https://lovable.dev/projects/b31da743-ec3e-4875-9ddb-7d95bdbcdbae" target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" /> Abrir editor do projeto</a></Button>
                <Button variant="outline" asChild><a href="https://docs.lovable.dev/features/database-backups#restore-a-daily-backup" target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" /> Ver instruções de restauração</a></Button>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="migrar">
          <div className="rounded-lg border p-4 text-sm">
            <h4 className="font-semibold">Migrar para Supabase próprio</h4>
            <p className="mt-2 text-muted-foreground">Restaure o .backup com pg_restore em um projeto de teste, resolvendo conflitos com os schemas gerenciados. Reenvie os arquivos aos buckets, implante as funções do repositório e reconfigure autenticação, chaves e integrações. Confira tabelas, vínculos, login e arquivos antes de mudar o endereço do sistema. O .backup não é um script para colar no SQL Editor.</p>
          </div>
          </TabsContent>
        </Tabs>

        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
          <div className="text-xs text-amber-800">
            <strong>Dados sensíveis:</strong> Os pacotes contêm informações de pacientes. O ZIP criado no navegador não é criptografado. Armazene-o em local criptografado e com acesso restrito. Somente uma restauração testada comprova a recuperação.
          </div>
        </div>
      </CardContent>
    </Card>
  );
};


// ─── Main Page ────────────────────────────────────────────────────────────────
const ConfiguracoesAvancadas: React.FC = () => (
  <div className="space-y-4">
    <DadosSection />
  </div>
);

export default ConfiguracoesAvancadas;
