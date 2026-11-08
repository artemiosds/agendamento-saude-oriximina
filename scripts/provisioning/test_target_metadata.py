import importlib.util
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('prepare',Path(__file__).with_name('prepare-target-metadata.py'))
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class TargetMetadataTest(unittest.TestCase):
    def fixture(self):
        return {'tables':[{'name':'agendamentos','rls':True}],
          'functions':[{'name':'privileged','arguments':'','definition':'SECURITY DEFINER'}],
          'function_grants':[{'name':'privileged','arguments':'','grantee':r} for r in ('PUBLIC','anon','authenticated','service_role')],
          'table_grants':[{'table_name':'agendamentos','grantee':'authenticated','privilege_type':'TRUNCATE'}],
          'policies':[]}

    def test_copy_changes_never_mutate_source(self):
        source=self.fixture()
        prepared,changes=module.prepare(source)
        self.assertEqual(len(source['function_grants']),4)
        self.assertEqual(source['policies'],[])
        self.assertEqual({g['grantee'] for g in prepared['function_grants']},{'authenticated','service_role'})
        self.assertEqual(prepared['table_grants'],[])
        self.assertEqual(prepared['policies'][0]['permissive'],'RESTRICTIVE')
        self.assertIn('agendamentos.unidade_id',prepared['policies'][0]['qual'])

    def test_unknown_table_without_rls_is_refused(self):
        source=self.fixture()
        source['tables'].append({'name':'unknown','rls':False})
        with self.assertRaisesRegex(ValueError,'Unreviewed'):
            module.prepare(source)

    def test_mapping_rls_requires_exact_function_review(self):
        source=self.fixture()
        source['tables'].append({'name':'profession_careness_mapping_state','rls':False})
        with self.assertRaisesRegex(ValueError,'new review required'):
            module.prepare(source)

    def test_existing_target_policy_is_not_duplicated(self):
        prepared,_=module.prepare(self.fixture())
        with self.assertRaisesRegex(ValueError,'already exists'):
            module.prepare(prepared)

if __name__=='__main__':
    unittest.main()
