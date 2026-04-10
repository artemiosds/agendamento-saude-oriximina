
CREATE TABLE public.clinica_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_clinica text NOT NULL DEFAULT '',
  logo_url text NOT NULL DEFAULT '',
  telefone text NOT NULL DEFAULT '',
  evolution_base_url text NOT NULL DEFAULT 'https://api.agendamento-saude-sms-oriximina.site',
  evolution_api_key text NOT NULL DEFAULT '',
  evolution_instance_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clinica_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read clinica_config"
  ON public.clinica_config FOR SELECT TO authenticated
  USING (is_staff_member());

CREATE POLICY "Master manage clinica_config"
  ON public.clinica_config FOR ALL TO authenticated
  USING (has_staff_role('master'))
  WITH CHECK (has_staff_role('master'));
