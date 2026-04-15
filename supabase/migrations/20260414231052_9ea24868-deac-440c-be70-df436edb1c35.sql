
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS is_gestante boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pne boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_autista boolean NOT NULL DEFAULT false;
