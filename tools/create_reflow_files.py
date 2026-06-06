from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ISSUE_DIR = ROOT / "202603"

RENAMES = {
    "目次_epub.html": "目次_reflow.html",
    "epub.css": "reflow.css",
}


def convert_text(text: str) -> str:
    return (
        text
        .replace("epub.css", "reflow.css")
        .replace("目次_epub.html", "目次_reflow.html")
        .replace("_epub.html", "_reflow.html")
        .replace("epub-toc", "reflow-toc")
        .replace("EPUB", "Reflow")
        .replace("EPUB向け", "Reflow向け")
    )


def write_if_changed(path: Path, text: str) -> bool:
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    path.write_text(text, encoding="utf-8", newline="\n")
    return True


def main() -> None:
    changed = []

    toc_old = ISSUE_DIR / "目次_epub.html"
    toc_new = ISSUE_DIR / "目次_reflow.html"
    if toc_old.exists():
        if write_if_changed(toc_new, convert_text(toc_old.read_text(encoding="utf-8"))):
            changed.append(toc_new.relative_to(ROOT).as_posix())

    css_old = ISSUE_DIR / "epub.css"
    css_new = ISSUE_DIR / "reflow.css"
    if css_old.exists():
        if write_if_changed(css_new, convert_text(css_old.read_text(encoding="utf-8"))):
            changed.append(css_new.relative_to(ROOT).as_posix())

    for old_path in sorted(ISSUE_DIR.glob("*/*_epub.html")):
        new_path = old_path.with_name(old_path.name.replace("_epub.html", "_reflow.html"))
        if write_if_changed(new_path, convert_text(old_path.read_text(encoding="utf-8"))):
            changed.append(new_path.relative_to(ROOT).as_posix())

    if changed:
        print("Created/updated reflow files:")
        for item in changed:
            print(f"- {item}")
    else:
        print("No changes needed.")


if __name__ == "__main__":
    main()
