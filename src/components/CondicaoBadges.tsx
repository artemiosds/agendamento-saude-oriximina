import React from "react";
import { hasCondicao } from "@/lib/condicoesPaciente";

interface Props {
  tipoCondicao?: string | null;
  mobilidade?: string | null;
  isAutista?: boolean;
}

const base = "text-[10px] px-1.5 py-0.5 rounded-full font-semibold";

/** Selos extras de condição/mobilidade (complementam IDOSO/GESTANTE/PNE/TEA). Suporta várias condições juntas. */
export const CondicaoBadges: React.FC<Props> = ({ tipoCondicao, mobilidade, isAutista }) => (
  <>
    {mobilidade === "cadeira_rodas" && (
      <span className={`${base} bg-blue-700 text-white`}>♿ CADEIRANTE</span>
    )}
    {mobilidade === "acamado" && (
      <span className={`${base} bg-destructive text-destructive-foreground`}>🛏️ ACAMADO</span>
    )}
    {mobilidade === "muleta_andador" && (
      <span className={`${base} bg-sky-600 text-white`}>🦯 MULETA/ANDADOR</span>
    )}
    {hasCondicao(tipoCondicao, "fisica") && !mobilidade?.match(/cadeira_rodas|acamado|muleta_andador/) && (
      <span className={`${base} bg-sky-700 text-white`}>DEF. FÍSICA</span>
    )}
    {hasCondicao(tipoCondicao, "intelectual") && (
      <span className={`${base} bg-indigo-600 text-white`}>🧠 DEF. INTELECTUAL</span>
    )}
    {hasCondicao(tipoCondicao, "visual") && (
      <span className={`${base} bg-slate-700 text-white`}>👁️ DEF. VISUAL</span>
    )}
    {hasCondicao(tipoCondicao, "auditiva") && (
      <span className={`${base} bg-teal-700 text-white`}>🦻 DEF. AUDITIVA</span>
    )}
    {hasCondicao(tipoCondicao, "tea") && !isAutista && (
      <span className={`${base} bg-purple-500 text-white`}>PRIORIDADE TEA</span>
    )}
  </>
);

export default CondicaoBadges;
