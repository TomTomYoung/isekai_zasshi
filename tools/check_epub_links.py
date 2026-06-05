from pathlib import Path
import re
import sys
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "202603"
TOC = TARGET / "目次_epub.html"


def clean_ref(value: str) -> str:
    return unquote(value.split("#", 1)[0].split("?", 1)[0])


def rel(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def main() -> int:
    errors = []
    warnings = []

    if not TOC.exists():
        print(f"missing TOC: {rel(TOC)}")
        return 1

    toc_text = TOC.read_text(encoding="utf-8")
    hrefs = re.findall(r'<a\s+href="([^"]+)"', toc_text)

    print(f"TOC links: {len(hrefs)}")
    if len(hrefs) != 23:
        warnings.append(f"expected 23 TOC links, got {len(hrefs)}")

    html_files = []
    for href in hrefs:
        path = (TOC.parent / clean_ref(href)).resolve()
        if path.exists():
            html_files.append(path)
        else:
            errors.append(f"missing HTML: {href}")

    print(f"Existing HTML files: {len(html_files)}")

    for idx, html in enumerate(html_files, start=1):
        text = html.read_text(encoding="utf-8")
        expected_id = f"chapter-{idx:02d}"
        if f'id="{expected_id}"' not in text:
            warnings.append(f"chapter id may differ: {rel(html)} expected {expected_id}")

        refs = []
        refs.extend(("img", value) for value in re.findall(r'<img[^>]+src="([^"]+)"', text))
        refs.extend(("css", value) for value in re.findall(r'<link[^>]+href="([^"]+)"', text))

        for kind, value in refs:
            asset = (html.parent / clean_ref(value)).resolve()
            if not asset.exists():
                errors.append(f"missing {kind}: {rel(html)} -> {value}")

    print("\nChecked HTML:")
    for html in html_files:
        print(f"- {rel(html)}")

    print("\nWarnings:")
    if warnings:
        for item in warnings:
            print(f"- {item}")
    else:
        print("- none")

    print("\nErrors:")
    if errors:
        for item in errors:
            print(f"- {item}")
        print("\nRESULT: FAIL")
        return 1

    print("- none")
    print("\nRESULT: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
