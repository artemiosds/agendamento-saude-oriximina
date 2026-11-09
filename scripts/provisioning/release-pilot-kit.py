"""Release one reviewed candidate exclusively for the authorized Cloud pilot.
Creates local SQL only. No connection string, API request or production release.
"""
import hashlib
import json
import sys
from pathlib import Path

PILOT_PROJECT = 'b45b5fc2-4ab6-4383-bd72-693800aae0db'
STRUCTURE_SHA256 = 'a40521002020b117e9e64af9cfce8e70801ef1189a465535776936f959050304'
STRUCTURE = '01-estrutura-CANDIDATO-BLOQUEADO.sql'
FILES = {STRUCTURE, '02-politicas-arquivos-CANDIDATO-BLOQUEADO.sql', 'buckets-a-criar.json'}
REQUIRED_EXTENSIONS = {'moddatetime','pg_trgm','pgcrypto','unaccent','uuid-ossp'}
GUARD = "DO $guard$ BEGIN RAISE EXCEPTION 'Instalação bloqueada: homologação em ambiente isolado pendente'; END $guard$;"

def validate_preflight(preflight):
    if preflight.get('project_id') != PILOT_PROJECT:
        raise ValueError('Only the explicitly authorized pilot can receive this release')
    if preflight.get('provider') != 'lovable_cloud' or preflight.get('purpose') != 'homologacao':
        raise ValueError('Only Lovable Cloud homologation is authorized')
    if type(preflight.get('public_relations')) is not int or preflight['public_relations'] != 0:
        raise ValueError('Pilot target must be empty')
    if preflight.get('auth_users') is not True or preflight.get('storage_objects') is not True:
        raise ValueError('Managed Auth and Storage prerequisites are missing')
    if not REQUIRED_EXTENSIONS.issubset(set(preflight.get('available_extensions',[]))):
        raise ValueError('Required extensions are unavailable')

def release(candidate, preflight, output):
    validate_preflight(preflight)
    candidate,output=Path(candidate),Path(output)
    if candidate.resolve() == output.resolve() or (output.exists() and any(output.iterdir())):
        raise ValueError('Release output must be separate and empty')
    manifest=json.loads((candidate/'manifesto.json').read_text())
    hashes=manifest.get('sha256',{})
    if set(hashes) != FILES or hashes.get(STRUCTURE) != STRUCTURE_SHA256:
        raise ValueError('Candidate is not the structurally accepted snapshot')
    for name,digest in hashes.items():
        if hashlib.sha256((candidate/name).read_bytes()).hexdigest() != digest:
            raise ValueError('Candidate digest mismatch: '+name)
    sql=(candidate/STRUCTURE).read_text()
    if sql.count(GUARD) != 1 or "Destino não vazio: instalação recusada" not in sql:
        raise ValueError('Expected candidate barriers are missing')
    released=sql.replace(GUARD,'-- Authorized for Cloud pilot '+PILOT_PROJECT+' only; empty-target guard preserved.')
    released='-- PILOT ONLY. NOT A GENERAL INSTALLER RELEASE.\n'+released
    output.mkdir(parents=True,exist_ok=True)
    payload=released.encode('utf-8')
    (output/'01-estrutura-PILOTO.sql').write_bytes(payload)
    evidence={'project_id':PILOT_PROJECT,'scope':'pilot_structure_only','source_sha256':STRUCTURE_SHA256,
      'released_sha256':hashlib.sha256(payload).hexdigest(),'empty_guard_preserved':True,
      'storage_policies_released':False,'production_release':False}
    (output/'release.json').write_bytes(json.dumps(evidence,ensure_ascii=False,indent=2).encode('utf-8'))
    return evidence

def main():
    if len(sys.argv)!=4:
        raise SystemExit('Usage: release-pilot-kit.py CANDIDATE PREFLIGHT_JSON EMPTY_OUTPUT')
    print(json.dumps(release(sys.argv[1],json.loads(Path(sys.argv[2]).read_text()),sys.argv[3])))
if __name__=='__main__':
    main()
