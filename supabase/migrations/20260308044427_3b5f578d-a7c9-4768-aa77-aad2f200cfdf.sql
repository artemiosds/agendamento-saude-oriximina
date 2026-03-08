
CREATE TABLE public.notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id text DEFAULT '',
  evento text NOT NULL,
  canal text NOT NULL DEFAULT 'webhook',
  destinatario_email text DEFAULT '',
  destinatario_telefone text DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'enviado',
  resposta text DEFAULT '',
  erro text DEFAULT '',
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read notification_logs" ON public.notification_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone insert notification_logs" ON public.notification_logs
  FOR INSERT WITH CHECK (true);
