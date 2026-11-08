"""Capture application schema metadata only through the read-only Lovable CLI.

Never query application rows, auth accounts, storage objects, secrets or cron jobs.
Output is an intermediate review artifact, NOT an automatically applied migration.
"""
import json
import subprocess
import sys
from pathlib import Path

QUERIES = {
    'tables': """SELECT c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls,
      (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
       'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,
       'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
       FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
       WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname""",
    'constraints': """SELECT c.relname AS table_name, co.conname AS name, co.contype AS type,
      pg_get_constraintdef(co.oid,true) AS definition, co.convalidated AS validated
      FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' ORDER BY CASE WHEN co.contype='f' THEN 1 ELSE 0 END,c.relname,co.conname""",
    'indexes': """SELECT c.relname AS table_name, i.relname AS name, pg_get_indexdef(i.oid) AS definition
      FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
      AND NOT EXISTS(SELECT 1 FROM pg_constraint co WHERE co.conindid=i.oid)
      ORDER BY c.relname,i.relname""",
    'functions': """SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS arguments,
      pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prokind IN ('f','p')
      AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
      ORDER BY p.proname,arguments""",
    'function_grants': """SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS arguments,
      CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE r.rolname END AS grantee,a.privilege_type
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE n.nspname='public'
      AND (a.grantee=0 OR r.rolname IN ('anon','authenticated','service_role'))
      AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
      ORDER BY p.proname,arguments,grantee""",
    'triggers': """SELECT n.nspname AS schema_name,c.relname AS table_name,t.tgname AS name,
      pg_get_triggerdef(t.oid,true) AS definition,t.tgenabled AS enabled
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace
      WHERE NOT t.tgisinternal AND (n.nspname='public' OR (n.nspname='auth' AND c.relname='users' AND pn.nspname='public'))
      ORDER BY n.nspname,c.relname,t.tgname""",
    'policies': """SELECT schemaname,tablename,policyname,permissive,to_jsonb(roles) AS roles,cmd,qual,with_check
      FROM pg_policies WHERE schemaname='public' OR (schemaname='storage' AND tablename='objects')
      ORDER BY schemaname,tablename,policyname""",
    'table_grants': """SELECT c.relname AS table_name,r.rolname AS grantee,a.privilege_type
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      JOIN pg_roles r ON r.oid=a.grantee WHERE n.nspname='public' AND c.relkind IN ('r','v','m')
      AND r.rolname IN ('anon','authenticated','service_role') ORDER BY c.relname,r.rolname,a.privilege_type""",
    'enums': """SELECT t.typname AS name,jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
      FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid
      WHERE n.nspname='public' GROUP BY t.typname ORDER BY t.typname""",
    'sequences': """SELECT sequencename,start_value,min_value,max_value,increment_by,cycle,cache_size
      FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename""",
    'extensions': """SELECT e.extname AS name,n.nspname AS schema_name,e.extversion AS version
      FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY e.extname""",
    'views': """SELECT c.relname AS name,c.relkind AS kind,pg_get_viewdef(c.oid,true) AS definition,c.reloptions
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('v','m') ORDER BY c.relname""",
    'buckets': """SELECT id,name,public,file_size_limit,allowed_mime_types FROM storage.buckets ORDER BY id""",
}

def capture(output: Path):
    output.mkdir(parents=True, exist_ok=True)
    for name, query in QUERIES.items():
        result = subprocess.run(['lovable', 'supabase', 'query', query, '--json'],
                                capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        if not isinstance(data, dict) or not isinstance(data.get('rows'), list):
            raise ValueError(f'Unexpected metadata response: {name}')
        (output / f'{name}.json').write_text(json.dumps(data['rows'], ensure_ascii=False, indent=2))
        print(f'{name}: {len(data["rows"])} metadata entries')

if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: capture-schema.py /tmp/review-metadata')
    capture(Path(sys.argv[1]))