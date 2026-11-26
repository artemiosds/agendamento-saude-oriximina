import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Phone,
  Mail,
  Pencil,
  Trash2,
  Users,
  Clock,
  FileUp,
  Eye,
  FileText,
  Printer, MoreVertical, UserRound, ClipboardList, FolderOpen, UserPlus, Stethoscope,
} from "lucide-react";
import { FileSignature } from "lucide-react";
import ContactActionButton from "@/components/ContactActionButton";
import { formatCNS, formatCPF, formatTelefoneBR, calcularIdadeAnos, patientInitials } from "@/components/PacienteDetalheModal";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

export interface PacienteItemCardProps {
  onOverlayChange?: (id: string, open: boolean) => void;
  paciente: any;
  naFila: boolean;
  filaEntry?: { horaChegada: string; prioridade: string; unidadeId?: string } | undefined;
  demandaReprimida: boolean;
  unidadeNome: string;
  canAddToFila: boolean;
  canDelete: boolean;
  onImprimirFicha: (p: any) => void;
  onImprimirLaudoApac: (p: any) => void;
  onAddFila: (p: any) => void;
  onOpenDetalhe: (p: any) => void;
  onOpenDocuments: (p: any) => void;
  onVerProntuarios: (p: any) => void;
  onEditar: (p: any) => void;
  onDelete: (p: any) => void;
}

const PacienteItemCardBase: React.FC<PacienteItemCardProps> = ({
  paciente: p,
  naFila,
  filaEntry,
  demandaReprimida,
  unidadeNome,
  canAddToFila,
  canDelete,
  onImprimirFicha,
  onImprimirLaudoApac,
  onAddFila,
  onOpenDetalhe,
  onOpenDocuments,
  onVerProntuarios,
  onEditar,
  onOverlayChange,
  onDelete,
}) => {
  const [menuOpen,setMenuOpen]=React.useState(false);
  const [deleteOpen,setDeleteOpen]=React.useState(false);
  React.useEffect(()=>{
    onOverlayChange?.(p.id,menuOpen||deleteOpen);
  },[p.id,menuOpen,deleteOpen,onOverlayChange]);
  const menuTrigger=React.useRef<HTMLButtonElement>(null);
  const openingDelete=React.useRef(false);
  const idade=calcularIdadeAnos(p.dataNascimento);
  return (
    <Card className="clinical-premium clinical-patient-card h-full min-w-0">
      <CardContent className="p-0 flex flex-col h-full">
        <div className="clinical-patient-hero flex items-start gap-2.5 min-w-0">
          <div aria-hidden="true" className="clinical-patient-avatar flex shrink-0 items-center justify-center text-base font-bold">{patientInitials(p.nome)}</div>
          <div className="flex-1 min-w-0">
            <h3 className="clinical-patient-name text-sm sm:text-[15px] font-semibold leading-snug break-words [overflow-wrap:anywhere]">{p.nome}</h3>
            <p className="clinical-patient-sub text-xs mt-1">{idade||"Paciente cadastrado"}</p>
          </div>
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild><Button ref={menuTrigger} type="button" size="icon" variant="ghost" className="clinical-hero-menu shrink-0 h-8 w-8" aria-label={"Mais ações de "+p.nome}><MoreVertical className="w-4 h-4"/></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48" onCloseAutoFocus={e=>{if(openingDelete.current){e.preventDefault();openingDelete.current=false;}}}>
              <DropdownMenuItem onSelect={()=>onImprimirFicha(p)}><Printer className="mr-2 w-4 h-4"/>Imprimir ficha</DropdownMenuItem>
              <DropdownMenuItem onSelect={()=>onImprimirLaudoApac(p)}><FileSignature className="mr-2 w-4 h-4"/>Emitir laudo APAC</DropdownMenuItem>
              <DropdownMenuItem onSelect={()=>onEditar(p)}><Pencil className="mr-2 w-4 h-4"/>Editar cadastro</DropdownMenuItem>
              {canDelete&&<><DropdownMenuSeparator/><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={()=>{openingDelete.current=true;setDeleteOpen(true);}}><Trash2 className="mr-2 w-4 h-4"/>Excluir paciente</DropdownMenuItem></>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="clinical-patient-body flex flex-col flex-1 min-w-0 gap-2.5 p-3">
        {(naFila||demandaReprimida)&&<div className="flex flex-wrap gap-1.5 items-center">
          {naFila&&<Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-[10px] font-medium"><Clock className="w-3 h-3 mr-1"/>Fila de espera{filaEntry?.horaChegada?' · '+filaEntry.horaChegada:''}{filaEntry?.prioridade&&filaEntry.prioridade!=='normal'?' · '+filaEntry.prioridade:''}</Badge>}
          {demandaReprimida&&<Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30 text-[10px] font-medium"><FileUp className="w-3 h-3 mr-1"/>Demanda reprimida</Badge>}
        </div>}
        <div className="clinical-inset rounded-xl border px-3 py-2.5 space-y-2">
          <div className="clinical-identity-grid grid grid-cols-1 min-[380px]:grid-cols-2 gap-x-3 gap-y-2 min-w-0">
            <div className="min-w-0"><p className="clinical-field-label text-[10px] font-semibold uppercase tracking-wide">CPF</p><p className="text-xs font-semibold tabular-nums break-words [overflow-wrap:anywhere]">{formatCPF(p.cpf)||"Não informado"}</p></div>
            <div className="min-w-0"><p className="clinical-field-label text-[10px] font-semibold uppercase tracking-wide">CNS</p><p className="text-xs font-semibold tabular-nums break-words [overflow-wrap:anywhere]">{formatCNS(p.cns)||"Não informado"}</p></div>
          </div>
          <div className="flex items-center gap-1.5 border-t border-border/60 pt-1.5 min-w-0">
            <Phone className="w-3.5 h-3.5 shrink-0 text-muted-foreground"/>
            <span className="flex-1 text-xs tabular-nums break-words [overflow-wrap:anywhere]">{formatTelefoneBR(p.telefone)||"Sem telefone"}</span>
            <div className="shrink-0"><ContactActionButton phone={p.telefone} patientName={p.nome} unitName={unidadeNome}/></div>
          </div>
          {p.email&&<div className="flex gap-1.5 items-start text-xs text-muted-foreground"><Mail className="w-3.5 h-3.5 shrink-0"/><span className="min-w-0 break-words [overflow-wrap:anywhere]">{p.email}</span></div>}
        </div>
        {(p.descricaoClinica||p.cid)&&<div className="flex gap-1.5 items-start text-xs text-muted-foreground"><Stethoscope className="w-3.5 h-3.5 shrink-0 mt-0.5"/><div className="min-w-0 break-words [overflow-wrap:anywhere]">{p.descricaoClinica&&<p>{p.descricaoClinica}</p>}{p.cid&&<p>CID: {p.cid}</p>}</div></div>}
        <div className={`clinical-dock mt-auto grid gap-1 ${canAddToFila&&!naFila?'grid-cols-4':'grid-cols-3'}`}>
          <Button type="button" variant="ghost" className="clinical-dock-action min-w-0 h-auto min-h-12 flex-col gap-1 px-0.5 py-1 text-[10px] sm:text-xs whitespace-normal" title="Detalhes do paciente" onClick={()=>onOpenDetalhe(p)}><span className="clinical-dock-icon clinical-tone-blue" aria-hidden="true"><UserRound className="w-4 h-4 shrink-0"/></span><span>Paciente</span></Button>
          <Button type="button" variant="ghost" className="clinical-dock-action min-w-0 h-auto min-h-12 flex-col gap-1 px-0.5 py-1 text-[10px] sm:text-xs whitespace-normal" title="Ver prontuários" onClick={()=>onVerProntuarios(p)}><span className="clinical-dock-icon clinical-tone-teal" aria-hidden="true"><ClipboardList className="w-4 h-4 shrink-0"/></span><span className="[overflow-wrap:anywhere]">Prontuário</span></Button>
          <Button type="button" variant="ghost" className="clinical-dock-action min-w-0 h-auto min-h-12 flex-col gap-1 px-0.5 py-1 text-[10px] sm:text-xs whitespace-normal" onClick={()=>onOpenDocuments(p)}><span className="clinical-dock-icon clinical-tone-violet" aria-hidden="true"><FolderOpen className="w-4 h-4 shrink-0"/></span><span className="[overflow-wrap:anywhere]">Documentos</span></Button>
          {canAddToFila&&!naFila&&<Button type="button" variant="ghost" className="clinical-dock-action min-w-0 h-auto min-h-12 flex-col gap-1 px-0.5 py-1 text-[10px] sm:text-xs whitespace-normal" aria-label="Adicionar à fila" title="Adicionar à fila" onClick={()=>onAddFila(p)}><span className="clinical-dock-icon clinical-tone-neutral" aria-hidden="true"><UserPlus className="w-4 h-4 shrink-0"/></span><span>Fila</span></Button>}
        </div>
        </div>
        {canDelete&&<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent onCloseAutoFocus={e=>{e.preventDefault();menuTrigger.current?.focus();}}>
            <AlertDialogHeader><AlertDialogTitle>Excluir paciente?</AlertDialogTitle><AlertDialogDescription>Excluir {p.nome}? Será verificado se há agendamentos ativos vinculados. Esta ação é irreversível e será registrada em log.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={()=>onDelete(p)} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>}
      </CardContent>
    </Card>
  );
};

export const PacienteItemCard = React.memo(PacienteItemCardBase);
export default PacienteItemCard;
