-- Preserve referral-specific observations from the Novo Encaminhamento form.
ALTER TABLE public.patient_referrals
  ADD COLUMN IF NOT EXISTS observacoes text;

COMMENT ON COLUMN public.patient_referrals.observacoes
  IS 'Observações específicas deste encaminhamento.';
