import os
import re
import zipfile
import uuid
import datetime
import html


EPUB_READING_CSS = """

/* EPUB reading overrides: keep each article as an independent page/section. */
body {
    background: transparent;
    margin: 0;
    padding: 0;
}

.magazine-article {
    break-before: page;
    page-break-before: always;
    margin: 0;
    padding: 0;
    box-shadow: none;
    background: transparent;
}

.magazine-article:first-of-type {
    break-before: auto;
    page-break-before: auto;
}

.article-header {
    margin-top: 3em;
    margin-bottom: 2em;
    padding-bottom: 1em;
    border-bottom: 3px double #333;
}

.article-header h1 {
    font-size: 1.5em;
    line-height: 1.5;
}

.epub-toc {
    break-before: page;
    page-break-before: always;
    margin: 0;
    padding: 0;
    box-shadow: none;
    background: transparent;
}

.epub-toc ol {
    padding-left: 1.5em;
}

.epub-toc li {
    margin: 0.75em 0;
}

img {
    max-width: 100%;
    height: auto;
}
""".strip()

def parse_markdown_to_xhtml(text):
    lines = text.split('\n')
    html_lines = []
    in_list = False
    
    for line in lines:
        line = line.strip()
        
        # Handle Lists
        if line.startswith('* '):
            if not in_list:
                html_lines.append('<ul>')
                in_list = True
            content = line[2:]
            # Bold processing inside list
            content = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', content)
            html_lines.append(f'<li>{content}</li>')
            continue
        else:
            if in_list:
                html_lines.append('</ul>')
                in_list = False
        
        if not line:
            continue
            
        # Headers
        if line.startswith('# '):
            content = line[2:]
            html_lines.append(f'<h1>{content}</h1>')
        elif line.startswith('## '):
            content = line[3:]
            html_lines.append(f'<h2>{content}</h2>')
        elif line.startswith('### '):
            content = line[4:]
            html_lines.append(f'<h3>{content}</h3>')
        # HR
        elif line.startswith('---'):
            html_lines.append('<hr />')
        # Normal Paragraphs
        else:
            # Bold processing
            content = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', line)
            html_lines.append(f'<p>{content}</p>')
            
    if in_list:
        html_lines.append('</ul>')
        
    return '\n'.join(html_lines)

def create_xhtml_content(title, body_html, css_filename='style.css'):
    escaped_title = html.escape(title, quote=False)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="ja">
<head>
    <meta charset="UTF-8" />
    <title>{escaped_title}</title>
    <link rel="stylesheet" href="{css_filename}" type="text/css" />
</head>
<body>
    <article class="magazine-article">
        <header class="article-header">
            <span class="scoop-tag">記事</span>
            <h1>{escaped_title}</h1>
        </header>
        {body_html}
    </article>
</body>
</html>"""

def generate_container_xml():
    return """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
    <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
    </rootfiles>
</container>"""

def build_epub_css(base_css):
    """Append EPUB-specific reading rules after the source stylesheet."""
    return f"{base_css.rstrip()}\n\n{EPUB_READING_CSS}\n"

def generate_toc_xhtml(articles, title="異世界ゴシップ誌"):
    toc_items = []
    for filename, art_title, _art_id in articles:
        escaped_title = html.escape(art_title, quote=False)
        escaped_href = html.escape(filename, quote=True)
        toc_items.append(f'        <li><a href="{escaped_href}">{escaped_title}</a></li>')

    escaped_book_title = html.escape(title, quote=False)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="ja">
<head>
    <meta charset="UTF-8" />
    <title>{escaped_book_title} 目次</title>
    <link rel="stylesheet" href="style.css" type="text/css" />
</head>
<body>
    <nav class="epub-toc" epub:type="toc" id="toc">
        <h1>{escaped_book_title} 目次</h1>
        <ol>
{chr(10).join(toc_items)}
        </ol>
    </nav>
</body>
</html>"""

def generate_content_opf(articles, uid, title="異世界ゴシップ誌"):
    # articles is list of (filename, title, id)
    escaped_title = html.escape(title, quote=False)
    modified = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    manifest_items = []
    spine_items = []
    
    # Add standard items
    manifest_items.append('<item id="style" href="style.css" media-type="text/css"/>')
    manifest_items.append('<item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>')
    manifest_items.append('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>')
    spine_items.append('<itemref idref="toc"/>')
    
    for filename, art_title, art_id in articles:
        manifest_items.append(f'<item id="{art_id}" href="{filename}" media-type="application/xhtml+xml"/>')
        spine_items.append(f'<itemref idref="{art_id}"/>')
        
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookID" version="3.0">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
        <dc:title>{escaped_title}</dc:title>
        <dc:language>ja</dc:language>
        <dc:identifier id="BookID">urn:uuid:{uid}</dc:identifier>
        <meta property="dcterms:modified">{modified}</meta>
    </metadata>
    <manifest>
        {chr(10).join(manifest_items)}
    </manifest>
    <spine toc="ncx">
        {chr(10).join(spine_items)}
    </spine>
</package>"""

def generate_toc_ncx(articles, uid, title="異世界ゴシップ誌"):
    escaped_book_title = html.escape(title, quote=False)
    navpoints = []
    for i, (filename, art_title, art_id) in enumerate(articles):
        escaped_title = html.escape(art_title, quote=False)
        escaped_src = html.escape(filename, quote=True)
        navpoints.append(f"""
        <navPoint id="navPoint-{i+1}" playOrder="{i+1}">
            <navLabel>
                <text>{escaped_title}</text>
            </navLabel>
            <content src="{escaped_src}"/>
        </navPoint>""")
        
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
    <head>
        <meta name="dtb:uid" content="urn:uuid:{uid}"/>
        <meta name="dtb:depth" content="1"/>
        <meta name="dtb:totalPageCount" content="0"/>
        <meta name="dtb:maxPageNumber" content="0"/>
    </head>
    <docTitle>
        <text>{escaped_book_title}</text>
    </docTitle>
    <navMap>
        {''.join(navpoints)}
    </navMap>
</ncx>"""

def main():
    root_dir = os.getcwd()
    output_epub = 'isekai_zasshi.epub'
    book_uid = str(uuid.uuid4())
    
    articles = [] # (filename, title, id)
    
    # 1. Collect and Process Markdown Files
    processed_files = [] # (filename, content_bytes)
    
    # Find style.css
    css_content = ""
    if os.path.exists('style.css'):
        with open('style.css', 'r', encoding='utf-8') as f:
            css_content = f.read()
    else:
        # Default CSS if missing
        css_content = "body { font-family: sans-serif; }"
    processed_files.append(('OEBPS/style.css', build_epub_css(css_content).encode('utf-8')))

    file_counter = 1
    # Sort files to ensure stable order, walking can be arbitrary
    all_md_files = []
    for dirpath, dirnames, filenames in os.walk(root_dir):
        if '.git' in dirpath: continue
        for filename in filenames:
             if filename.endswith('.md') and filename not in ['image_prompts.md', 'prompts.md', 'README.md', 'epub_plan.md', 'task.md', 'implementation_plan.md']:
                 all_md_files.append(os.path.join(dirpath, filename))
    
    all_md_files.sort()

    for file_path in all_md_files:
        filename = os.path.basename(file_path)
        with open(file_path, 'r', encoding='utf-8') as f:
            md_content = f.read()
        
        # Extract Title
        title_match = re.search(r'^# (.*)', md_content, re.MULTILINE)
        title = title_match.group(1) if title_match else filename.replace('.md', '')
        
        xhtml_body = parse_markdown_to_xhtml(md_content)
        xhtml_full = create_xhtml_content(title, xhtml_body)
        
        # Use a safe internal filename
        safe_filename = f"article_{file_counter:03d}.xhtml"
        art_id = f"art_{file_counter:03d}"
        
        articles.append((safe_filename, title, art_id))
        processed_files.append((f'OEBPS/{safe_filename}', xhtml_full.encode('utf-8')))
        
        print(f"Processed: {filename} -> {safe_filename}")
        file_counter += 1

    # 2. Generate Control Files
    # Mimetype
    processed_files.append(('mimetype', b'application/epub+zip'))
    
    # Container
    processed_files.append(('META-INF/container.xml', generate_container_xml().encode('utf-8')))
    
    # XHTML table of contents for readers that expose EPUB 3 navigation.
    toc_xhtml_content = generate_toc_xhtml(articles)
    processed_files.append(('OEBPS/toc.xhtml', toc_xhtml_content.encode('utf-8')))
    
    # OPF
    opf_content = generate_content_opf(articles, book_uid)
    processed_files.append(('OEBPS/content.opf', opf_content.encode('utf-8')))
    
    # NCX
    ncx_content = generate_toc_ncx(articles, book_uid)
    processed_files.append(('OEBPS/toc.ncx', ncx_content.encode('utf-8')))
    
    # 3. Create EPUB (Zip)
    with zipfile.ZipFile(output_epub, 'w', zipfile.ZIP_DEFLATED) as epub:
        # Mimetype MUST be first and uncompressed
        epub.writestr('mimetype', b'application/epub+zip', compress_type=zipfile.ZIP_STORED)
        
        # Write other files
        for path, content in processed_files:
            if path == 'mimetype': continue
            epub.writestr(path, content)
            
    print(f"\nSuccessfully created EPUB: {output_epub}")

if __name__ == '__main__':
    main()
