-- WhatsApp templates per unit
CREATE TABLE public.whatsapp_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unidade_id TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'confirmacao',
  mensagem TEXT NOT NULL DEFAULT '',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(unidade_id, tipo)
);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master manage whatsapp_templates"
  ON public.whatsapp_templates FOR ALL
  TO authenticated
  USING (has_staff_role('master'))
  WITH CHECK (has_staff_role('master'));

CREATE POLICY "Staff read whatsapp_templates"
  ON public.whatsapp_templates FOR SELECT
  TO authenticated
  USING (is_staff_member());

CREATE TRIGGER update_whatsapp_templates_updated_at
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();