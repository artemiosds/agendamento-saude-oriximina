CREATE OR REPLACE FUNCTION public.search_patients(
    p_search text,
    p_unit_id uuid DEFAULT NULL,
    p_limit integer DEFAULT 10
)
 RETURNS SETOF public.pacientes
 LANGUAGE plpgsql
 STABLE
AS $function$
 DECLARE
   v_search_digits text;
 BEGIN
   v_search_digits := regexp_replace(p_search, '\D', '', 'g');

   RETURN QUERY
   SELECT *
   FROM pacientes
   WHERE
     (p_unit_id IS NULL OR unit_id = p_unit_id)
     AND (
       unaccent(nome) ILIKE '%' || unaccent(p_search) || '%' OR 
       (v_search_digits <> '' AND cpf ILIKE '%' || v_search_digits || '%') OR 
       (v_search_digits <> '' AND cns ILIKE '%' || v_search_digits || '%') OR 
       (v_search_digits <> '' AND telefone ILIKE '%' || v_search_digits || '%')
     )
   ORDER BY nome ASC
   LIMIT p_limit;
 END;
$function$;