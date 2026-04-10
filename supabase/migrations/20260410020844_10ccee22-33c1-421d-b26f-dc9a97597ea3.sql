
-- Table: sigtap_procedimentos
CREATE TABLE public.sigtap_procedimentos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  especialidade text NOT NULL DEFAULT '',
  total_cids integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sigtap_procedimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read sigtap_procedimentos" ON public.sigtap_procedimentos
  FOR SELECT TO authenticated USING (is_staff_member());

CREATE POLICY "Master manage sigtap_procedimentos" ON public.sigtap_procedimentos
  FOR ALL TO authenticated
  USING (has_staff_role('master'))
  WITH CHECK (has_staff_role('master'));

-- Table: sigtap_procedimento_cids
CREATE TABLE public.sigtap_procedimento_cids (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  procedimento_codigo text NOT NULL REFERENCES public.sigtap_procedimentos(codigo) ON DELETE CASCADE,
  cid_codigo text NOT NULL,
  cid_descricao text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sigtap_proc_cids_codigo ON public.sigtap_procedimento_cids(procedimento_codigo);
CREATE INDEX idx_sigtap_proc_cids_cid ON public.sigtap_procedimento_cids(cid_codigo);
CREATE UNIQUE INDEX idx_sigtap_proc_cid_unique ON public.sigtap_procedimento_cids(procedimento_codigo, cid_codigo);

ALTER TABLE public.sigtap_procedimento_cids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read sigtap_procedimento_cids" ON public.sigtap_procedimento_cids
  FOR SELECT TO authenticated USING (is_staff_member());

CREATE POLICY "Master manage sigtap_procedimento_cids" ON public.sigtap_procedimento_cids
  FOR ALL TO authenticated
  USING (has_staff_role('master'))
  WITH CHECK (has_staff_role('master'));

-- Table: cid10_codigos
CREATE TABLE public.cid10_codigos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo text NOT NULL,
  descricao text NOT NULL DEFAULT '',
  especialidade text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_cid10_codigo_esp ON public.cid10_codigos(codigo, especialidade);
CREATE INDEX idx_cid10_especialidade ON public.cid10_codigos(especialidade);

ALTER TABLE public.cid10_codigos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read cid10_codigos" ON public.cid10_codigos
  FOR SELECT TO authenticated USING (is_staff_member());

CREATE POLICY "Master manage cid10_codigos" ON public.cid10_codigos
  FOR ALL TO authenticated
  USING (has_staff_role('master'))
  WITH CHECK (has_staff_role('master'));
