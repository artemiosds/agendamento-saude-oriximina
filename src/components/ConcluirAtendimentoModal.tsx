import React, { useEffect, useState, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ConcluirAtendimentoAg {
  id: string;
  pacienteNome: string;
  profissionalNome: string;
  profissionalId: string;
  hora: string;
  iniciado_em?: string | null;
}

interface Props {
  ag: ConcluirAtendimentoAg | null;
  open: boolean;
  isMaster: boolean;
  onClose: () => void;
  onConcluded?: () => void;
}

interface ProcOpt { codigo: string; nome: string; especialidade?: string }
interface CidOpt { codigo: string; descricao: string }

export const ConcluirAtendimentoModal: React.FC<Props> = ({ ag, open, isMaster, onClose, onConcluded }) => {
  const { user } = useAuth();
  const [horaTermino, setHoraTermino] = useState("");
  const [obs, setObs] = useState("");
  const [procQuery, setProcQuery] = useState("");
  const [cidQuery, setCidQuery] = useState("");
  const [procOpts, setProcOpts] = useState<ProcOpt[]>([]);
  const [cidOpts, setCidOpts] = useState<CidOpt[]>([]);
  const [proc, setProc] = useState<ProcOpt | null>(null);
  const [cid, setCid] = useState<CidOpt | null>(null);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (open) {
      const now = new Date();
      setHoraTermino(now.toTimeString().slice(0, 5));
      setObs("");
      setProcQuery(""); setCidQuery("");
      setProc(null); setCid(null);
      setProcOpts([]); setCidOpts([]);
    }
  }, [open, ag?.id]);

  const runSearch = useCallback(async (q: string) => {
    if (!q || q.trim().length < 2) { setProcOpts([]); setCidOpts([]); return; }
    setSearching(true);
    try {
      const { data, error } = await (supabase as any).rpc("search_sigtap_and_cid", { q, lim: 10 });
      if (error) throw error;
      setProcOpts((data?.procedimentos || []) as ProcOpt[]);
      setCidOpts((data?.cids || []) as CidOpt[]);
    } catch (e) {
      // ignore
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSearch(procQuery), 300);
    return () => clearTimeout(t);
  }, [procQuery, runSearch]);

  useEffect(() => {
    const t = setTimeout(() => runSearch(cidQuery), 300);
    return () => clearTimeout(t);
  }, [cidQuery, runSearch]);

  const submit = async () => {
    if (!ag) return;
    if (!horaTermino) { toast.error("Informe o horário de término."); return; }
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("concluir_atendimento_master", {
        p_agendamento_id: ag.id,
        p_user_id: user?.id || "",
        p_user_nome: user?.nome || user?.usuario || "",
        p_hora_termino: horaTermino,
        p_procedimento: proc?.codigo || "",
        p_cid: cid?.codigo || "",
        p_obs: obs || null,
        p_is_master: !!isMaster,
      });
      if (error) {
        const m = error.message || "";
        if (m.includes("nao_autorizado")) toast.error("Você não tem permissão para concluir este atendimento.");
        else if (m.includes("ja_concluido")) toast.error("Este atendimento já foi concluído.");
        else if (m.includes("procedimento_e_cid_obrigatorios")) toast.error("Procedimento e CID são obrigatórios.");
        else toast.error("Erro ao concluir: " + m);
        return;
      }
      toast.success("Atendimento concluído.");
      onConcluded?.();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  if (!ag) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Concluir Atendimento</DialogTitle>
          <DialogDescription>
            Registra a finalização do atendimento. A produção/BPA permanece em nome do profissional executor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-muted-foreground">Paciente:</span> <strong>{ag.pacienteNome}</strong></div>
            <div><span className="text-muted-foreground">Profissional:</span> <strong>{ag.profissionalNome}</strong></div>
            <div><span className="text-muted-foreground">Início agendado:</span> <strong>{ag.hora}</strong></div>
            <div>
              <Label className="text-xs">Horário de término</Label>
              <Input type="time" value={horaTermino} onChange={(e) => setHoraTermino(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-xs">Procedimento SIGTAP *</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar por nome ou código..."
                value={proc ? `${proc.codigo} — ${proc.nome}` : procQuery}
                onChange={(e) => { setProc(null); setProcQuery(e.target.value); }}
              />
            </div>
            {!proc && procOpts.length > 0 && (
              <div className="mt-1 max-h-32 overflow-auto border rounded-md divide-y text-xs">
                {procOpts.map((p) => (
                  <button
                    type="button" key={p.codigo}
                    className="w-full text-left px-2 py-1 hover:bg-muted"
                    onClick={() => { setProc(p); setProcOpts([]); setProcQuery(""); }}
                  >
                    <strong>{p.codigo}</strong> — {p.nome}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">CID-10 *</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar por descrição ou código..."
                value={cid ? `${cid.codigo} — ${cid.descricao}` : cidQuery}
                onChange={(e) => { setCid(null); setCidQuery(e.target.value); }}
              />
            </div>
            {!cid && cidOpts.length > 0 && (
              <div className="mt-1 max-h-32 overflow-auto border rounded-md divide-y text-xs">
                {cidOpts.map((c) => (
                  <button
                    type="button" key={c.codigo}
                    className="w-full text-left px-2 py-1 hover:bg-muted"
                    onClick={() => { setCid(c); setCidOpts([]); setCidQuery(""); }}
                  >
                    <strong>{c.codigo}</strong> — {c.descricao}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Observação (opcional)</Label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>

          {searching && <p className="text-[11px] text-muted-foreground">Buscando...</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConcluirAtendimentoModal;
