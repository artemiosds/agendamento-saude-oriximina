
-- Tabela principal de sistemas externos integrados
CREATE TABLE IF NOT EXISTS public.sistemas_integrados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  identificador text NOT NULL UNIQUE,
  url_base text NOT NULL DEFAULT '',
  token_saida text NOT NULL DEFAULT '',
  token_entrada_hash text NOT NULL DEFAULT '',
  token_entrada_prefix text NOT NULL DEFAULT '',
  ativo boolean NOT NULL DEFAULT true,
  pode_enviar boolean NOT NULL DEFAULT true,
  pode_receber boolean NOT NULL DEFAULT true,
  unidade_id text NOT NULL DEFAULT '',
  criado_por text NOT NULL DEFAULT '',
  ultimo_teste_em timestamptz,
  ultimo_teste_status text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sistemas_integrados_identificador ON public.sistemas_integrados(identificador);
CREATE INDEX IF NOT EXISTS idx_sistemas_integrados_unidade ON public.sistemas_integrados(unidade_id);

ALTER TABLE public.sistemas_integrados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master manage sistemas_integrados"
ON public.sistemas_integrados FOR ALL
TO authenticated
USING (has_staff_role('master'))
WITH CHECK (has_staff_role('master'));

CREATE POLICY "Staff read sistemas_integrados"
ON public.sistemas_integrados FOR SELECT
TO authenticated
USING (is_staff_member());

CREATE TRIGGER trg_sistemas_integrados_updated
BEFORE UPDATE ON public.sistemas_integrados
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

-- Tabela de logs de integração
CREATE TABLE IF NOT EXISTS public.integracoes_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema_id uuid,
  identificador_origem text NOT NULL DEFAULT '',
  direcao text NOT NULL DEFAULT 'entrada',
  endpoint text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'sucesso',
  mensagem text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integracoes_log_sistema ON public.integracoes_log(sistema_id);
CREATE INDEX IF NOT EXISTS idx_integracoes_log_created ON public.integracoes_log(created_at DESC);

ALTER TABLE public.integracoes_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master read integracoes_log"
ON public.integracoes_log FOR SELECT
TO authenticated
USING (has_staff_role('master') OR has_staff_role('coordenador') OR has_staff_role('gestao'));

CREATE POLICY "Staff insert integracoes_log"
ON public.integracoes_log FOR INSERT
TO authenticated
WITH CHECK (is_staff_member());
