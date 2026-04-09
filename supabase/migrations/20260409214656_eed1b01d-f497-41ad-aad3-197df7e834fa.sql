
-- Create encaminhamentos storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('encaminhamentos', 'encaminhamentos', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for the bucket
CREATE POLICY "Staff can read encaminhamentos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'encaminhamentos' AND public.is_staff_member());

CREATE POLICY "Staff can upload encaminhamentos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'encaminhamentos' AND public.is_staff_member());

CREATE POLICY "Staff can update encaminhamentos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'encaminhamentos' AND public.is_staff_member())
WITH CHECK (bucket_id = 'encaminhamentos' AND public.is_staff_member());

CREATE POLICY "Staff can delete encaminhamentos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'encaminhamentos' AND public.is_staff_member());
