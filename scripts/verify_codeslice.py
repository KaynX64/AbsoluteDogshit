#!/usr/bin/env python3
"""Verify CODESLICE slice maps.

Every table row `| # | A-B | anchor | description |` must satisfy:
  - A <= B <= line count of the mapped file
  - slices per file are ascending and non-overlapping
  - the Anchor string literally appears in the source file within [A, B]
    (rows anchored with an em dash are structural filler and skipped)

A directory argument expands to its sorted *.md files — pass a codeslice/
directory to check every per-monolith sub-MD inside it.

Usage: python3 verify_codeslice.py <md-or-dir> [<md-or-dir> ...] <repo-root>
Exit 0 = all files ALL OK.
"""
import re
import sys
import pathlib

DASHES = "\u2013\u2014-"


def check(md, root):
    cur_fid = cur_path = None
    rows = []
    for line in md.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        m = re.match(r"^#{2,3}\s+([A-Z]{2,3}-\d+)\s*[\u00b7|\u2014]\s*(.+)$", s)
        if m:
            cur_fid, cur_path = m.group(1), m.group(2).strip()
            continue
        m = re.match(
            r"^\|\s*\d+\s*\|\s*(\d+)\s*[" + DASHES + r"]\s*(\d+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*$",
            s,
        )
        if m and cur_fid:
            rows.append((cur_fid, cur_path, int(m.group(1)), int(m.group(2)), m.group(3)))
    if not rows:
        print(f"{md}: NO ROWS PARSED - check table format")
        return 1, 0

    fails = 0
    prev_end = {}
    cache = {}
    for fid, path, a, b, anchor in rows:
        if path not in cache:
            p = root / path
            cache[path] = p.read_text(errors="replace").splitlines() if p.exists() else None
        lines = cache[path]
        if lines is None:
            print(f"FAIL {fid} {path}: file missing")
            fails += 1
            continue
        if not (1 <= a <= b <= len(lines)):
            print(f"FAIL {fid} {path} L{a}-{b}: out of bounds (file has {len(lines)} lines)")
            fails += 1
            continue
        key = (fid, path)
        if key in prev_end and a <= prev_end[key]:
            print(f"FAIL {fid} {path} L{a}-{b}: overlaps previous slice ending L{prev_end[key]}")
            fails += 1
        prev_end[key] = b
        anc = anchor.strip().strip("`").strip()
        if anc in ("\u2014", "-", "\u2013") or anc == "":
            continue
        window = lines[a - 1 : b]
        if not any(anc in ln for ln in window):
            print(f"FAIL {fid} {path} L{a}-{b}: anchor not found in range: {anc!r}")
            fails += 1
    status = "ALL OK" if fails == 0 else f"FAILURES: {fails}"
    print(f"{md}: {status} ({len(rows)} rows)")
    return fails, len(rows)


def expand(args):
    out = []
    for a in args:
        p = pathlib.Path(a)
        if p.is_dir():
            out.extend(sorted(p.glob("*.md")))
        else:
            out.append(p)
    return out


def main():
    if len(sys.argv) < 3:
        print("usage: verify_codeslice.py <md-or-dir> [<md-or-dir> ...] <repo-root>")
        sys.exit(2)
    root = pathlib.Path(sys.argv[-1])
    mds = expand(sys.argv[1:-1])
    if not mds:
        print("no .md files found in the given paths")
        sys.exit(2)
    total_fails = total_rows = 0
    for md in mds:
        f, r = check(md, root)
        total_fails += f
        total_rows += r
    if len(mds) > 1:
        verdict = "TOTAL OK" if total_fails == 0 else f"TOTAL FAILURES: {total_fails}"
        print(f"{verdict} ({total_rows} rows across {len(mds)} files)")
    sys.exit(1 if total_fails else 0)


main()
