-- Read-only aggregate for the global Master. No object names or patient data leave the database.
CREATE OR REPLACE FUNCTION public.get_system_monitoring_usage()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_buckets jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.funcionarios AS f
    WHERE f.auth_user_id = auth.uid()
      AND f.usuario = 'admin.sms'
      AND lower(trim(f.role)) = 'master'
      AND f.ativo IS TRUE
  ) THEN
    RAISE EXCEPTION 'Acesso restrito ao Master Global' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'name', b.id,
    'file_count', coalesce(s.file_count, 0),
    'used_bytes', coalesce(s.used_bytes, 0),
    'unknown_size_count', coalesce(s.unknown_size_count, 0)
  ) ORDER BY b.id), '[]'::jsonb)
  INTO v_buckets
  FROM storage.buckets AS b
  LEFT JOIN (
    SELECT o.bucket_id,
           count(*) AS file_count,
           coalesce(sum(CASE WHEN o.metadata->>'size' ~ '^[0-9]+$'
             THEN (o.metadata->>'size')::bigint ELSE 0 END), 0) AS used_bytes,
           count(*) FILTER (WHERE o.metadata->>'size' IS NULL
             OR o.metadata->>'size' !~ '^[0-9]+$') AS unknown_size_count
    FROM storage.objects AS o
    GROUP BY o.bucket_id
  ) AS s ON s.bucket_id = b.id;

  RETURN jsonb_build_object(
    'checked_at', now(),
    'database_bytes', pg_database_size(current_database()),
    'buckets', v_buckets
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_system_monitoring_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_system_monitoring_usage() TO authenticated;
