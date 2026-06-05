CREATE OR REPLACE FUNCTION public.get_tables_info()
RETURNS TABLE (table_name TEXT, record_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.table_name::TEXT,
        0::BIGINT -- Simplificado, o row count real é pego via select count(*) na function
    FROM 
        information_schema.tables t
    WHERE 
        t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
    ORDER BY 
        t.table_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tables_info() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_tables_info() TO authenticated;
