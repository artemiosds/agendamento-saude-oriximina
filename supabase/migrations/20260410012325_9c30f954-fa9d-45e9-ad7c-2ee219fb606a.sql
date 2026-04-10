
-- Table: profissionais_carimbo
CREATE TABLE public.profissionais_carimbo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profissional_id uuid NOT NULL UNIQUE,
  tipo text NOT NULL DEFAULT 'digital' CHECK (tipo IN ('digital', 'imagem')),
  nome text NOT NULL DEFAULT '',
  conselho text NOT NULL DEFAULT '',
  numero_registro text NOT NULL DEFAULT '',
  uf text NOT NULL DEFAULT '',
  especialidade text NOT NULL DEFAULT '',
  cargo text NOT NULL DEFAULT '',
  imagem_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profissionais_carimbo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read carimbos"
  ON public.profissionais_carimbo FOR SELECT
  TO authenticated
  USING (is_staff_member());

CREATE POLICY "Staff manage own carimbo"
  ON public.profissionais_carimbo FOR ALL
  TO authenticated
  USING (is_staff_member())
  WITH CHECK (is_staff_member());

-- Table: documentos_gerados
CREATE TABLE public.documentos_gerados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id text NOT NULL DEFAULT '',
  paciente_nome text NOT NULL DEFAULT '',
  profissional_id text NOT NULL DEFAULT '',
  profissional_nome text NOT NULL DEFAULT '',
  tipo_documento text NOT NULL DEFAULT '',
  conteudo_original text NOT NULL DEFAULT '',
  conteudo_html text NOT NULL DEFAULT '',
  campos_formulario jsonb NOT NULL DEFAULT '{}'::jsonb,
  hash_assinatura text NOT NULL DEFAULT '',
  ip_assinatura text NOT NULL DEFAULT '',
  assinado_em timestamptz,
  modelo_id text NOT NULL DEFAULT '',
  unidade_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'assinado', 'cancelado')),
  motivo_cancelamento text NOT NULL DEFAULT '',
  cancelado_por text NOT NULL DEFAULT '',
  cancelado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.documentos_gerados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read documentos_gerados"
  ON public.documentos_gerados FOR SELECT
  TO authenticated
  USING (is_staff_member());

CREATE POLICY "Staff insert documentos_gerados"
  ON public.documentos_gerados FOR INSERT
  TO authenticated
  WITH CHECK (is_staff_member());

CREATE POLICY "Staff update documentos_gerados"
  ON public.documentos_gerados FOR UPDATE
  TO authenticated
  USING (is_staff_member())
  WITH CHECK (is_staff_member());

-- Trigger for updated_at
CREATE TRIGGER update_profissionais_carimbo_updated_at
  BEFORE UPDATE ON public.profissionais_carimbo
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

CREATE TRIGGER update_documentos_gerados_updated_at
  BEFORE UPDATE ON public.documentos_gerados
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

-- Storage bucket for stamp images
INSERT INTO storage.buckets (id, name, public) VALUES ('carimbos', 'carimbos', true);

CREATE POLICY "Staff upload carimbos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'carimbos' AND is_staff_member());

CREATE POLICY "Anyone view carimbos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'carimbos');

CREATE POLICY "Staff delete own carimbos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'carimbos' AND is_staff_member());

CREATE POLICY "Staff update carimbos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'carimbos' AND is_staff_member());
