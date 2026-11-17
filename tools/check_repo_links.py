#!/usr/bin/env python3
"""Fail if a tracked file links to a GitHub repo in the owner's namespace that is not
on the public allowlist below. This repo is public, so links to private repos only
reveal their names and file paths (they 404 for visitors). Cite those sources as
unlinked labels instead. Add a repo here only once it is public."""
import re, subprocess, sys

OWNER = "rmcjones-collab"
PUBLIC = {"mindblown-brains", "mindblown-demo", "rockstar-newswire-tracker",
          "mindblown-kingfischer", "virtual-sfx-lab-downloads", "campfire-keepalive"}

pat = re.compile(r"github\.com/" + re.escape(OWNER) + r"/([A-Za-z0-9._-]+)", re.IGNORECASE)
files = subprocess.run(["git", "ls-files", "-z"], capture_output=True, text=True, check=True).stdout.split("\0")
bad = {}
for f in filter(None, files):
    try:
        text = open(f, encoding="utf-8").read()
    except (UnicodeDecodeError, IsADirectoryError, FileNotFoundError):
        continue
    for name in pat.findall(text):
        name = re.sub(r"\.git$", "", name.lower())
        if name not in PUBLIC:
            bad.setdefault(f, set()).add(name)
if bad:
    for f, names in sorted(bad.items()):
        print(f"FAIL {f}: links to non-allowlisted repo(s): {', '.join(sorted(names))}")
    sys.exit(1)
print(f"PASS no links to non-public {OWNER} repos ({len(files)} files)")
