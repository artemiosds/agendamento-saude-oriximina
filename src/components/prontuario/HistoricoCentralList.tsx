import React, { useState } from "react";
import { History, Eye, Printer, Copy, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { printProntuario, copyEvolucao, buildEvolucaoText } from "./HistoricoPacientePanel";

interface Props {
  items: any[];
  onView?: (entry: any) => void;
}

const fmtDate = (s?: string) => {
  if (!s) return "";
  try { return new Date(s + (s.length === 10 ? "T12:00:00" : "")).toLocaleDateString("pt-BR"); }
  catch { return s; }
};

const HistoricoCentralList: React.FC<Props> = ({ items, onView }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="bg-muted/50 rounded-lg p-3 border">
      <div className="flex items-center gap-2 mb-2">
        <History className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">
          Histórico do Paciente ({items.length} anterior(es))
        </span>
      </div>
      <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
        {items.slice(0, 20).map((ph) => {
          const isExp = expanded.has(ph.id);
          const evolucaoFull = buildEvolucaoText(ph);
          return (
            <div key={ph.id} className="bg-background border border-border rounded-md">
              <button
                type="button"
                onClick={() => toggle(ph.id)}
                className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-muted/30 rounded-md"
              >
                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0 transition-transform ${isExp ? "" : "-rotate-90"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-foreground">
                      {fmtDate(ph.data_atendimento)}
                      {ph.hora_atendimento ? ` · ${ph.hora_atendimento}` : ""}
                      <span className="font-normal text-muted-foreground"> — {ph.profissional_nome || "—"}</span>
                    </span>
                    {(ph.cid_codigo || ph.cid_descricao) && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary">
                        CID {[ph.cid_codigo, ph.cid_descricao].filter(Boolean).join(" — ")}
                      </span>
                    )}
                  </div>
                  <p className={`text-xs text-muted-foreground mt-1 whitespace-pre-wrap ${isExp ? "" : "line-clamp-3"}`}>
                    {ph.queixa_principal || ph.soap_subjetivo || ph.evolucao || "Sem queixa registrada"}
                  </p>
                  {!isExp && (
                    <span className="text-[11px] text-primary hover:underline mt-1 inline-block">Ver mais</span>
                  )}
                </div>
              </button>
              {isExp && (
                <div className="px-3 pb-3 border-t border-border/40 space-y-2 text-xs">
                  {evolucaoFull ? (
                    <p className="text-foreground whitespace-pre-wrap pt-2">{evolucaoFull}</p>
                  ) : (
                    <p className="italic text-muted-foreground pt-2">Sem conteúdo registrado.</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {onView && (
                      <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] px-2"
                        onClick={(e) => { e.stopPropagation(); onView(ph); }}>
                        <Eye className="w-3 h-3 mr-1" /> Ver completo
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] px-2"
                      onClick={(e) => { e.stopPropagation(); printProntuario(ph); }}>
                      <Printer className="w-3 h-3 mr-1" /> Imprimir
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] px-2"
                      onClick={(e) => { e.stopPropagation(); copyEvolucao(ph); }}>
                      <Copy className="w-3 h-3 mr-1" /> Copiar evolução
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(HistoricoCentralList);
