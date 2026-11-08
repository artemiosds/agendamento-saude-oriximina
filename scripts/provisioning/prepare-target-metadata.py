"""Prepare a local, hardened schema candidate. Never connects to any database."""
import copy
import hashlib
import json
import re
import sys
from pathlib import Path

REVIEWED_MAPPING_FUNCTIONS = {
 'confirm_profession_careness_mapping': '3e3153556f53bfa233c722901be8c46887e9916be28e46e8dc22636e5461dfed',
 'list_profession_careness_setup': '9f3b497a04f48b67f98fd739ba4d69c9a17b559a8f678d58a2e5d08bda6f1591',
 'profession_careness_mapping_is_current': 'bdbad0cd05effcacf5ecb6b79bbb7f36f3e45ebffdb0c032744681b356a91250',
 'save_profession_careness_rule': '3872e2fc5ef03d2c502ab9397f2eec36f6e3a209c1e631948dba9bdfeb8e041d',
}
def prepare(data):
    result = copy.deepcopy(data)
    changes = []
    for table in result['tables']:
        if table['rls']:
            continue
        if table['name'] != 'profession_careness_mapping_state':
            raise ValueError('Unreviewed table without RLS: ' + table['name'])
        if any(g['table_name'] == table['name'] and g['grantee'] in ('PUBLIC','anon','authenticated')
               for g in result['table_grants']):
            raise ValueError('Internal mapping table has unexpected direct grants')
        for name, expected in REVIEWED_MAPPING_FUNCTIONS.items():
            functions = [f for f in result['functions'] if f['name'] == name]
            if len(functions) != 1 or hashlib.sha256(functions[0]['definition'].encode()).hexdigest() != expected:
                raise ValueError('Mapping function changed; new review required: ' + name)
        table['rls'] = True
        changes.append({'kind':'enable_target_rls','table':table['name']})
    privileged = {(f['name'], f['arguments']) for f in result['functions']
                  if re.search(r'\bSECURITY\s+DEFINER\b', f['definition'], re.I)}
    original = result['function_grants']
    result['function_grants'] = [g for g in original if not (
        (g['name'],g['arguments']) in privileged and g['grantee'] in ('PUBLIC','anon'))]
    changes.append({'kind':'remove_public_definer_grants','count':len(original)-len(result['function_grants'])})
    original = result['table_grants']
    result['table_grants'] = [g for g in original if not (
        g['grantee'] in ('anon','authenticated') and g['privilege_type'] in ('TRUNCATE','TRIGGER'))]
    changes.append({'kind':'remove_non_row_privileges','count':len(original)-len(result['table_grants'])})

    # Restrictive policy composes with every existing permissive policy.
    # Staff are scoped to their unit; patient/external access keeps existing ownership rules.
    scope = """(
      public.is_global_owner()
      OR EXISTS (SELECT 1 FROM public.funcionarios f
        WHERE f.auth_user_id=auth.uid() AND f.ativo IS TRUE
        AND f.unidade_id=agendamentos.unidade_id)
      OR EXISTS (SELECT 1 FROM public.pacientes p
        WHERE p.auth_user_id=auth.uid() AND p.id=agendamentos.paciente_id)
      OR EXISTS (SELECT 1 FROM public.profissionais_externos e
        WHERE e.auth_user_id=auth.uid() AND e.ativo IS TRUE
        AND e.id::text=agendamentos.criado_por)
    )"""
    name = 'tenant_unit_scope_agendamentos_v1'
    if any(p['policyname'] == name and p['tablename'] == 'agendamentos' for p in result['policies']):
        raise ValueError('Target unit policy already exists; review the input')
    result['policies'].append({
      'schemaname':'public', 'tablename':'agendamentos', 'policyname':name,
      'permissive':'RESTRICTIVE', 'roles':['authenticated'], 'cmd':'ALL',
      'qual':scope, 'with_check':scope,
    })
    changes.append({'kind':'restrict_target_appointment_unit_scope','policy':name})

    return result, changes

def main():
    if len(sys.argv) != 3:
        raise SystemExit('Usage: prepare-target-metadata.py SOURCE_METADATA EMPTY_OUTPUT')
    source, output = map(Path,sys.argv[1:])
    if output.resolve() == source.resolve() or (output.exists() and any(output.iterdir())):
        raise ValueError('Output must be separate and empty')
    data = {p.stem:json.loads(p.read_text()) for p in source.glob('*.json')}
    prepared, changes = prepare(data)
    output.mkdir(parents=True, exist_ok=True)
    for name, rows in prepared.items():
        (output/(name+'.json')).write_text(json.dumps(rows,ensure_ascii=False,indent=2))
    # Report stays outside the inventory accepted by the builder.
    print(json.dumps({'status':'candidate_only','changes':changes},ensure_ascii=False))
if __name__ == '__main__':
    main()
