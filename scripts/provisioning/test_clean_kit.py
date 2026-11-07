import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('kit', Path(__file__).with_name('build-clean-kit.py'))
if spec is None or spec.loader is None:
    raise RuntimeError('Cannot load kit builder')
kit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kit)

class CleanDefaultsTest(unittest.TestCase):
    def test_integration_secret_default_is_not_copied(self):
        self.assertEqual(kit.clean_default({'name':'evolution_api_key','type':'text','default':"'credential-test'::text"}), "''::text")

    def test_existing_tenant_url_is_not_copied(self):
        self.assertEqual(kit.clean_default({'name':'url_base','type':'text','default':"'https://old-tenant.invalid'::text"}), "''::text")

    def test_neutral_clinical_default_is_preserved(self):
        self.assertEqual(kit.clean_default({'name':'status','type':'text','default':"'rascunho'::text"}), "'rascunho'::text")

if __name__ == '__main__':
    unittest.main()