
-- Tabela de configuração de prontuário por profissional
CREATE TABLE IF NOT EXISTS public.prontuario_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profissional_id text NOT NULL,
  tipo_prontuario text NOT NULL DEFAULT 'sessao',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  versao integer NOT NULL DEFAULT 1,
  template_nome text,
  is_default boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(profissional_id, tipo_prontuario)
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_prontuario_config_prof_tipo
  ON public.prontuario_config(profissional_id, tipo_prontuario);

-- Enable RLS
ALTER TABLE public.prontuario_config ENABLE ROW LEVEL SECURITY;

-- Each professional can only access their own config
CREATE POLICY "profissional_read_own_config"
  ON public.prontuario_config
  FOR SELECT
  TO authenticated
  USING (
    profissional_id IN (
      SELECT id::text FROM public.funcionarios WHERE auth_user_id = auth.uid() AND ativo = true
    )
    OR has_staff_role('master')
  );

CREATE POLICY "profissional_insert_own_config"
  ON public.prontuario_config
  FOR INSERT
  TO authenticated
  WITH CHECK (
    profissional_id IN (
      SELECT id::text FROM public.funcionarios WHERE auth_user_id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY "profissional_update_own_config"
  ON public.prontuario_config
  FOR UPDATE
  TO authenticated
  USING (
    profissional_id IN (
      SELECT id::text FROM public.funcionarios WHERE auth_user_id = auth.uid() AND ativo = true
    )
  )
  WITH CHECK (
    profissional_id IN (
      SELECT id::text FROM public.funcionarios WHERE auth_user_id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY "profissional_delete_own_config"
  ON public.prontuario_config
  FOR DELETE
  TO authenticated
  USING (
    profissional_id IN (
      SELECT id::text FROM public.funcionarios WHERE auth_user_id = auth.uid() AND ativo = true
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_prontuario_config_updated_at
  BEFORE UPDATE ON public.prontuario_config
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_now();
