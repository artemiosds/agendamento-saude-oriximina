import importlib.util
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("validate-edge-function-inventory.py")
SPEC = importlib.util.spec_from_file_location("edge_inventory", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load Edge Function inventory script")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class EdgeFunctionInventoryTest(unittest.TestCase):
    def test_repository_has_expected_edge_function_entrypoints(self):
        root = Path(__file__).parents[2] / "supabase" / "functions"
        manifest = MODULE.validate_inventory(root)
        self.assertEqual(manifest["count"], 30)
        self.assertFalse(manifest["secret_values_read"])
        names = {item["name"] for item in manifest["functions"]}
        self.assertIn("backoffice-license-status", names)
        self.assertIn("sync-sigtap-datasus", names)
        self.assertIn("public-scheduling", names)

    def test_inventory_extracts_environment_names_without_values(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            folder = root / "sample-function"
            folder.mkdir()
            (folder / "index.ts").write_text(
                'const api = Deno.env.get("API_TOKEN");\\n'
                'const url = Deno.env["SERVICE_URL"];\\n'
                'const client = process.env.CLIENT_ID;\\n'
                'const secret = "must-not-be-captured";\\n',
                encoding="utf-8",
            )
            item = MODULE.inventory_functions(root)["functions"][0]
            self.assertEqual(
                item["environment_variable_names"],
                ["API_TOKEN", "CLIENT_ID", "SERVICE_URL"],
            )
            self.assertNotIn("must-not-be-captured", str(item))

    def test_inventory_captures_relative_imports_for_deployment_packaging(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            folder = root / "sample-function"
            folder.mkdir()
            (folder / "index.ts").write_text(
                'import { helper } from "../_shared/helper.ts";\\n',
                encoding="utf-8",
            )
            item = MODULE.inventory_functions(root)["functions"][0]
            self.assertEqual(item["relative_imports"], ["../_shared/helper.ts"])


if __name__ == "__main__":
    unittest.main()
