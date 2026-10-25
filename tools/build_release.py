#!/usr/bin/env python3
"""Build a Foundry install archive; GitHub URLs are derived, never hand-edited."""
import argparse
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def build(repo=None, version=None, out=None):
    manifest=json.loads((ROOT/"module.json").read_text(encoding="utf-8"))
    version=(version or manifest["version"]).removeprefix("v")
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?",version):
        raise ValueError("Version must look like 0.1.0 or 0.1.0-beta.1")
    if repo and not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+",repo):
        raise ValueError("Repository must look like USER/REPO")
    manifest["version"]=version
    if repo:
        base=f"https://github.com/{repo}"
        manifest.update(url=base,manifest=f"{base}/releases/latest/download/module.json",download=f"{base}/releases/download/v{version}/world-codex.zip")
    destination=Path(out or ROOT/"dist");destination.mkdir(parents=True,exist_ok=True)
    content=json.dumps(manifest,ensure_ascii=False,indent=2)+"\n"
    (destination/"module.json").write_text(content,encoding="utf-8")
    files=[ROOT/"LICENSE",ROOT/"README.md",ROOT/"CHANGELOG.md"]
    files += sorted((ROOT/"scripts").rglob("*.js")) + sorted((ROOT/"styles").rglob("*.css"))
    files += sorted(p for p in (ROOT/"assets").rglob("*") if p.is_file())
    for rel in manifest["esmodules"]+manifest["styles"]:
        if not (ROOT/rel).is_file():raise FileNotFoundError(rel)
    archive=destination/"world-codex.zip"
    with zipfile.ZipFile(archive,"w",zipfile.ZIP_DEFLATED) as z:
        z.writestr("module.json",content)
        for path in files:z.write(path,path.relative_to(ROOT).as_posix())
    print(f"Built {archive} ({archive.stat().st_size} bytes)")
    if repo:print(manifest["manifest"])
    return manifest,archive

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--repo");parser.add_argument("--version");parser.add_argument("--out")
    build(**vars(parser.parse_args()))
