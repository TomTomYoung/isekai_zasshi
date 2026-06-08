import os
from pathlib import Path
import re
import struct
import sys
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path.cwd()
EXPECTED_WIDTH = 1456
EXPECTED_HEIGHT = 2056
DEFAULT_ISSUE = '202603'


def resolve_issue():
    if len(sys.argv) >= 2:
        return sys.argv[1]
    return os.environ.get('ISSUE', DEFAULT_ISSUE)


ISSUE = resolve_issue()
ISSUE_EXPORT_DIR = ROOT / 'exports' / ISSUE
ISSUE_KINDLE_DIR = ISSUE_EXPORT_DIR / 'kindle_pages'
ISSUE_EPUB_PATH = ISSUE_EXPORT_DIR / f'isekai_marumie_jitsuwa_{ISSUE}_fixed_layout.epub'

LEGACY_FIXED_DIR = ROOT / 'exports' / 'fixed_layout_images'
LEGACY_KINDLE_DIR = ROOT / 'exports' / 'kindle_pages'
LEGACY_EPUB_PATH = ROOT / 'exports' / f'isekai_marumie_jitsuwa_{ISSUE}_fixed_layout.epub'

if ISSUE_KINDLE_DIR.exists() or ISSUE_EPUB_PATH.exists():
    FIXED_DIR = None
    KINDLE_DIR = ISSUE_KINDLE_DIR
    EPUB_PATH = ISSUE_EPUB_PATH
    MODE = 'issue'
else:
    FIXED_DIR = LEGACY_FIXED_DIR
    KINDLE_DIR = LEGACY_KINDLE_DIR
    EPUB_PATH = LEGACY_EPUB_PATH
    MODE = 'legacy'


def png_size(path):
    with open(path, 'rb') as f:
        sig = f.read(8)
        if sig != b'\x89PNG\r\n\x1a\n':
            raise ValueError('not a PNG')
        length = struct.unpack('>I', f.read(4))[0]
        chunk_type = f.read(4)
        if chunk_type != b'IHDR' or length < 8:
            raise ValueError('missing IHDR')
        width, height = struct.unpack('>II', f.read(8))
        return width, height


def check_png_dir(directory, label):
    errors = []
    if not directory.exists():
        return [], [f'{label}: missing directory {directory.relative_to(ROOT)}']
    files = sorted(directory.glob('*.png'))
    if not files:
        return [], [f'{label}: no PNG files found']

    for path in files:
        try:
            width, height = png_size(path)
        except Exception as exc:
            errors.append(f'{label}: {path.name}: {exc}')
            continue
        if (width, height) != (EXPECTED_WIDTH, EXPECTED_HEIGHT):
            errors.append(f'{label}: {path.name}: expected {EXPECTED_WIDTH}x{EXPECTED_HEIGHT}, got {width}x{height}')
    return files, errors


def check_fixed_names(files):
    errors = []
    pattern = re.compile(r'^\d{2}_.+_\d{3}\.png$')
    for path in files:
        if not pattern.match(path.name):
            errors.append(f'fixed_layout_images: unexpected name: {path.name}')
    return errors


def check_kindle_sequence(files):
    errors = []
    for index, path in enumerate(files, start=1):
        expected = f'{index:04d}.png'
        if path.name != expected:
            errors.append(f'kindle_pages: expected {expected}, got {path.name}')
    return errors


def check_issue_manifest(expected_page_count):
    if MODE != 'issue':
        return []
    manifest_path = ISSUE_EXPORT_DIR / 'issue_manifest.json'
    if not manifest_path.exists():
        return [f'issue_manifest: missing {manifest_path.relative_to(ROOT)}']
    try:
        import json
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        pages = manifest.get('pages')
        if not isinstance(pages, list):
            return [f'issue_manifest: pages is not a list: {manifest_path.relative_to(ROOT)}']
        if len(pages) != expected_page_count:
            return [f'issue_manifest: expected {expected_page_count} pages, got {len(pages)}']
    except Exception as exc:
        return [f'issue_manifest: {exc}']
    return []


def check_epub(expected_page_count):
    errors = []
    if not EPUB_PATH.exists():
        return [f'epub: missing {EPUB_PATH.relative_to(ROOT)}']

    try:
        with zipfile.ZipFile(EPUB_PATH, 'r') as epub:
            names = epub.namelist()
            if not names or names[0] != 'mimetype':
                errors.append('epub: mimetype must be the first ZIP entry')
            if 'OEBPS/content.opf' not in names:
                errors.append('epub: missing OEBPS/content.opf')
                return errors

            opf = epub.read('OEBPS/content.opf')
            root = ET.fromstring(opf)
            ns = {'opf': 'http://www.idpf.org/2007/opf'}
            manifest = root.find('opf:manifest', ns)
            spine = root.find('opf:spine', ns)
            if manifest is None or spine is None:
                errors.append('epub: missing manifest or spine')
                return errors

            image_items = [item for item in manifest if item.attrib.get('media-type') == 'image/png']
            page_items = [item for item in manifest if item.attrib.get('href', '').startswith('pages/page_')]
            spine_items = list(spine)

            if len(image_items) != expected_page_count:
                errors.append(f'epub: expected {expected_page_count} image items, got {len(image_items)}')
            if len(page_items) != expected_page_count:
                errors.append(f'epub: expected {expected_page_count} page xhtml items, got {len(page_items)}')
            if len(spine_items) != expected_page_count:
                errors.append(f'epub: expected {expected_page_count} spine items, got {len(spine_items)}')
    except Exception as exc:
        errors.append(f'epub: {exc}')
    return errors


def main():
    errors = []

    fixed_files = []
    if FIXED_DIR is not None:
        fixed_files, fixed_errors = check_png_dir(FIXED_DIR, 'fixed_layout_images')
        errors.extend(fixed_errors)
        if fixed_files:
            errors.extend(check_fixed_names(fixed_files))

    kindle_files, kindle_errors = check_png_dir(KINDLE_DIR, 'kindle_pages')
    errors.extend(kindle_errors)

    if kindle_files:
        errors.extend(check_kindle_sequence(kindle_files))
        errors.extend(check_issue_manifest(len(kindle_files)))
        errors.extend(check_epub(len(kindle_files)))

    if fixed_files and kindle_files and len(fixed_files) != len(kindle_files):
        errors.append(f'page count mismatch: fixed_layout_images={len(fixed_files)}, kindle_pages={len(kindle_files)}')

    if errors:
        print('fixed layout output check: FAILED')
        print(f'mode: {MODE}')
        print(f'issue: {ISSUE}')
        for error in errors:
            print(f'- {error}')
        sys.exit(1)

    print('fixed layout output check: OK')
    print(f'mode: {MODE}')
    print(f'issue: {ISSUE}')
    if fixed_files:
        print(f'fixed_layout_images: {len(fixed_files)} PNG files')
    print(f'kindle_pages: {len(kindle_files)} PNG files')
    if EPUB_PATH.exists():
        print(f'epub: {EPUB_PATH.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
