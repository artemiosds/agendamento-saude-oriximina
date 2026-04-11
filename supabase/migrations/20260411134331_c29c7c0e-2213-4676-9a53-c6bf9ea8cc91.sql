
-- Table to log SIGTAP sync history
CREATE TABLE IF NOT EXISTS public.pts_import_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'sync_datasus_automatico',
  especialidade text NOT NULL DEFAULT 'todas',
  total_procedimentos integer NOT NULL DEFAULT 0,
  total_cids integer NOT NULL DEFAULT 0,
  competencia text NOT NULL DEFAULT '',
  detalhes jsonb NOT NULL DEFAULT '[]'::jsonb,
  importado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pts_import_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read pts_import_log"
  ON public.pts_import_log FOR SELECT
  TO authenticated
  USING (is_staff_member());

CREATE POLICY "Staff insert pts_import_log"
  ON public.pts_import_log FOR INSERT
  TO authenticated
  WITH CHECK (is_staff_member());

-- Add unique constraint on sigtap_procedimento_cids for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sigtap_procedimento_cids_proc_cid_unique'
  ) THEN
    ALTER TABLE public.sigtap_procedimento_cids
      ADD CONSTRAINT sigtap_procedimento_cids_proc_cid_unique
      UNIQUE (procedimento_codigo, cid_codigo);
  END IF;
END $$;
