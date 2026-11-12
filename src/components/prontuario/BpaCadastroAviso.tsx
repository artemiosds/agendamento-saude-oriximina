import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { pickValidCnsPaciente, normalizeRacaCorBpa } from "@/lib/bpaNormalization";

/** Pré-conferência informativa; a validação definitiva continua na exportação BPA-I. */
export default function BpaCadastroAviso({ patientId }: { patientId: string }) {
  const { data, error, isPending } = useQuery({
    queryKey: ["bpa-cadastro-aviso", patientId], enabled: !!patientId,
    queryFn: async () => {
      const { data: patient, error: dbError } = await supabase.from("pacientes")
        .select("cns,nome_mae,raca_cor,custom_data").eq("id", patientId).single();
      if (dbError) throw dbError;
      const cd = patient.custom_data && typeof patient.custom_data === "object" && !Array.isArray(patient.custom_data)
        ? patient.custom_data as Record<string, unknown> : {};
      const issues: string[] = [];
      if (!pickValidCnsPaciente(patient).cns) issues.push("CNS ausente ou inválido");
      if (!String(patient.nome_mae || cd.nome_mae || "").trim()) issues.push("nome da mãe não cadastrado");
      if (normalizeRacaCorBpa(patient.raca_cor || cd.raca_cor || cd.racaCor).autoCorrigido) issues.push("raça/cor não confirmada no cadastro");
      return issues;
    },
  });
  if (!patientId || isPending) return null;
  if (error) return <p role="status" className="text-xs text-amber-700">Não foi possível conferir os dados cadastrais para BPA-I.</p>;
  if (!data?.length) return null;
  return <div role="status" className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
    <AlertTriangle className="w-4 h-4 shrink-0" />
    <p><strong>Confira o cadastro para BPA-I:</strong> {data.join("; ")}. O atendimento clínico pode continuar; a exportação faz a validação definitiva.</p>
  </div>;
}
