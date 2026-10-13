import React from "react";

interface Props {
  tipoCondicao?: string | null;
  mobilidade?: string | null;
  isAutista?: boolean;
}

const base = "text-[10px] px-1.5 py-0.5 rounded-full font-semibold";

/** Selos extras de condição/mobilidade (complementam IDOSO/GESTANTE/PNE/TEA). */
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
    {tipoCondicao === "fisica" && !mobilidade?.match(/cadeira_rodas|acamado|muleta_andador/) && (
      <span className={`${base} bg-sky-700 text-white`}>DEF. FÍSICA</span>
    )}
    {tipoCondicao === "intelectual" && (
      <span className={`${base} bg-indigo-600 text-white`}>🧠 DEF. INTELECTUAL</span>
    )}
    {tipoCondicao === "tea" && !isAutista && (
      <span className={`${base} bg-purple-500 text-white`}>PRIORIDADE TEA</span>
    )}
  </>
);

export default CondicaoBadges;
