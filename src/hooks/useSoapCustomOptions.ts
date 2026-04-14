import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SoapCustomOption {
  id: string;
  profissional_id: string;
  campo: string;
  opcao: string;
  profissao: string;
  created_at: string;
}

export function useSoapCustomOptions(profissionalId: string | undefined) {
  const [customOptions, setCustomOptions] = useState<SoapCustomOption[]>([]);
  const [loading, setLoading] = useState(false);

  const loadOptions = useCallback(async () => {
    if (!profissionalId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("soap_custom_options")
        .select("*")
        .eq("profissional_id", profissionalId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setCustomOptions(data || []);
    } catch (err) {
      console.error("Erro ao carregar opções SOAP personalizadas:", err);
    } finally {
      setLoading(false);
    }
  }, [profissionalId]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const addOption = useCallback(async (campo: string, opcao: string, profissao: string) => {
    if (!profissionalId || !opcao.trim()) return;
    try {
      const { error } = await (supabase as any)
        .from("soap_custom_options")
        .insert({ profissional_id: profissionalId, campo, opcao: opcao.trim(), profissao });
      if (error) throw error;
      await loadOptions();
      toast.success("Opção adicionada!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar opção.");
    }
  }, [profissionalId, loadOptions]);

  const deleteOption = useCallback(async (id: string) => {
    try {
      const { error } = await (supabase as any)
        .from("soap_custom_options")
        .delete()
        .eq("id", id);
      if (error) throw error;
      setCustomOptions((prev) => prev.filter((o) => o.id !== id));
      toast.success("Opção removida.");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao remover opção.");
    }
  }, []);

  const getOptionsForField = useCallback((campo: string): string[] => {
    return customOptions
      .filter((o) => o.campo === campo)
      .map((o) => o.opcao);
  }, [customOptions]);

  const getOptionWithId = useCallback((campo: string): { id: string; opcao: string }[] => {
    return customOptions
      .filter((o) => o.campo === campo)
      .map((o) => ({ id: o.id, opcao: o.opcao }));
  }, [customOptions]);

  return { customOptions, loading, addOption, deleteOption, getOptionsForField, getOptionWithId, reload: loadOptions };
}
