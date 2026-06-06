import datetime
import html
import os
from pathlib import Path
import uuid
import zipfile

ROOT = Path.cwd()
SRC_DIR = ROOT / 'exports' / 'kindle_pages'
OUT_DIR = ROOT / 'exports'
OUT_EPUB = OUT_DIR / 'isekai_marumie_jitsuwa_202603_fixed_layout.epub'
BOOK_TITLE = '異世界丸見え実話 202603号'
PAGE_WIDTH = 1456
PAGE_HEIGHT = 2056


def xhtml_page(index, image_name):
    title = f'{BOOK_TITLE} {index:04d}'
    escaped_title = html.escape(title, quote=False)
    escaped_image = html.escape(f'../images/{image_name}', quote=True)
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="ja">
<head>
  <meta charset="UTF-8" />
  <title>{escaped_title}</title>
  <meta name="viewport" content="width={PAGE_WIDTH}, height={PAGE_HEIGHT}" />
  <style type="text/css">
    html, body {{
      margin: 0;
      padding: 0;
      width: {PAGE_WIDTH}px;
      height: {PAGE_HEIGHT}px;
      overflow: hidden;
      background: #000;
    }}
    img {{
      display: block;
      width: {PAGE_WIDTH}px;
      height: {PAGE_HEIGHT}px;
      object-fit: contain;
    }}
  </style>
</head>
<body>
  <img src="{escaped_image}" alt="{escaped_title}" />
</body>
</html>
'''


def nav_xhtml(page_count):
    items = []
    for i in range(1, page_count + 1):
        items.append(f'      <li><a href="pages/page_{i:04d}.xhtml">{i:04d}</a></li>')
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="ja">
<head>
  <meta charset="UTF-8" />
  <title>{html.escape(BOOK_TITLE, quote=False)} 目次</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>{html.escape(BOOK_TITLE, quote=False)} 目次</h1>
    <ol>
{chr(10).join(items)}
    </ol>
  </nav>
</body>
</html>
'''


def toc_ncx(book_id, page_count):
    navpoints = []
    for i in range(1, page_count + 1):
        navpoints.append(f'''
    <navPoint id="navPoint-{i}" playOrder="{i}">
      <navLabel><text>{i:04d}</text></navLabel>
      <content src="pages/page_{i:04d}.xhtml"/>
    </navPoint>''')
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:{book_id}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="{page_count}"/>
    <meta name="dtb:maxPageNumber" content="{page_count}"/>
  </head>
  <docTitle><text>{html.escape(BOOK_TITLE, quote=False)}</text></docTitle>
  <navMap>
{''.join(navpoints)}
  </navMap>
</ncx>
'''


def content_opf(book_id, page_count, images):
    modified = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    escaped_title = html.escape(BOOK_TITLE, quote=False)

    manifest = [
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    ]
    spine = []

    for i, image_name in enumerate(images, start=1):
        page_id = f'page_{i:04d}'
        image_id = f'image_{i:04d}'
        properties = ' properties="cover-image"' if i == 1 else ''
        manifest.append(f'<item id="{page_id}" href="pages/page_{i:04d}.xhtml" media-type="application/xhtml+xml"/>')
        manifest.append(f'<item id="{image_id}" href="images/{image_name}" media-type="image/png"{properties}/>' )
        spine.append(f'<itemref idref="{page_id}"/>')

    return f'''<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookID" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>{escaped_title}</dc:title>
    <dc:language>ja</dc:language>
    <dc:identifier id="BookID">urn:uuid:{book_id}</dc:identifier>
    <meta property="dcterms:modified">{modified}</meta>
    <meta property="rendition:layout">pre-paginated</meta>
    <meta property="rendition:orientation">portrait</meta>
    <meta property="rendition:spread">none</meta>
    <meta name="fixed-layout" content="true"/>
    <meta name="original-resolution" content="{PAGE_WIDTH}x{PAGE_HEIGHT}"/>
  </metadata>
  <manifest>
    {chr(10).join(manifest)}
  </manifest>
  <spine toc="ncx" page-progression-direction="ltr">
    {chr(10).join(spine)}
  </spine>
</package>
'''


def container_xml():
    return '''<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
'''


def main():
    if not SRC_DIR.exists():
        raise SystemExit('Missing exports/kindle_pages. Run: node tools/prepare_kindle_pages.mjs')

    images = sorted(p.name for p in SRC_DIR.glob('*.png'))
    if not images:
        raise SystemExit('No PNG files found in exports/kindle_pages.')

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    book_id = str(uuid.uuid4())

    with zipfile.ZipFile(OUT_EPUB, 'w') as epub:
        epub.writestr('mimetype', b'application/epub+zip', compress_type=zipfile.ZIP_STORED)
        epub.writestr('META-INF/container.xml', container_xml().encode('utf-8'), compress_type=zipfile.ZIP_DEFLATED)
        epub.writestr('OEBPS/content.opf', content_opf(book_id, len(images), images).encode('utf-8'), compress_type=zipfile.ZIP_DEFLATED)
        epub.writestr('OEBPS/nav.xhtml', nav_xhtml(len(images)).encode('utf-8'), compress_type=zipfile.ZIP_DEFLATED)
        epub.writestr('OEBPS/toc.ncx', toc_ncx(book_id, len(images)).encode('utf-8'), compress_type=zipfile.ZIP_DEFLATED)

        for i, image_name in enumerate(images, start=1):
            epub.writestr(f'OEBPS/pages/page_{i:04d}.xhtml', xhtml_page(i, image_name).encode('utf-8'), compress_type=zipfile.ZIP_DEFLATED)
            with open(SRC_DIR / image_name, 'rb') as image_file:
                epub.writestr(f'OEBPS/images/{image_name}', image_file.read(), compress_type=zipfile.ZIP_DEFLATED)

    print(f'Created {OUT_EPUB.relative_to(ROOT)}')
    print(f'Pages: {len(images)}')
    print(f'Page size: {PAGE_WIDTH}x{PAGE_HEIGHT}')


if __name__ == '__main__':
    main()
