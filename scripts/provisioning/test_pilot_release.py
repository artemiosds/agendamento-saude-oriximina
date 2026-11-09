import importlib.util
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('pilot',Path(__file__).with_name('release-pilot-kit.py'))
pilot=importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)
class PilotReleaseTest(unittest.TestCase):
    def preflight(self):
        return {'project_id':pilot.PILOT_PROJECT,'provider':'lovable_cloud','purpose':'homologacao',
          'public_relations':0,'auth_users':True,'storage_objects':True,
          'available_extensions':sorted(pilot.REQUIRED_EXTENSIONS)}
    def test_valid_pilot_preflight(self):
        pilot.validate_preflight(self.preflight())
    def test_rejects_oriximina_and_every_other_project(self):
        for project in ('b31da743-ec3e-4875-9ddb-7d95bdbcdbae','44d95ab4-7c5b-42f0-b195-0f07c3936a48','other'):
            with self.assertRaises(ValueError):
                pilot.validate_preflight({**self.preflight(),'project_id':project})
    def test_rejects_nonempty_unknown_and_boolean_counts(self):
        for count in (1,None,False,'0'):
            with self.assertRaises(ValueError):
                pilot.validate_preflight({**self.preflight(),'public_relations':count})
    def test_rejects_missing_services_and_extensions(self):
        for changes in ({'auth_users':False},{'storage_objects':False},{'available_extensions':[]},{'provider':'external'}):
            with self.assertRaises(ValueError):
                pilot.validate_preflight({**self.preflight(),**changes})

    def test_lovable_cloud_adapter_replaces_only_reviewed_moddatetime_trigger(self):
        source = """CREATE EXTENSION IF NOT EXISTS "moddatetime" WITH SCHEMA "extensions";
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.atualizado_em = now();
    RETURN NEW;
END;
$function$;
CREATE TRIGGER handle_updated_at_procedimentos BEFORE UPDATE ON procedimentos FOR EACH ROW EXECUTE FUNCTION moddatetime('atualizado_em');
"""
        adapted = pilot.adapt_sql_for_lovable_cloud(source)
        self.assertNotIn('CREATE EXTENSION IF NOT EXISTS "moddatetime"', adapted)
        self.assertNotIn('moddatetime(', adapted)
        self.assertIn('FUNCTION update_updated_at_column()', adapted)
        self.assertIn('NEW.atualizado_em = now();', adapted)

    def test_lovable_cloud_adapter_fails_closed_when_trigger_helper_changes(self):
        source = """CREATE EXTENSION IF NOT EXISTS "moddatetime" WITH SCHEMA "extensions";
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
    RETURN NEW;
END;
$function$;
CREATE TRIGGER handle_updated_at_procedimentos BEFORE UPDATE ON procedimentos FOR EACH ROW EXECUTE FUNCTION moddatetime('atualizado_em');
"""
        with self.assertRaisesRegex(ValueError, 'does not update'):
            pilot.adapt_sql_for_lovable_cloud(source)

    def test_lovable_cloud_adapter_fails_closed_when_trigger_is_ambiguous(self):
        source = """CREATE EXTENSION IF NOT EXISTS "moddatetime" WITH SCHEMA "extensions";
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
    NEW.atualizado_em = now();
    RETURN NEW;
END;
$function$;
CREATE TRIGGER handle_updated_at_procedimentos BEFORE UPDATE ON procedimentos FOR EACH ROW EXECUTE FUNCTION moddatetime('atualizado_em');
CREATE TRIGGER handle_updated_at_procedimentos BEFORE UPDATE ON procedimentos FOR EACH ROW EXECUTE FUNCTION moddatetime('atualizado_em');
"""
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            pilot.adapt_sql_for_lovable_cloud(source)


    def test_release_builds_pilot_sql_with_cloud_adapter_and_empty_guard(self):
        import hashlib
        import json
        import tempfile
        from pathlib import Path

        source_sql = """-- candidate
DO $guard$ BEGIN RAISE EXCEPTION 'Instalação bloqueada: homologação em ambiente isolado pendente'; END $guard$;
DO $empty$ BEGIN IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','v','m')) THEN RAISE EXCEPTION 'Destino não vazio: instalação recusada'; END IF; END $empty$;
CREATE EXTENSION IF NOT EXISTS "moddatetime" WITH SCHEMA "extensions";
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
    NEW.atualizado_em = now();
    RETURN NEW;
END;
$function$;
CREATE TRIGGER handle_updated_at_procedimentos BEFORE UPDATE ON procedimentos FOR EACH ROW EXECUTE FUNCTION moddatetime('atualizado_em');
"""
        policy_sql = "-- policies remain separate"
        buckets = "[]"
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "candidate"
            output = Path(temp) / "release"
            root.mkdir()
            files = {
                pilot.STRUCTURE: source_sql,
                "02-politicas-arquivos-CANDIDATO-BLOQUEADO.sql": policy_sql,
                "buckets-a-criar.json": buckets,
            }
            hashes = {}
            for name, content in files.items():
                payload = content.encode("utf-8")
                (root / name).write_bytes(payload)
                hashes[name] = hashlib.sha256(payload).hexdigest()
            (root / "manifesto.json").write_text(json.dumps({"sha256": hashes}))
            evidence = pilot.release(root, self.preflight(), output)
            released = (output / "01-estrutura-PILOTO.sql").read_text()
            self.assertIn("Destino não vazio: instalação recusada", released)
            self.assertNotIn("Instalação bloqueada: homologação", released)
            self.assertNotIn("moddatetime(", released)
            self.assertIn("FUNCTION update_updated_at_column()", released)
            self.assertTrue(evidence["empty_guard_preserved"])
            self.assertFalse(evidence["storage_policies_released"])
            self.assertFalse(evidence["production_release"])

if __name__=='__main__':
    unittest.main()
