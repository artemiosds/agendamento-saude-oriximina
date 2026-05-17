import React, { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, History, User, Calendar, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface HistoricoPacientePanelProps {
  paciente: {
    nome?: string;
    data_nascimento?: string;
    cpf?: string;
    cns?: string;
    sexo?: string;
  } | null;
  historico: Array<{
    id: string;
    data_atendimento: string;
    profissional_nome?: string;
    queixa_principal?: string;
    conduta?: string;
    anamnese?: string;
    tipo_registro?: string;
  }>;
  currentId?: string;
}

function calcIdade(dataNasc?: string): string {
  if (!dataNasc) return "—";
  try {
    const d = new Date(dataNasc + (dataNasc.length === 10 ? "T12:00:00" : ""));
    if (isNaN(d.getTime())) return "—";
    const diff = Date.now() - d.getTime();
    const age = new Date(diff).getUTCFullYear() - 1970;
    return `${age} anos`;
  } catch {
    return "—";
  }
}

function fmtDate(s?: string): string {
  if (!s) return "";
  try {
    return new Date(s + (s.length === 10 ? "T12:00:00" : "")).toLocaleDateString("pt-BR");
  } catch {
    return s;
  }
}

const HistoricoPacientePanel: React.FC<HistoricoPacientePanelProps> = ({ paciente, historico, currentId }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...(historico || [])]
        .filter((h) => h.id !== currentId)
        .sort((a, b) => (b.data_atendimento || "").localeCompare(a.data_atendimento || "")),
    [historico, currentId],
  );

  return (
    <aside className="hidden lg:flex flex-col h-full w-full border-l border-border bg-muted/20">
      {/* Patient Card */}
      <div className="p-4 border-b border-border bg-card/50">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">
              {paciente?.nome || "Nenhum paciente selecionado"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {calcIdade(paciente?.data_nascimento)}
              {paciente?.data_nascimento && ` · ${fmtDate(paciente.data_nascimento)}`}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
          <div>
            <dt className="text-muted-foreground uppercase tracking-wide text-[10px]">CPF</dt>
            <dd className="text-foreground font-mono truncate">{paciente?.cpf || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground uppercase tracking-wide text-[10px]">CNS</dt>
            <dd className="text-foreground font-mono truncate">{paciente?.cns || "—"}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted-foreground uppercase tracking-wide text-[10px]">Sexo</dt>
            <dd className="text-foreground capitalize">{paciente?.sexo || "—"}</dd>
          </div>
        </dl>
      </div>

      {/* History */}
      <div className="px-4 py-3 flex items-center gap-2 border-b border-border/60">
        <History className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Histórico de Atendimentos
        </h3>
        <Badge variant="secondary" className="ml-auto text-[10px]">{sorted.length}</Badge>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {!paciente && (
            <p className="text-xs text-muted-foreground italic text-center py-6">
              Selecione um paciente para ver o histórico.
            </p>
          )}
          {paciente && sorted.length === 0 && (
            <div className="text-center py-6">
              <p className="text-xs text-muted-foreground italic">
                Primeiro atendimento deste paciente
              </p>
            </div>
          )}
          {sorted.map((h) => {
            const isExpanded = expandedId === h.id;
            const queixa = (h.queixa_principal || "").trim();
            return (
              <div
                key={h.id}
                className="rounded-lg border border-border bg-card hover:border-primary/40 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : h.id)}
                  className="w-full text-left px-3 py-2 flex items-start gap-2"
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      <span>{fmtDate(h.data_atendimento)}</span>
                    </div>
                    <p className="text-[12px] text-foreground truncate mt-0.5">
                      <Stethoscope className="w-3 h-3 inline mr-1 text-muted-foreground" />
                      {h.profissional_nome || "—"}
                    </p>
                    <p className="text-[12px] text-muted-foreground truncate mt-0.5">
                      {queixa || <em className="opacity-60">Sem queixa registrada</em>}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[9px] shrink-0 mt-0.5"
                  >
                    Finalizado
                  </Badge>
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-border/40 space-y-2 text-[12px]">
                    {queixa && (
                      <div>
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground">Queixa</p>
                        <p className="text-foreground whitespace-pre-wrap">{queixa}</p>
                      </div>
                    )}
                    {h.anamnese && (
                      <div>
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground">Anamnese</p>
                        <p className="text-foreground whitespace-pre-wrap line-clamp-6">{h.anamnese}</p>
                      </div>
                    )}
                    {h.conduta && (
                      <div>
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground">Conduta</p>
                        <p className="text-foreground whitespace-pre-wrap line-clamp-6">{h.conduta}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </aside>
  );
};

export default HistoricoPacientePanel;
