#!/usr/bin/env python3
"""Verify CODESLICE slice maps.

Every table row `| # | A-B | anchor | description |` must satisfy:
  - A <= B <= line count of the mapped file
  - slices per file are ascending and non-overlapping
  - the Anchor string literally appears in the source file within [A, B]
    (rows anchored with an em dash are structural filler and skipped)

A directory argument expands to its sorted top-level `*.md` files — pass a
`codeslice/` directory to check every per-monolith sub-MD inside it. Slice
maps that exceed the 7 KB documentation cap are split into `<name>-parts/`
directories of `<name>-NN.md` parts; each such directory is reassembled in
numeric order (provenance comment lines stripped) and checked as one logical
map. Passing any single part file checks its whole group the same way.

Usage: python3 verify_codeslice.py <md-or-dir> [<md-or-dir> ...] <repo-root>
Exit 0 = all files ALL OK.
"""
import re
import sys
import pathlib

DASHES = "\u2013\u2014-"


def check(name, text, root):
    cur_fid = cur_path = None
    rows = []
    for line in text.splitlines():
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
        print(f"{name}: NO ROWS PARSED - check table format")
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
    print(f"{name}: {status} ({len(rows)} rows)")
    return fails, len(rows)


def reassemble(group_dir):
    """Concatenate a split map's parts in numeric order, stripping the
    one-line `<!-- split from ... -->` provenance comment each part
    starts with. Returns None if the directory holds no part files."""
    parts = [p for p in group_dir.glob("*.md") if re.search(r"-\d+\.md$", p.name)]
    if not parts:
        return None
    parts.sort(key=lambda p: int(re.search(r"-(\d+)\.md$", p.name).group(1)))
    chunks = []
    for p in parts:
        lines = p.read_text(encoding="utf-8").splitlines(keepends=True)
        if lines and lines[0].startswith("<!-- split from"):
            lines = lines[1:]
        chunks.append("".join(lines))
    return "".join(chunks)


def expand(args):
    """Turn path arguments into (name, text) units to check.

    A directory yields its sorted top-level `*.md` files plus one
    reassembled unit per `<name>-parts/` split-map directory inside it.
    A part-file argument (`<name>-parts/<name>-NN.md`) yields its whole
    group, reassembled.
    """
    units = []
    for a in args:
        p = pathlib.Path(a)
        if p.is_dir():
            for f in sorted(p.glob("*.md")):
                units.append((f, f.read_text(encoding="utf-8")))
            for sub in sorted(p.iterdir()):
                if sub.is_dir() and sub.name.endswith("-parts"):
                    text = reassemble(sub)
                    if text is not None:
                        units.append((sub, text))
        elif re.search(r"-parts[/\\].*-\d+\.md$", str(p)):
            text = reassemble(p.parent)
            if text is not None:
                units.append((p.parent, text))
        else:
            units.append((p, p.read_text(encoding="utf-8")))
    return units


def main():
    if len(sys.argv) < 3:
        print("usage: verify_codeslice.py <md-or-dir> [<md-or-dir> ...] <repo-root>")
        sys.exit(2)
    root = pathlib.Path(sys.argv[-1])
    units = expand(sys.argv[1:-1])
    if not units:
        print("no .md files found in the given paths")
        sys.exit(2)
    total_fails = total_rows = 0
    for name, text in units:
        f, r = check(name, text, root)
        total_fails += f
        total_rows += r
    if len(units) > 1:
        verdict = "TOTAL OK" if total_fails == 0 else f"TOTAL FAILURES: {total_fails}"
        print(f"{verdict} ({total_rows} rows across {len(units)} files)")
    sys.exit(1 if total_fails else 0)


main()
