-- Políticas de arquivos: candidato bloqueado. Buckets devem ser criados pela API no destino.

BEGIN;

DO $guard$ BEGIN RAISE EXCEPTION 'Políticas bloqueadas: revisão e buckets do destino pendentes'; END $guard$;

CREATE POLICY "Allow authenticated users to delete patient documents" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((bucket_id = 'patient-documents'::text));

CREATE POLICY "Allow authenticated users to upload patient documents" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((bucket_id = 'patient-documents'::text));

CREATE POLICY "Allow authenticated users to view patient documents" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((bucket_id = 'patient-documents'::text));

CREATE POLICY "Anyone can view document logos" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = 'document-logos'::text));

CREATE POLICY "Anyone view carimbos" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = 'carimbos'::text));

CREATE POLICY "Authenticated users can delete document logos" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((bucket_id = 'document-logos'::text));

CREATE POLICY "Authenticated users can update document logos" ON "storage"."objects" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((bucket_id = 'document-logos'::text));

CREATE POLICY "Authenticated users can upload document logos" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((bucket_id = 'document-logos'::text));

CREATE POLICY "Referral attachments are accessible by authenticated users" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = 'referral-attachments'::text));

CREATE POLICY "Referral attachments can be deleted by authenticated users" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((bucket_id = 'referral-attachments'::text));

CREATE POLICY "Referral attachments can be uploaded by authenticated users" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((bucket_id = 'referral-attachments'::text));

CREATE POLICY "Staff can delete encaminhamentos" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((bucket_id = 'encaminhamentos'::text) AND is_staff_member()));

CREATE POLICY "Staff can read encaminhamentos" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((bucket_id = 'encaminhamentos'::text) AND is_staff_member()));

CREATE POLICY "Staff can update encaminhamentos" ON "storage"."objects" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((bucket_id = 'encaminhamentos'::text) AND is_staff_member())) WITH CHECK (((bucket_id = 'encaminhamentos'::text) AND is_staff_member()));

CREATE POLICY "Staff can upload encaminhamentos" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'encaminhamentos'::text) AND is_staff_member()));

CREATE POLICY "Staff delete own carimbos" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((bucket_id = 'carimbos'::text) AND is_staff_member()));

CREATE POLICY "Staff delete sms files" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((bucket_id = 'sms'::text) AND is_staff_member()));

CREATE POLICY "Staff read sms files" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((bucket_id = 'sms'::text) AND is_staff_member()));

CREATE POLICY "Staff update carimbos" ON "storage"."objects" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((bucket_id = 'carimbos'::text) AND is_staff_member()));

CREATE POLICY "Staff update sms files" ON "storage"."objects" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((bucket_id = 'sms'::text) AND is_staff_member())) WITH CHECK (((bucket_id = 'sms'::text) AND is_staff_member()));

CREATE POLICY "Staff upload carimbos" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'carimbos'::text) AND is_staff_member()));

CREATE POLICY "Staff upload sms files" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'sms'::text) AND is_staff_member()));

CREATE POLICY "painel_videos_public_read" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = 'painel-videos'::text));

CREATE POLICY "painel_videos_staff_insert" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'painel-videos'::text) AND is_staff_member()));

CREATE POLICY "painel_videos_staff_update" ON "storage"."objects" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((bucket_id = 'painel-videos'::text) AND is_staff_member()));

COMMIT;