-- Create storage bucket for document logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('document-logos', 'document-logos', true, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "Anyone can view document logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'document-logos');

-- Authenticated users can upload
CREATE POLICY "Authenticated users can upload document logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'document-logos');

-- Authenticated users can update
CREATE POLICY "Authenticated users can update document logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'document-logos');

-- Authenticated users can delete
CREATE POLICY "Authenticated users can delete document logos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'document-logos');