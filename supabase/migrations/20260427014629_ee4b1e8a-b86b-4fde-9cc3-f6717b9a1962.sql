
CREATE TABLE IF NOT EXISTS public.prontuario_exames (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  paciente_id text NOT NULL DEFAULT '',
  prontuario_id text NOT NULL DEFAULT '',
  atendimento_id text NOT NULL DEFAULT '',
  unidade_id text NOT NULL DEFAULT '',
  profissional_id text NOT NULL DEFAULT '',
  profissional_nome text NOT NULL DEFAULT '',
  nome_exame text NOT NULL DEFAULT '',
  tipo_exame text NOT NULL DEFAULT '',
  data_exame date NULL,
  laboratorio text NOT NULL DEFAULT '',
  medico_solicitante text NOT NULL DEFAULT '',
  resultado_descrito text NOT NULL DEFAULT '',
  interpretacao_profissional text NOT NULL DEFAULT '',
  observacoes_medicas text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'liberado',
  tipo_atendimento_vinculado text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prontuario_exames_paciente ON public.prontuario_exames(paciente_id);
CREATE INDEX IF NOT EXISTS idx_prontuario_exames_prontuario ON public.prontuario_exames(prontuario_id);
CREATE INDEX IF NOT EXISTS idx_prontuario_exames_atendimento ON public.prontuario_exames(atendimento_id);

ALTER TABLE public.prontuario_exames ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read prontuario_exames"
ON public.prontuario_exames FOR SELECT
TO authenticated
USING (is_staff_member());

CREATE POLICY "Staff insert prontuario_exames"
ON public.prontuario_exames FOR INSERT
TO authenticated
WITH CHECK (is_staff_member());

CREATE POLICY "Staff update prontuario_exames"
ON public.prontuario_exames FOR UPDATE
TO authenticated
USING (is_staff_member())
WITH CHECK (is_staff_member());

CREATE POLICY "Staff delete prontuario_exames"
ON public.prontuario_exames FOR DELETE
TO authenticated
USING (is_staff_member());

CREATE TRIGGER trg_prontuario_exames_updated_at
BEFORE UPDATE ON public.prontuario_exames
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_now();
