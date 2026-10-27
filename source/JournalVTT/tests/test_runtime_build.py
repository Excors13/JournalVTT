import importlib.util
import tempfile
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('build_runtime',Path(__file__).resolve().parents[1]/'tools/build_runtime.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class RuntimeBuildTests(unittest.TestCase):
    def test_runtime_is_deterministic_and_has_no_network_imports(self):
        first=module.build().read_bytes();second=module.build().read_bytes()
        self.assertEqual(first,second)
        self.assertNotIn(b'await import(',first)
        self.assertNotIn(b'import("',first)
        self.assertIn(b'export function resumeCodex',first)

    def test_static_cycles_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'scripts').mkdir()
            (root/'scripts/main.js').write_text('import {b} from "./b.js";\nexport const a=1;')
            (root/'scripts/b.js').write_text('import {a} from "./main.js";\nexport const b=2;')
            with self.assertRaisesRegex(ValueError,'cycle'):module.build(root)

    def test_unsupported_imports_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'scripts').mkdir()
            (root/'scripts/main.js').write_text('import anything from "unknown";\nexport const a=1;')
            with self.assertRaisesRegex(ValueError,'Unsupported'):module.build(root)

    def test_missing_imports_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'scripts').mkdir()
            (root/'scripts/main.js').write_text('import {a} from "./missing.js";\nexport const b=1;')
            with self.assertRaisesRegex(ValueError,'Missing'):module.build(root)
