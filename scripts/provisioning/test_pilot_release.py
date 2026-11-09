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
if __name__=='__main__':
    unittest.main()
