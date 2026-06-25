import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, CheckCircle2, Search, FileText, Activity } from "lucide-react";
import { toast } from "sonner";

/**
 * Modal isolado de correção SIGTAP/CID para a BPA-Exportar.
 *
 * Regra de aplicação em LOTE por paciente + competência:
 *   - A correção é aplicada para TODOS os prontuários do mesmo paciente
 *     dentro da MESMA COMPETÊNCIA (AAAAMM) da exportação BPA, restrita
 *     ao mesmo profissional e unidade da pendência (regra clara).
 *   - Atualiza prontuarios.custom_data.{procedimento_sigtap, codigo_sigtap,
 *     procedimento_nome, cid, cid10}.
 *   - NÃO altera outros meses, outros pacientes ou outras profissões.
 *   - Para Fisioterapia, se solicitado, atualiza o PTS ativo do paciente.
 *   - Registra auditoria em notification_logs (evento: bpa_sigtap_correcao)
 *     com a lista dos prontuários afetados e valor antigo/novo.
 */

export type ResolverSigtapItem = {
  paciente_id?: string;
  paciente_nome?: string;
  profissional_id?: string;
  profissional_nome?: string;
  profissao?: string;
  profissao_categoria?: string;
  data_atendimento?: string;
  unidade_id?: string;
  unidade_nome?: string;
  cbo?: string;
  /** Competência da exportação BPA no formato AAAAMM. Quando informada, a
   *  correção é aplicada em lote a todos os prontuários do mesmo paciente
   *  dentro do mês (mesmo profissional + mesma unidade). */
  competencia?: string;
  /** Quando "agenda_sem_prontuario", a correção grava em agendamentos.custom_data.bpa_manual
   *  (não cria prontuário nem PTS). */
  origem?: "prontuario" | "agenda_sem_prontuario";
  /** Id do agendamento alvo (opcional — quando não passado, o modal carrega
   *  todos os agendamentos com presença confirmada do paciente na competência). */
  agendamento_id?: string;
};

type SigtapHit = {
  codigo: string;
  nome: string;
  especialidade?: string;
};

type CidHit = { cid_codigo: string; cid_descricao: string };

interface Props {
  open: boolean;
  item: ResolverSigtapItem | null;
  onClose: () => void;
  onResolved: () => void;
  /** id do usuário Master/logado para auditoria */
  userId?: string;
  userNome?: string;
}

/** Retorna [primeiro_dia, ultimo_dia] (YYYY-MM-DD) para uma competência AAAAMM. */
const competenciaRange = (comp?: string): { ini: string; fim: string } | null => {
  const n = String(comp || "").replace(/\D/g, "");
  if (n.length !== 6) return null;
  const ano = Number(n.slice(0, 4));
  const mes = Number(n.slice(4, 6));
  if (!ano || mes < 1 || mes > 12) return null;
  const last = new Date(ano, mes, 0).getDate();
  const mm = String(mes).padStart(2, "0");
  const dd = String(last).padStart(2, "0");
  return { ini: `${ano}-${mm}-01`, fim: `${ano}-${mm}-${dd}` };
};

const onlyDigits = (v: any) => String(v ?? "").replace(/\D/g, "");
const isSigtap = (v: any) => {
  const n = onlyDigits(v);
  return n.length >= 6 && n.length <= 10;
};
const normalizeSigtap = (v: any) => onlyDigits(v).padStart(10, "0").slice(-10);
const normalizeSearchText = (v: any) => String(v ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toUpperCase()
  .trim();

/** CID-10 oficial: 1 letra + 2 dígitos, opcional ponto + 1 dígito (ex.: M54, M54.5, Z00.0). */
const CID10_REGEX = /^[A-TV-Z][0-9]{2}(\.?[0-9])?$/;
const normalizeCid = (v: string) => String(v || "").trim().toUpperCase().replace(/\s+/g, "");
const isValidCid10 = (v: string) => {
  const n = normalizeCid(v);
  if (!n) return false;
  return CID10_REGEX.test(n);
};

const BpaResolverSigtapModal: React.FC<Props> = ({
  open, item, onClose, onResolved, userId, userNome,
}) => {
  const [loadingCtx, setLoadingCtx] = useState(false);
  const [saving, setSaving] = useState(false);

  // Contexto carregado
  const [prontuarios, setProntuarios] = useState<any[]>([]);
  const [ptsList, setPtsList] = useState<any[]>([]);
  const [ptsAtivo, setPtsAtivo] = useState<any | null>(null);
  const [valoresAtuais, setValoresAtuais] = useState<{ sigtap?: string; cid?: string }>({});

  // Busca SIGTAP
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<SigtapHit[]>([]);
  const [selSigtap, setSelSigtap] = useState<SigtapHit | null>(null);

  // CIDs relacionados ao procedimento escolhido
  const [cidOptions, setCidOptions] = useState<CidHit[]>([]);
  const [cidQuery, setCidQuery] = useState("");
  const [loadingCids, setLoadingCids] = useState(false);
  const [cidLoadError, setCidLoadError] = useState("");
  const [cidManual, setCidManual] = useState("");
  const [selCid, setSelCid] = useState<string>("");

  const [motivo, setMotivo] = useState("");
  const [aplicarPts, setAplicarPts] = useState(false);

  // Progresso de gravação em lote
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const isFisio = (item?.profissao_categoria || "").includes("fisioterap")
    || /fisio/i.test(item?.profissao || "");

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHits([]);
    setSelSigtap(null);
    setCidOptions([]);
    setCidQuery("");
    setLoadingCids(false);
    setCidLoadError("");
    setSelCid("");
    setCidManual("");
    setMotivo("");
    setAplicarPts(false);
    setProntuarios([]);
    setPtsList([]);
    setPtsAtivo(null);
    setValoresAtuais({});
    setProgress(null);
    if (item?.paciente_id && (item?.competencia || item?.data_atendimento)) {
      void carregarContexto();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const carregarContexto = async () => {
    if (!item?.paciente_id) return;
    setLoadingCtx(true);
    try {
      // Escopo: paciente + competência (mês) + mesmo profissional + mesma unidade.
      // Fallback: se não vier competência, mantém comportamento antigo por data exata.
      const range = competenciaRange(item.competencia);
      let q: any = (supabase as any)
        .from("prontuarios")
        .select("id, profissional_id, profissional_nome, unidade_id, data_atendimento, custom_data, outro_procedimento, tipo_registro")
        .eq("paciente_id", item.paciente_id);
      if (range) {
        q = q.gte("data_atendimento", range.ini).lte("data_atendimento", range.fim);
      } else if (item.data_atendimento) {
        q = q.eq("data_atendimento", item.data_atendimento);
      }
      if (item.profissional_id) q = q.eq("profissional_id", item.profissional_id);
      if (item.unidade_id) q = q.eq("unidade_id", item.unidade_id);
      const { data: pronts } = await q.order("data_atendimento", { ascending: true });
      const list = Array.isArray(pronts) ? pronts : [];
      setProntuarios(list);

      // PTS (apenas relevante para fisioterapia) — lista TODOS os ativos
      let pts: any = null;
      let ptsAtivos: any[] = [];
      if (isFisio) {
        const { data: ptsArr } = await (supabase as any)
          .from("pts")
          .select("id, status, custom_data, diagnostico_funcional, objetivo_geral, created_at")
          .eq("patient_id", item.paciente_id)
          .order("created_at", { ascending: false })
          .limit(10);
        if (Array.isArray(ptsArr) && ptsArr.length) {
          ptsAtivos = ptsArr.filter((p: any) => String(p.status || "").toLowerCase() === "ativo");
          // pré-seleção: 1º ativo se houver apenas um; se nenhum ativo, mais recente
          pts = ptsAtivos.length === 1 ? ptsAtivos[0] : (ptsAtivos[0] || ptsArr[0] || null);
        }
      }
      setPtsList(ptsAtivos);
      setPtsAtivo(pts);

      // Valor atual: pega primeiro código já preenchido em qualquer prontuário
      let curSig = "";
      let curCid = "";
      for (const p of list) {
        const cd = p?.custom_data || {};
        const c = cd.procedimento_sigtap || cd.codigo_sigtap || cd.sigtap;
        if (!curSig && isSigtap(c)) curSig = normalizeSigtap(c);
        const ci = cd.cid || cd.cid10 || cd.cid_principal;
        if (!curCid && ci) curCid = String(ci);
        if (curSig && curCid) break;
      }
      setValoresAtuais({ sigtap: curSig, cid: curCid });
    } catch (e: any) {
      toast.error("Falha ao carregar contexto: " + (e?.message || "erro"));
    } finally {
      setLoadingCtx(false);
    }
  };

  // Search SIGTAP (debounced)
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const { data, error } = await (supabase as any).rpc("search_sigtap_and_cid", { q, lim: 100 });
        if (error) throw error;
        const procs = (data?.procedimentos || []) as any[];
        // Prioriza compatibilidade com a profissão
        const prof = String(item?.profissao || "").toLowerCase();
        const score = (p: any) => {
          const esp = String(p.especialidade || "").toLowerCase();
          if (!prof || !esp) return 0;
          return esp.includes(prof.split(" ")[0]) ? 1 : 0;
        };
        procs.sort((a, b) => score(b) - score(a));
        setHits(procs.map((p) => ({ codigo: p.codigo, nome: p.nome, especialidade: p.especialidade })));
      } catch (e: any) {
        console.error("[BPA] search_sigtap_and_cid:", e);
      } finally {
        setSearching(false);
      }
    }, 320);
    return () => clearTimeout(t);
  }, [query, open, item?.profissao]);

  // Quando seleciona procedimento, carrega CIDs relacionados
  const onSelectProc = async (h: SigtapHit) => {
    setSelSigtap(h);
    setSelCid("");
    setCidOptions([]);
    setCidQuery("");
    setCidManual("");
    setCidLoadError("");
    setLoadingCids(true);
    try {
      // Carrega TODOS os CIDs vinculados, sem o antigo corte de 200 linhas.
      // Consulta variantes do código para tolerar catálogo com/sem zeros à esquerda.
      const codigoNormalizado = normalizeSigtap(h.codigo);
      const variantes = [...new Set([String(h.codigo || "").trim(), onlyDigits(h.codigo), codigoNormalizado].filter(Boolean))];
      const todos: any[] = [];
      const PAGE_SIZE = 1000;

      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await (supabase as any)
          .from("sigtap_procedimento_cids")
          .select("procedimento_codigo, cid_codigo, cid_descricao")
          .in("procedimento_codigo", variantes)
          .order("cid_codigo", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        const pagina = Array.isArray(data) ? data : [];
        todos.push(...pagina);
        if (pagina.length < PAGE_SIZE) break;
      }

      const unicos = new Map<string, CidHit>();
      todos.forEach((row: any) => {
        const codigo = normalizeCid(row?.cid_codigo || "");
        if (!isValidCid10(codigo)) return;
        if (!unicos.has(codigo)) {
          unicos.set(codigo, {
            cid_codigo: codigo,
            cid_descricao: String(row?.cid_descricao || "").trim(),
          });
        }
      });

      setCidOptions(
        [...unicos.values()].sort((a, b) =>
          a.cid_codigo.localeCompare(b.cid_codigo, "pt-BR"),
        ),
      );
    } catch (e: any) {
      console.error("[BPA] CIDs do procedimento:", e);
      setCidLoadError(e?.message || "Não foi possível carregar os CIDs relacionados.");
    } finally {
      setLoadingCids(false);
    }
  };

  const cidOptionsFiltradas = useMemo(() => {
    const q = normalizeSearchText(cidQuery).replace(/\./g, "");
    if (!q) return cidOptions;
    return cidOptions.filter((c) => {
      const codigo = normalizeSearchText(c.cid_codigo).replace(/\./g, "");
      const descricao = normalizeSearchText(c.cid_descricao);
      return codigo.includes(q) || descricao.includes(q);
    });
  }, [cidOptions, cidQuery]);

  const impactoCount = prontuarios.length;
  const sobrescritas = useMemo(() => {
    if (!selSigtap) return [];
    return prontuarios
      .map((p) => {
        const cd = p?.custom_data || {};
        const curSig = cd.procedimento_sigtap || cd.codigo_sigtap || cd.sigtap || "";
        const curCid = cd.cid || cd.cid10 || cd.cid_principal || "";
        const newSig = selSigtap.codigo;
        const newCid = (selCid || cidManual || "").toUpperCase();
        const sigChange = curSig && normalizeSigtap(curSig) !== normalizeSigtap(newSig);
        const cidChange = curCid && newCid && String(curCid).toUpperCase() !== newCid;
        return { id: p.id, prof: p.profissional_nome, curSig, curCid, sigChange, cidChange };
      })
      .filter((r) => r.sigChange || r.cidChange);
  }, [prontuarios, selSigtap, selCid, cidManual]);

  const cidEscolhidoRaw = (selCid || cidManual || "").trim();
  const cidInvalido = cidEscolhidoRaw.length > 0 && !isValidCid10(cidEscolhidoRaw);

  const podeSalvar =
    !!selSigtap &&
    motivo.trim().length >= 3 &&
    impactoCount > 0 &&
    !cidInvalido;

  const handleSalvar = async () => {
    if (!item || !selSigtap) return;
    if (cidInvalido) {
      toast.error("CID-10 inválido. Use o formato oficial (ex.: M54, M54.5, Z00.0).");
      return;
    }
    if (sobrescritas.length > 0) {
      const ok = window.confirm(
        `Atenção: ${sobrescritas.length} registro(s) já possuem valor diferente preenchido e serão SOBRESCRITOS.\n\nDeseja prosseguir?`,
      );
      if (!ok) return;
    }
    setSaving(true);
    setProgress({ done: 0, total: prontuarios.length });
    try {
      const newSig = normalizeSigtap(selSigtap.codigo);
      const newCid = cidEscolhidoRaw ? normalizeCid(cidEscolhidoRaw) : "";

      // Update each prontuario.custom_data of (paciente, data)
      let done = 0;
      for (const p of prontuarios) {
        const cd = { ...(p.custom_data || {}) };
        cd.procedimento_sigtap = newSig;
        cd.codigo_sigtap = newSig;
        cd.procedimento_nome = selSigtap.nome;
        if (newCid) {
          cd.cid = newCid;
          cd.cid10 = newCid;
        }
        cd.bpa_correcao = {
          aplicado_em: new Date().toISOString(),
          aplicado_por_id: userId || null,
          aplicado_por_nome: userNome || null,
          motivo,
          origem: "bpa_exportar_resolver_sigtap",
        };
        const { error } = await (supabase as any)
          .from("prontuarios")
          .update({
            custom_data: cd,
            motivo_alteracao: `BPA-Exportar: ${motivo}`,
          })
          .eq("id", p.id);
        if (error) throw error;
        done += 1;
        setProgress({ done, total: prontuarios.length });
      }

      // Aplicar também no PTS quando solicitado (Fisioterapia)
      if (isFisio && aplicarPts && ptsAtivo?.id) {
        const cdPts = { ...(ptsAtivo.custom_data || {}) };
        cdPts.codigo_sigtap = newSig;
        cdPts.procedimento_sigtap = newSig;
        if (newCid) cdPts.cid = newCid;
        cdPts.bpa_correcao = {
          aplicado_em: new Date().toISOString(),
          aplicado_por_id: userId || null,
          aplicado_por_nome: userNome || null,
          motivo,
        };
        await (supabase as any).from("pts").update({ custom_data: cdPts }).eq("id", ptsAtivo.id);
      }

      // Auditoria
      try {
        await (supabase as any).from("notification_logs").insert({
          canal: "sistema",
          evento: "bpa_sigtap_correcao",
          status: "pendente",
          payload: {
            paciente_id: item.paciente_id,
            paciente_nome: item.paciente_nome,
            profissional_id: item.profissional_id,
            profissional_nome: item.profissional_nome,
            profissao: item.profissao,
            unidade_id: item.unidade_id,
            competencia: item.competencia || null,
            data_atendimento_origem: item.data_atendimento || null,
            escopo: item.competencia ? "paciente+competencia+profissional+unidade" : "paciente+data",
            prontuarios_afetados: prontuarios.map((p) => ({ id: p.id, data: p.data_atendimento })),
            pts_aplicado: !!(isFisio && aplicarPts && ptsAtivo?.id),
            pts_id: ptsAtivo?.id || null,
            sigtap_novo: newSig,
            sigtap_nome: selSigtap.nome,
            cid_novo: newCid,
            sigtap_anterior: valoresAtuais.sigtap || null,
            cid_anterior: valoresAtuais.cid || null,
            motivo,
            user_id: userId || null,
            user_nome: userNome || null,
          },
        });
      } catch (e) {
        console.warn("[BPA] log auditoria falhou:", e);
      }

      const escopoTxt = item.competencia
        ? `na competência ${item.competencia.slice(4, 6)}/${item.competencia.slice(0, 4)}`
        : "nessa data";
      toast.success(`SIGTAP/CID corrigido em ${prontuarios.length} registro(s) do paciente ${escopoTxt}.`);
      onResolved();
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error("Falha ao aplicar correção: " + (e?.message || "erro desconhecido"));
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Resolver Procedimento SIGTAP / CID
          </DialogTitle>
          <DialogDescription>
            {item?.competencia ? (
              <>
                Esta correção será aplicada em <b>lote</b> para <b>este paciente</b> em <b>todos os atendimentos
                da competência {item.competencia.slice(4, 6)}/{item.competencia.slice(0, 4)}</b>,
                restrita ao mesmo profissional e unidade. Não afeta outros meses nem outros pacientes.
              </>
            ) : (
              <>
                Esta correção será aplicada para <b>este paciente</b> em <b>todos os atendimentos da mesma data</b>,
                dentro da fonte correta do sistema. Não afeta outras datas nem outros pacientes.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Contexto */}
        <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
          <div><b>Paciente:</b> {item?.paciente_nome || "—"}</div>
          <div><b>Profissional:</b> {item?.profissional_nome || "—"} · <b>Profissão:</b> {item?.profissao || "—"}</div>
          <div>
            <b>Unidade:</b> {item?.unidade_nome || "—"}
            {item?.competencia
              ? <> · <b>Competência:</b> {item.competencia.slice(4, 6)}/{item.competencia.slice(0, 4)}</>
              : <> · <b>Data:</b> {item?.data_atendimento || "—"}</>}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
            {loadingCtx ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Carregando registros…</>
            ) : (
              <>
                <FileText className="h-3 w-3" />
                {prontuarios.length} prontuário(s) {item?.competencia ? "no mês" : "nessa data"} serão atualizados
                {isFisio && ptsAtivo && <> · PTS vinculado: <b>{ptsAtivo.id?.slice(0, 8)}</b></>}
              </>
            )}
          </div>
          {item?.competencia && prontuarios.length > 0 && !loadingCtx && (
            <details className="text-xs pt-1">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Ver datas dos atendimentos afetados ({prontuarios.length})
              </summary>
              <ul className="list-disc ml-5 mt-1 max-h-32 overflow-y-auto">
                {prontuarios.map((p) => (
                  <li key={p.id}>
                    {p.data_atendimento} — <span className="text-muted-foreground">{p.profissional_nome || "?"}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="text-xs">
            <b>Valor atual SIGTAP:</b>{" "}
            {valoresAtuais.sigtap ? <code className="bg-background px-1 rounded">{valoresAtuais.sigtap}</code> : <span className="text-muted-foreground">— vazio —</span>}
            {" · "}
            <b>CID:</b>{" "}
            {valoresAtuais.cid ? <code className="bg-background px-1 rounded">{valoresAtuais.cid}</code> : <span className="text-muted-foreground">— vazio —</span>}
          </div>
        </div>

        {/* Busca SIGTAP */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2"><Search className="h-4 w-4" /> Buscar na Tabela SIGTAP</Label>
          <Input
            placeholder="Código, nome do procedimento, CID ou especialidade…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="rounded-md border max-h-64 overflow-y-auto">
            {searching && (
              <div className="p-3 text-sm flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
              </div>
            )}
            {!searching && hits.length === 0 && query.length >= 2 && (
              <div className="p-3 text-sm text-muted-foreground">Nenhum procedimento encontrado.</div>
            )}
            {!searching && hits.map((h) => (
              <button
                key={h.codigo}
                type="button"
                onClick={() => onSelectProc(h)}
                className={`w-full text-left px-3 py-2 border-b last:border-0 hover:bg-accent text-sm ${selSigtap?.codigo === h.codigo ? "bg-accent" : ""}`}
              >
                <div className="font-mono text-xs text-primary">{h.codigo}</div>
                <div className="font-medium">{h.nome}</div>
                {h.especialidade && <div className="text-xs text-muted-foreground">{h.especialidade}</div>}
              </button>
            ))}
          </div>
        </div>

        {/* CID relacionado */}
        {selSigtap && (
          <div className="space-y-2">
            <Label>
              CID-10 relacionado
              {!loadingCids && (
                <span className="ml-2 text-xs text-muted-foreground">
                  ({cidOptions.length} compatível(is) carregado(s))
                </span>
              )}
            </Label>

            {loadingCids && (
              <div className="flex items-center gap-2 rounded-md border p-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando todos os CIDs relacionados…
              </div>
            )}

            {cidLoadError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Falha ao consultar vínculos SIGTAP–CID</AlertTitle>
                <AlertDescription>{cidLoadError}</AlertDescription>
              </Alert>
            )}

            {!loadingCids && cidOptions.length > 0 && (
              <>
                <Input
                  placeholder="Filtrar CID relacionado por código ou descrição…"
                  value={cidQuery}
                  onChange={(e) => setCidQuery(e.target.value)}
                />
                <select
                  className="w-full border rounded-md p-2 bg-background text-sm"
                  value={selCid}
                  onChange={(e) => { setSelCid(e.target.value); setCidManual(""); }}
                  size={Math.min(Math.max(cidOptionsFiltradas.length + 1, 4), 10)}
                >
                  <option value="">— Selecione um CID compatível —</option>
                  {cidOptionsFiltradas.map((c) => (
                    <option key={c.cid_codigo} value={c.cid_codigo}>
                      {c.cid_codigo} — {c.cid_descricao || "Sem descrição no catálogo"}
                    </option>
                  ))}
                </select>
                {cidOptionsFiltradas.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nenhum CID relacionado corresponde ao filtro informado.
                  </p>
                )}
              </>
            )}

            {!loadingCids && cidOptions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                O catálogo não possui CID vinculado a este procedimento. O CID é opcional; informe manualmente somente
                se houver diagnóstico registrado no atendimento.
              </p>
            )}

            {!loadingCids && (
              <div className="space-y-1">
                <Label className="text-xs">
                  CID manual {cidOptions.length > 0 && "(use somente se o vínculo oficial estiver incompleto)"}
                </Label>
              <Input
                placeholder="Ex.: M54 ou M54.5"
                value={cidManual}
                onChange={(e) => {
                  setCidManual(e.target.value.toUpperCase());
                  if (e.target.value) setSelCid("");
                }}
                maxLength={6}
                aria-invalid={cidInvalido}
                className={cidInvalido ? "border-destructive" : ""}
              />
              </div>
            )}
            {cidInvalido && (
              <p className="text-xs text-destructive">
                CID-10 inválido. Use o formato oficial: 1 letra + 2 dígitos, opcional ponto + 1 dígito (ex.: <code>M54</code>, <code>M54.5</code>, <code>Z00.0</code>).
              </p>
            )}
          </div>
        )}

        {/* Seleção de PTS para Fisio (quando houver mais de um ativo) */}
        {isFisio && ptsList.length > 0 && (
          <div className="space-y-2 rounded-md border p-3 bg-muted/20">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={aplicarPts} onChange={(e) => setAplicarPts(e.target.checked)} />
              Também aplicar no PTS vinculado (Fisioterapia)
            </label>
            {aplicarPts && (
              <>
                {ptsList.length > 1 ? (
                  <>
                    <Label className="text-xs">Há {ptsList.length} PTS ativos — selecione qual será atualizado:</Label>
                    <select
                      className="w-full border rounded-md p-2 bg-background text-sm"
                      value={ptsAtivo?.id || ""}
                      onChange={(e) => {
                        const sel = ptsList.find((p) => p.id === e.target.value) || null;
                        setPtsAtivo(sel);
                      }}
                    >
                      {ptsList.map((p) => (
                        <option key={p.id} value={p.id}>
                          PTS {p.id.slice(0, 8)} · {p.diagnostico_funcional?.slice(0, 50) || p.objetivo_geral?.slice(0, 50) || "sem descrição"}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    PTS ativo: <code>{ptsAtivo?.id?.slice(0, 8)}</code>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Motivo obrigatório */}
        <div className="space-y-1">
          <Label>Motivo da correção <span className="text-destructive">*</span></Label>
          <Input
            placeholder="Ex.: Profissional não preencheu SIGTAP no prontuário"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={240}
          />
        </div>

        {/* Pré-visualização de impacto */}
        {selSigtap && (
          <Alert className={sobrescritas.length ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"}>
            {sobrescritas.length ? (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            )}
            <AlertTitle className="text-sm">
              Impacto: {impactoCount} registro(s) serão atualizados
            </AlertTitle>
            <AlertDescription className="text-xs space-y-1">
              <div>Novo SIGTAP: <code className="font-mono">{selSigtap.codigo}</code> — {selSigtap.nome}</div>
              {(selCid || cidManual) && <div>Novo CID: <code className="font-mono">{(selCid || cidManual).toUpperCase()}</code></div>}
              {sobrescritas.length > 0 && (
                <div className="pt-1">
                  <b>Atenção:</b> {sobrescritas.length} já tem valor diferente. Você será solicitado a confirmar.
                  <ul className="list-disc ml-5 mt-1">
                    {sobrescritas.slice(0, 6).map((s) => (
                      <li key={s.id}>{s.prof || "?"} — atual: {s.curSig || "vazio"} / {s.curCid || "—"}</li>
                    ))}
                    {sobrescritas.length > 6 && <li>… e mais {sobrescritas.length - 6}.</li>}
                  </ul>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Progresso em lote */}
        {saving && progress && progress.total > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Aplicando correção em lote…</span>
              <span>{progress.done} / {progress.total}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }}
              />
            </div>
            {progress.total >= 10 && (
              <p className="text-[11px] text-muted-foreground">
                Lote grande: não feche esta janela até concluir.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={!podeSalvar || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {saving && progress
              ? `Aplicando ${progress.done}/${progress.total}…`
              : `Aplicar correção em ${impactoCount} registro(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BpaResolverSigtapModal;
