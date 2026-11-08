"""Build a non-executable, review-only schema kit from metadata (no tenant rows)."""
import hashlib
import json
import re
import sys
from pathlib import Path

def quote(value):
    return '"' + value.replace('"', '""') + '"'

def literal(value):
    return "'" + value.replace("'", "''") + "'"

def clean_default(column):
    value = column.get('default')
    if not value:
        return value
    if re.search(r'(api.?key|token|secret|senha|password|url)', column['name'], re.I):
        return "''::text" if column['type'] in ('text', 'character varying') else None
    if re.search(r'https?://|eyJ[a-zA-Z0-9_-]+\.|oriximin', value, re.I):
        return None
    return value

TENANT_REFERENCE_PATTERNS = (
    ('tenant_oriximina', re.compile(r'or[ií]ximin|sms-oriximina|gestao-saude-sms-oriximina|agendamento-saude-oriximina', re.I)),
    ('source_supabase_project', re.compile(r'ygbgywglxsshkkoiriul', re.I)),
    ('tenant_domain', re.compile(r'(?:oriximina\.pa\.gov\.br|gestao-saude-sms-oriximina\.vercel\.app)', re.I)),
)
SECRET_PATTERNS = (
    ('supabase_secret_key', re.compile(r'\bsb_secret_[A-Za-z0-9_-]{12,}', re.I)),
    ('jwt_or_service_token', re.compile(r'\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.', re.I)),
    ('private_key', re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', re.I)),
    ('credential_assignment', re.compile(r'''(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|senha)\s*[:=]\s*["'][^"']{8,}["']''', re.I)),
)

def _walk_strings(value, location='metadata'):
    if isinstance(value, dict):
        for key, child in value.items():
            yield from _walk_strings(key, f'{location}.<key>')
            yield from _walk_strings(child, f'{location}.{key}')
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _walk_strings(child, f'{location}[{index}]')
    elif isinstance(value, str):
        yield location, value


def assert_public_tables_have_rls(data):
    """Fail closed: never prepare a tenant schema with an unprotected public table."""
    unsafe = [
        table.get('name', '<unnamed>')
        for table in data.get('tables', [])
        if table.get('rls') is not True
    ]
    if unsafe:
        preview = ', '.join(unsafe[:20])
        remainder = f', and {len(unsafe) - 20} more' if len(unsafe) > 20 else ''
        raise ValueError(
            'Clean-install kit blocked: public tables without confirmed RLS: '
            + preview + remainder
        )
    return {'status': 'passed', 'tables_checked': len(data.get('tables', []))}

def assert_source_is_tenant_neutral(data):
    """Reject tenant-specific references and credentials across every copied schema surface."""
    prepared = json.loads(json.dumps(data))
    # Values that are safe to neutralize only when they are column defaults.
    for table in prepared.get('tables', []):
        for column in table.get('columns', []):
            column['default'] = clean_default(column)

    findings = []
    for location, value in _walk_strings(prepared):
        for label, pattern in TENANT_REFERENCE_PATTERNS + SECRET_PATTERNS:
            if pattern.search(value):
                findings.append(f'{label} at {location}')
        if re.search(r'https?://[^\s\'"]+', value, re.I):
            findings.append(f'hardcoded_url at {location}')
    if findings:
        preview = '; '.join(findings[:20])
        remainder = f'; and {len(findings) - 20} more' if len(findings) > 20 else ''
        raise ValueError(
            'Clean-install kit blocked: tenant-specific values or credentials must be externalized first: '
            + preview + remainder
        )
    return {'status': 'passed', 'scanned_surfaces': sorted(data.keys())}

def build(metadata: Path, destination: Path):
    destination.mkdir(parents=True, exist_ok=True)
    data = {p.stem: json.loads(p.read_text()) for p in metadata.glob('*.json')}
    security = assert_public_tables_have_rls(data)\n    neutrality = assert_source_is_tenant_neutral(data)
    if data['sequences']:
        raise ValueError('Sequence dependencies require manual review')
    sql = [
        '-- CANDIDATO PARA HOMOLOGAÇÃO. NÃO É UM INSTALADOR APROVADO.',
        '-- Nenhum registro de paciente, usuário, contrato ou catálogo é incluído.',
        'BEGIN;',
        "DO $guard$ BEGIN RAISE EXCEPTION 'Instalação bloqueada: homologação em ambiente isolado pendente'; END $guard$;",
        # A second independent gate remains useful even after a reviewed release removes the first.
        "DO $empty$ BEGIN IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','v','m')) THEN RAISE EXCEPTION 'Destino não vazio: instalação recusada'; END IF; END $empty$;",
        'SET LOCAL check_function_bodies = false;',
    ]
    for extension in data['extensions']:
        if extension['name'] in ('pg_trgm', 'unaccent', 'pgcrypto', 'uuid-ossp', 'moddatetime'):
            sql.append(f"CREATE EXTENSION IF NOT EXISTS {quote(extension['name'])} WITH SCHEMA {quote(extension['schema_name'])};")
    for enum in data['enums']:
        sql.append(f"CREATE TYPE public.{quote(enum['name'])} AS ENUM ({', '.join(map(literal,enum['labels']))});")
    sanitized = []
    for table in data['tables']:
        name = table['name']
        columns = []
        for c in table['columns']:
            default = clean_default(c)
            if default != c.get('default'):
                sanitized.append(f"{name}.{c['name']}")
            part = f"{quote(c['name'])} {c['type']}"
            if c['identity'] or c['generated']:
                raise ValueError('Generated columns require explicit review')
            if default is not None:
                part += f' DEFAULT {default}'
            if c['not_null']:
                part += ' NOT NULL'
            columns.append(part)
        sql.append(f"CREATE TABLE public.{quote(name)} (\n  " + ',\n  '.join(columns) + '\n);')
        grants = [g for g in data['table_grants'] if g['table_name'] == name]
        if not grants:
            raise ValueError(f'Missing source grants: {name}')
        for role in ('anon', 'authenticated', 'service_role'):
            privileges = sorted({g['privilege_type'] for g in grants if g['grantee'] == role})
            if privileges:
                sql.append(f"GRANT {', '.join(privileges)} ON TABLE public.{quote(name)} TO {quote(role)};")
        sql.append(f"ALTER TABLE public.{quote(name)} {'ENABLE' if table['rls'] else 'DISABLE'} ROW LEVEL SECURITY;")
        if table['force_rls']:
            sql.append(f'ALTER TABLE public.{quote(name)} FORCE ROW LEVEL SECURITY;')
    for f in data['functions']:
        if re.search(r'https?://|eyJ[a-zA-Z0-9_-]+\.|oriximin', f['definition'], re.I):
            raise ValueError(f'Tenant-specific function requires review: {f["name"]}')
        sql.append(f['definition'].rstrip(';') + ';')
        signature = f"public.{quote(f['name'])}({f['arguments']})"
        sql.append(f'REVOKE ALL ON FUNCTION {signature} FROM PUBLIC, anon, authenticated, service_role;')
        for g in data['function_grants']:
            if (g['name'],g['arguments']) == (f['name'],f['arguments']):
                role = 'PUBLIC' if g['grantee'] == 'PUBLIC' else quote(g['grantee'])
                sql.append(f"GRANT {g['privilege_type']} ON FUNCTION {signature} TO {role};")
    for c in data['constraints']:
        # Constraint triggers are emitted once from pg_get_triggerdef, not ALTER TABLE.
        if c['type'] == 't':
            continue
        sql.append(f"ALTER TABLE public.{quote(c['table_name'])} ADD CONSTRAINT {quote(c['name'])} {c['definition']};")
    sql.extend(x['definition'].rstrip(';') + ';' for x in data['indexes'])
    for v in data['views']:
        if v['kind'] != 'v':
            raise ValueError('Materialized views require review')
        options = ' WITH (' + ', '.join(v['reloptions']) + ')' if v['reloptions'] else ''
        sql.append(f"CREATE VIEW public.{quote(v['name'])}{options} AS {v['definition'].rstrip(';')};")
        for g in data['table_grants']:
            if g['table_name'] == v['name']:
                sql.append(f"GRANT {g['privilege_type']} ON public.{quote(v['name'])} TO {quote(g['grantee'])};")
    storage_sql = ['-- Políticas de arquivos: candidato bloqueado. Buckets devem ser criados pela API no destino.', 'BEGIN;',
        "DO $guard$ BEGIN RAISE EXCEPTION 'Políticas bloqueadas: revisão e buckets do destino pendentes'; END $guard$;"]
    for p in data['policies']:
        statement = f"CREATE POLICY {quote(p['policyname'])} ON {quote(p['schemaname'])}.{quote(p['tablename'])} AS {p['permissive']} FOR {p['cmd']} TO "
        statement += ', '.join('PUBLIC' if role == 'public' else quote(role) for role in p['roles'])
        if p['qual']:
            statement += f" USING ({p['qual']})"
        if p['with_check']:
            statement += f" WITH CHECK ({p['with_check']})"
        (sql if p['schemaname'] == 'public' else storage_sql).append(statement + ';')
    for t in data['triggers']:
        sql.append(t['definition'].rstrip(';') + ';')
        if t['enabled'] != 'O':
            mode = {'D':'DISABLE', 'A':'ENABLE ALWAYS', 'R':'ENABLE REPLICA'}[t['enabled']]
            sql.append(f"ALTER TABLE {quote(t['schema_name'])}.{quote(t['table_name'])} {mode} TRIGGER {quote(t['name'])};")
    sql.append('COMMIT;')
    storage_sql.append('COMMIT;')
    (destination/'01-estrutura-CANDIDATO-BLOQUEADO.sql').write_text('\n\n'.join(sql))
    (destination/'02-politicas-arquivos-CANDIDATO-BLOQUEADO.sql').write_text('\n\n'.join(storage_sql))
    (destination/'buckets-a-criar.json').write_text(json.dumps(data['buckets'],ensure_ascii=False,indent=2))
    inventory = {'status':'bloqueado_aguardando_homologacao', 'captura':'somente metadados; sem linhas de aplicação',
        'quantidades': {key:len(value) for key,value in data.items()}, 'defaults_neutralizados':sanitized, 'neutralidade':neutrality, 'seguranca_rls':security,
        'tabelas_sem_rls':[t['name'] for t in data['tables'] if not t['rls']],
        'pre_requisitos_nao_replicados':['Auth gerenciado', 'Storage gerenciado', 'Realtime gerenciado', 'extensões gerenciadas',
            '29 funções de aplicação: revisar código e configurar serviços próprios', 'catálogos oficiais: importar de fonte oficial',
            'primeiro dono: criar no Auth do destino e vincular funcionário ativo; sem copiar senha',
            'marca pública inicial e logo ainda possuem fallback de Oriximiná', 'limites de usuários e licença entre instalações não homologados'],
        'tabelas':[t['name'] for t in data['tables']],
        'sha256': {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in destination.iterdir() if p.is_file()}}
    (destination/'manifesto.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2))
    return inventory

if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: build-clean-kit.py /tmp/metadata /tmp/clean-kit')
    result = build(Path(sys.argv[1]),Path(sys.argv[2]))
    print(json.dumps({'status':result['status'],'quantidades':result['quantidades'],'defaults_neutralizados':result['defaults_neutralizados']},ensure_ascii=False))