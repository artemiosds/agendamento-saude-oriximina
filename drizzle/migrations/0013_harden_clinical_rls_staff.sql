-- paciente_profissional_status
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.paciente_profissional_status;
CREATE POLICY "Staff read paciente_profissional_status" ON public.paciente_profissional_status FOR SELECT TO authenticated USING (public.is_staff_member());

-- patient_documents (SELECT existente mantido)
DROP POLICY IF EXISTS "Users can insert patient documents" ON public.patient_documents;
DROP POLICY IF EXISTS "Users can update their own unit patient documents" ON public.patient_documents;
CREATE POLICY "Staff insert patient documents" ON public.patient_documents FOR INSERT TO authenticated WITH CHECK (public.is_staff_member());
CREATE POLICY "Staff update patient documents" ON public.patient_documents FOR UPDATE TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());

-- patient_procedures
DROP POLICY IF EXISTS "Users can delete patient procedures" ON public.patient_procedures;
DROP POLICY IF EXISTS "Users can insert patient procedures" ON public.patient_procedures;
DROP POLICY IF EXISTS "Users can update patient procedures" ON public.patient_procedures;
DROP POLICY IF EXISTS "Users can view all patient procedures" ON public.patient_procedures;
CREATE POLICY "Staff manage patient procedures" ON public.patient_procedures FOR ALL TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());

-- patient_referrals
DROP POLICY IF EXISTS "Referrals are viewable by authenticated users" ON public.patient_referrals;
DROP POLICY IF EXISTS "Referrals can be deleted by authenticated users" ON public.patient_referrals;
DROP POLICY IF EXISTS "Referrals can be inserted by authenticated users" ON public.patient_referrals;
DROP POLICY IF EXISTS "Referrals can be updated by authenticated users" ON public.patient_referrals;
CREATE POLICY "Staff manage patient referrals" ON public.patient_referrals FOR ALL TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());

-- referral_attachments
DROP POLICY IF EXISTS "Referral attachments are viewable by authenticated users" ON public.referral_attachments;
DROP POLICY IF EXISTS "Referral attachments can be deleted by authenticated users" ON public.referral_attachments;
DROP POLICY IF EXISTS "Referral attachments can be inserted by authenticated users" ON public.referral_attachments;
CREATE POLICY "Staff manage referral attachments" ON public.referral_attachments FOR ALL TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());

-- procedimentos_realizados
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.procedimentos_realizados;
CREATE POLICY "Staff manage procedimentos realizados" ON public.procedimentos_realizados FOR ALL TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());

-- pts_metas
DROP POLICY IF EXISTS "Users can manage metas for accessible PTS" ON public.pts_metas;
DROP POLICY IF EXISTS "Users can manage metas for their PTS" ON public.pts_metas;
DROP POLICY IF EXISTS "Users can view metas for accessible PTS" ON public.pts_metas;
CREATE POLICY "Staff manage pts metas" ON public.pts_metas FOR ALL TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());

-- storage: arquivos de pacientes
DROP POLICY IF EXISTS "Allow authenticated users to upload patient documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to view patient documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete patient documents" ON storage.objects;
CREATE POLICY "Staff read patient-documents" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'patient-documents' AND public.is_staff_member());
CREATE POLICY "Staff upload patient-documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'patient-documents' AND public.is_staff_member());
CREATE POLICY "Staff delete patient-documents" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'patient-documents' AND public.is_staff_member());

DROP POLICY IF EXISTS "Referral attachments are accessible by authenticated users" ON storage.objects;
DROP POLICY IF EXISTS "Referral attachments can be uploaded by authenticated users" ON storage.objects;
DROP POLICY IF EXISTS "Referral attachments can be deleted by authenticated users" ON storage.objects;
CREATE POLICY "Staff read referral-attachments" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'referral-attachments' AND public.is_staff_member());
CREATE POLICY "Staff upload referral-attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'referral-attachments' AND public.is_staff_member());
CREATE POLICY "Staff delete referral-attachments" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'referral-attachments' AND public.is_staff_member());

-- logos: leitura aberta mantida; escrita só equipe
DROP POLICY IF EXISTS "Authenticated users can upload document logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update document logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete document logos" ON storage.objects;
CREATE POLICY "Staff upload document-logos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'document-logos' AND public.is_staff_member());
CREATE POLICY "Staff update document-logos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'document-logos' AND public.is_staff_member());
CREATE POLICY "Staff delete document-logos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'document-logos' AND public.is_staff_member());