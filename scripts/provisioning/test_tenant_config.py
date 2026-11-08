import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "render_tenant_config", Path(__file__).with_name("render-tenant-config.py")
)
if spec is None or spec.loader is None:
    raise RuntimeError("Cannot load tenant config renderer")
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)


class TenantConfigTest(unittest.TestCase):
    def test_replaces_only_project_ref_and_preserves_function_settings(self):
        source = 'project_id = "ygbgywglxsshkkoiriul"\n\n[functions.backoffice-license-status]\nverify_jwt = true\n'
        rendered = renderer.render_config(source, "abcdefghijklmnopqrst")
        self.assertIn('project_id = "abcdefghijklmnopqrst"', rendered)
        self.assertIn("[functions.backoffice-license-status]\nverify_jwt = true", rendered)
        self.assertNotIn("ygbgywglxsshkkoiriul", rendered)

    def test_rejects_source_project_ref(self):
        source = 'project_id = "ygbgywglxsshkkoiriul"\n'
        with self.assertRaisesRegex(ValueError, "differ from the Oriximina source"):
            renderer.render_config(source, "ygbgywglxsshkkoiriul")

    def test_rejects_invalid_project_ref(self):
        with self.assertRaisesRegex(ValueError, "Invalid Supabase project ref"):
            renderer.render_config('project_id = "source"\n', "bad-ref")

    def test_rejects_missing_or_duplicate_project_id(self):
        for source in ("[functions.x]\nverify_jwt = true\n",
                       'project_id = "abcdefghijklmnopqrst"\nproject_id = "abcdefghijklmnopqrss"\n'):
            with self.subTest(source=source):
                with self.assertRaisesRegex(ValueError, "exactly one project_id"):
                    renderer.render_config(source, "qrstuvwxyzabcdefghij")


if __name__ == "__main__":
    unittest.main()
