
-- Table for SIGTAP procedures linked to a PTS
CREATE TABLE public.pts_sigtap (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pts_id UUID NOT NULL REFERENCES public.pts(id) ON DELETE CASCADE,
  procedimento_codigo TEXT NOT NULL DEFAULT '',
  procedimento_nome TEXT NOT NULL DEFAULT '',
  especialidade TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for CID codes linked to a PTS
CREATE TABLE public.pts_cid (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pts_id UUID NOT NULL REFERENCES public.pts(id) ON DELETE CASCADE,
  cid_codigo TEXT NOT NULL DEFAULT '',
  cid_descricao TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_pts_sigtap_pts_id ON public.pts_sigtap(pts_id);
CREATE INDEX idx_pts_cid_pts_id ON public.pts_cid(pts_id);

-- RLS
ALTER TABLE public.pts_sigtap ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pts_cid ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read pts_sigtap" ON public.pts_sigtap FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Staff manage pts_sigtap" ON public.pts_sigtap FOR ALL TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());

CREATE POLICY "Staff read pts_cid" ON public.pts_cid FOR SELECT TO authenticated USING (is_staff_member());
CREATE POLICY "Staff manage pts_cid" ON public.pts_cid FOR ALL TO authenticated USING (is_staff_member()) WITH CHECK (is_staff_member());
