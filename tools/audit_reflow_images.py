from __future__ import annotations

from pathlib import Path
from urllib.parse import unquote
import re

ROOT = Path(__file__).resolve().parents[1]
ISSUE_DIR = ROOT / "202603"
REPORT = ROOT / "docs" / "04_reflow_image_audit.md"
IMG_RE = re.compile(r'<img\b[^>]*\bsrc="([^"]+)"', re.IGNORECASE)


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def resolve_src(html_path: Path, src: str) -> Path | None:
    if src.startswith(("http://", "https://", "data:")):
        return None
    clean = unquote(src.split("#", 1)[0].split("?", 1)[0])
    return (html_path.parent / clean).resolve()


def main() -> int:
    rows: list[tuple[str, str, str]] = []
    missing: list[tuple[str, str, str]] = []
    html_files = sorted(ISSUE_DIR.glob("*/*_reflow.html"))

    for html_path in html_files:
        text = html_path.read_text(encoding="utf-8")
        for src in IMG_RE.findall(text):
            target = resolve_src(html_path, src)
            if target is None:
                status = "external"
                target_text = src
            elif target.exists():
                status = "ok"
                target_text = rel(target)
            else:
                status = "missing"
                target_text = rel(target)
                missing.append((rel(html_path), src, target_text))
            rows.append((rel(html_path), src, status))

    lines: list[str] = []
    lines.append("# reflow 画像リンク監査")
    lines.append("")
    lines.append("## 結果")
    lines.append("")
    lines.append(f"- 対象HTML数: {len(html_files)}")
    lines.append(f"- 画像参照数: {len(rows)}")
    lines.append(f"- 欠落画像数: {len(missing)}")
    lines.append("")

    if missing:
        lines.append("## 欠落画像")
        lines.append("")
        lines.append("| HTML | src | 解決先 |")
        lines.append("|---|---|---|")
        for html_path, src, target in missing:
            lines.append(f"| `{html_path}` | `{src}` | `{target}` |")
        lines.append("")
    else:
        lines.append("## 欠落画像")
        lines.append("")
        lines.append("なし。")
        lines.append("")

    lines.append("## 全画像参照")
    lines.append("")
    lines.append("| HTML | src | status |")
    lines.append("|---|---|---|")
    for html_path, src, status in rows:
        lines.append(f"| `{html_path}` | `{src}` | `{status}` |")
    lines.append("")

    REPORT.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"Wrote {rel(REPORT)}")
    print(f"HTML files: {len(html_files)}")
    print(f"Image refs: {len(rows)}")
    print(f"Missing images: {len(missing)}")
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
