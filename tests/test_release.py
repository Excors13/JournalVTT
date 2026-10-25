import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

spec=importlib.util.spec_from_file_location("build_release",Path(__file__).resolve().parents[1]/"tools/build_release.py")
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ReleaseTests(unittest.TestCase):
    def test_published_manifest_and_archive_match(self):
        with tempfile.TemporaryDirectory() as destination:
            manifest,archive=module.build("example-owner/example-repo","v0.1.0",destination)
            self.assertEqual(manifest["manifest"],"https://github.com/example-owner/example-repo/releases/latest/download/module.json")
            self.assertEqual(manifest["download"],"https://github.com/example-owner/example-repo/releases/download/v0.1.0/world-codex.zip")
            with zipfile.ZipFile(archive) as z:
                names=z.namelist()
                self.assertEqual(json.loads(z.read("module.json")),manifest)
                for entry in manifest["esmodules"]+manifest["styles"]:self.assertIn(entry,names)
                self.assertIn("scripts/app.js",names)
                self.assertFalse(any("node_modules" in name or "tests/" in name or ".github/" in name for name in names))
                for name in names:self.assertFalse(name.startswith("/") or ".." in Path(name).parts)

    def test_invalid_repo_and_version_are_rejected(self):
        with self.assertRaises(ValueError):module.build("bad/../../../path","0.1.0")
        with self.assertRaises(ValueError):module.build("owner/repo","../../bad")

if __name__=="__main__":unittest.main()
