import React, { useState, useEffect, useRef } from "react";
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
import { auditService } from "@/services/auditService";
import { exportSafeText } from "@/lib/auditDocumentExport";
import { canExportGlobalData, confirmedCount, readDataExport, dataExportCsv, DATA_EXPORT_FIELDS, DATA_EXPORT_LIMIT, type DataExportTable, type DataExportRow } from "@/lib/operationalDataSafety";
import {
  Clock, ClipboardList, MessageSquare, Users, DoorOpen,
  CalendarOff, FileDown, Database, FlaskConical, ExternalLink,
  Plus, Pencil, Trash2, Save, Send, Check, X, AlertTriangle, Info
} from "lucide-react";

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// ─── Section 8: Dados ─────────────────────────────────────────────────────────
const DadosSection: React.FC = () => {
  const {user,isGlobalAdmin}=useAuth();
  const canBulkExport=isGlobalAdmin&&canExportGlobalData(user);
  const [stats, setStats] = useState<{pacientes:number|null;agendamentos:number|null;notificacoes:number|null;erros:number|null}>({ pacientes:null, agendamentos:null, notificacoes:null, erros:null });
  const [statsLoading,setStatsLoading]=useState(true);
  const [exporting, setExporting] = useState("");
  const [progress,setProgress]=useState("");
  const controllerRef=useRef<AbortController|null>(null);
  useEffect(() => {
    const controller=new AbortController();
    (async () => {
      try{
        const [p,a,n,e]=await Promise.all([
          supabase.from("pacientes").select("id",{count:"exact",head:true}).abortSignal(controller.signal),
          supabase.from("agendamentos").select("id",{count:"exact",head:true}).abortSignal(controller.signal),
          supabase.from("notification_logs").select("id",{count:"exact",head:true}).eq("status","enviado").abortSignal(controller.signal),
          supabase.from("notification_logs").select("id",{count:"exact",head:true}).eq("status","erro").abortSignal(controller.signal),
        ]);
        if(!controller.signal.aborted)setStats({pacientes:confirmedCount(p),agendamentos:confirmedCount(a),notificacoes:confirmedCount(n),erros:confirmedCount(e)});
      }catch{if(!controller.signal.aborted)setStats({pacientes:null,agendamentos:null,notificacoes:null,erros:null});}
      finally{if(!controller.signal.aborted)setStatsLoading(false);}
    })();
    return ()=>{controller.abort();controllerRef.current?.abort();};
  }, []);

  // Revalidate authenticated identity and current staff role; never infer global access from the Master role alone.
  const verifyGlobal=async(signal:AbortSignal)=>{
    if(!canBulkExport||!user?.id||signal.aborted)throw Error("Exportação restrita ao Master Global ativo.");
    const {data:{user:authUser},error}=await supabase.auth.getUser();
    if(error||!authUser||signal.aborted)throw Error("Sessão não confirmada.");
    const {data,error:staffError}=await supabase.from("funcionarios").select("id,role,usuario,ativo").eq("auth_user_id",authUser.id).eq("id",user.id).abortSignal(signal).maybeSingle();
    if(staffError||!canExportGlobalData(data)||signal.aborted)throw Error("Autorização global não confirmada.");
  };

  const exportCSV = async (table: DataExportTable, filename: string) => {
    if(!canBulkExport||controllerRef.current)return;
    const reason=window.prompt("Exportação administrativa de dados sensíveis. Informe a finalidade (10 a 500 caracteres). Armazene em local protegido.");
    if(reason===null)return;
    const motive=reason.trim();
    if(motive.length<10||motive.length>500){toast.error("Informe uma finalidade válida.");return;}
    const controller=new AbortController();controllerRef.current=controller;
    setExporting(table);setProgress("Conferindo autorização...");
    try{
      await verifyGlobal(controller.signal);
      const count=async()=>{
        const result=await supabase.from(table).select("id",{count:"exact",head:true}).abortSignal(controller.signal);
        return confirmedCount(result);
      };
      const read=async(from:number,to:number)=>{
        const {data,error}=await supabase.from(table).select(DATA_EXPORT_FIELDS[table].join(",")).order("id",{ascending:true}).range(from,to).abortSignal(controller.signal);
        if(error||!data)throw Error("Falha ao consultar um lote da exportação.");
        return data as unknown as DataExportRow[];
      };
      const rows=await readDataExport(count,read,controller.signal,(done,total)=>setProgress(done.toLocaleString("pt-BR")+" de "+total.toLocaleString("pt-BR")+" registros"));
      const csv=dataExportCsv(table,rows);
      await verifyGlobal(controller.signal);
      setProgress("Registrando auditoria...");
      await auditService.log({acao:"exportacao_dados_administrativos",acaoLegivel:"Exportação administrativa solicitada",tipoEvento:"download",modulo:"gestao_dados",entidade:table,user,detalhes:{finalidade:exportSafeText(motive),quantidade_registros:rows.length,abrangencia:"colunas_administrativas",cobertura:"contagem inicial e final coincidentes; sem snapshot transacional"},status:"sucesso"},{requireConfirmation:true});
      if(controller.signal.aborted)throw Error("Consulta cancelada.");
      await verifyGlobal(controller.signal);
      const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
      const url=URL.createObjectURL(blob);const link=document.createElement("a");
      link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      toast.success(rows.length.toLocaleString("pt-BR")+" registros administrativos exportados.");
    }catch(error){if(!controller.signal.aborted)toast.error(error instanceof Error?error.message:"Exportação não concluída.");}
    finally{if(controllerRef.current===controller){controllerRef.current=null;if(!controller.signal.aborted){setExporting("");setProgress("");}}}
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
              <div className={`text-2xl font-bold ${s.color}`}>{statsLoading?"…":s.value===null?"Não verificado":s.value.toLocaleString("pt-BR")}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">Contagens dos registros visíveis à sessão atual; indisponibilidade não significa zero.</p>
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
            <Label className="text-sm font-medium">Exportações administrativas (CSV)</Label>
            <p className="text-xs text-muted-foreground">Somente Master Global ativo. Colunas administrativas, até {DATA_EXPORT_LIMIT.toLocaleString("pt-BR")} registros por tabela. Não inclui dados clínicos livres, payloads ou cópia restaurável. Para a cópia integral, use a exportação nativa.</p>
            {!canBulkExport&&<p role="status" className="text-sm text-muted-foreground">Exportação global restrita.</p>}
            {exporting&&<p role="status" className="text-sm">{progress}</p>}
            {exporting&&<Button variant="outline" size="sm" onClick={()=>{controllerRef.current?.abort();controllerRef.current=null;setExporting("");setProgress("");}}>Cancelar consulta</Button>}
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" size="sm" onClick={() => exportCSV("pacientes", "pacientes.csv")} disabled={!canBulkExport||!!exporting}><FileDown className="mr-1 h-3.5 w-3.5" /> {exporting === "pacientes" ? "Exportando..." : "Pacientes"}</Button>
              <Button variant="outline" size="sm" onClick={() => exportCSV("agendamentos", "agendamentos.csv")} disabled={!canBulkExport||!!exporting}><FileDown className="mr-1 h-3.5 w-3.5" /> {exporting === "agendamentos" ? "Exportando..." : "Agendamentos"}</Button>
              <Button variant="outline" size="sm" onClick={() => exportCSV("notification_logs", "notificacoes.csv")} disabled={!canBulkExport||!!exporting}><FileDown className="mr-1 h-3.5 w-3.5" /> {exporting === "notification_logs" ? "Exportando..." : "Notificações"}</Button>
            </div>
          </div>
          <Button variant="outline" disabled><FileDown className="mr-2 h-4 w-4" />Exportação auxiliar em revisão de segurança</Button>
          <p className="text-xs text-muted-foreground">Temporariamente suspensa: a rotina antiga pode omitir registros e arquivos. Use a exportação nativa do Lovable Cloud. A montagem e a conferência local do pacote continuam disponíveis.</p>
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
const ConfiguracoesAvancadas: React.FC = () => {
  const {user,isGlobalAdmin}=useAuth();
  return <div className="space-y-4"><DadosSection key={JSON.stringify([user?.id,user?.role,user?.unidadeId,user?.ativo,isGlobalAdmin])}/></div>;
};

export default ConfiguracoesAvancadas;
