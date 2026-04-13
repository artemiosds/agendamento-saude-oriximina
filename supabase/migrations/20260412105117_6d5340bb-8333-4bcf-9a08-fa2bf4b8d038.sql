
CREATE TABLE public.medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  principio_ativo text NOT NULL DEFAULT '',
  classe_terapeutica text NOT NULL DEFAULT '',
  apresentacao text NOT NULL DEFAULT '',
  dosagem_padrao text NOT NULL DEFAULT '',
  via_padrao text NOT NULL DEFAULT 'oral',
  is_global boolean NOT NULL DEFAULT true,
  profissional_id text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read medications"
  ON public.medications FOR SELECT
  TO authenticated
  USING (is_staff_member());

CREATE POLICY "Staff insert medications"
  ON public.medications FOR INSERT
  TO authenticated
  WITH CHECK (is_staff_member());

CREATE POLICY "Master manage medications"
  ON public.medications FOR ALL
  TO authenticated
  USING (has_staff_role('master'))
  WITH CHECK (has_staff_role('master'));
