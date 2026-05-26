from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
TARGET_DIR = ROOT / "202603"


def normalize_html(path: Path) -> bool:
    s = path.read_text(encoding="utf-8")
    original = s

    # XML declaration
    s = re.sub(r"^\ufeff?", "", s)
    if not s.startswith("<?xml"):
        s = '<?xml version="1.0" encoding="UTF-8"?>\n' + s

    # HTML root element
    if path.name == "目次_epub.html":
        s = re.sub(
            r'<html\s+lang="ja"\s*>',
            '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="ja" xml:lang="ja">',
            s,
            count=1,
        )
        s = re.sub(
            r'<nav class="epub-toc" id="toc">',
            '<nav class="epub-toc" id="toc" epub:type="toc">',
            s,
            count=1,
        )
    else:
        s = re.sub(
            r'<html\s+lang="ja"\s*>',
            '<html xmlns="http://www.w3.org/1999/xhtml" lang="ja" xml:lang="ja">',
            s,
            count=1,
        )
        # Safety-normalize section id only for numbered articles.
        m = re.search(r'202603/(\d{2})_', path.as_posix())
        if m:
            chapter_id = f'chapter-{m.group(1)}'
            s = re.sub(r'<section class="chapter" id="[^"]+">', f'<section class="chapter" id="{chapter_id}">', s, count=1)

    # Empty elements to XHTML style.
    s = re.sub(r'<meta charset="UTF-8"\s*>', '<meta charset="UTF-8" />', s)
    s = re.sub(r'<link rel="stylesheet" href="([^"]+)"\s*>', r'<link rel="stylesheet" href="\1" type="text/css" />', s)
    s = re.sub(r'<hr\s*>', '<hr />', s)
    s = re.sub(r'<br\s*>', '<br />', s)

    # img tags without trailing slash.
    def close_img(m: re.Match) -> str:
        tag = m.group(0)
        if tag.endswith('/>'):
            return tag
        return tag[:-1].rstrip() + ' />'

    s = re.sub(r'<img\b[^>]*>', close_img, s)

    if s != original:
        path.write_text(s, encoding="utf-8", newline="\n")
        return True
    return False


def main() -> None:
    changed = []
    targets = [TARGET_DIR / "目次_epub.html"] + sorted(TARGET_DIR.glob("*/*_epub.html"))
    for path in targets:
        if path.exists() and normalize_html(path):
            changed.append(path.relative_to(ROOT).as_posix())

    if changed:
        print("Normalized files:")
        for p in changed:
            print(f"- {p}")
    else:
        print("No changes needed.")


if __name__ == "__main__":
    main()
