# EPUB Generator Implementation Plan

## Goal
Extend the existing `convert.py` to generate a valid `.epub` file from the Markdown articles.

## Proposed Changes

### 1. Update `convert.py` to output XHTML
The EPUB spec requires compliant XHTML.
- **Change**: Update `parse_markdown` and template strings.
- **Details**: 
    - Change `<hr>` to `<hr />`.
    - Add `xmlns="http://www.w3.org/1999/xhtml"` to the `<html>` tag.
    - Ensure `<meta>` and `<link>` tags are self-closed.

### 2. Implement EPUB Structure Generators
Add functions to generate the required control files based on the scanned files.

#### `generate_mimetype()`
- Creates the `mimetype` file with content `application/epub+zip` (no newline).

#### `generate_container_xml()`
- Creates `META-INF/container.xml` pointing to the OPF file.

#### `generate_content_opf(files, title)`
- Creates `OEBPS/content.opf`.
- **Manifest**: Lists all XHTML files, CSS, and images.
- **Spine**: Defines the linear reading order.

#### `generate_toc_ncx(files, title)`
- Creates `OEBPS/toc.ncx` for the navigation menu.

### 3. Packaging Logic
Add a function `create_epub(output_filename)` that:
1. Creates a temporary directory structure or builds in-memory.
2. Writes all XHTMLs, CSS, and control files.
3. Zips them up using `zipfile`.
    - **CRITICAL**: `mimetype` must be the first file in the archive and stored **uncompressed** (`ZIP_STORED`).
    - All other files can be compressed (`ZIP_DEFLATED`).

## Verification Plan
1. Run `python convert.py`
2. Check if an `.epub` file is generated.
3. (User Action) Open the EPUB in a viewer (Books, Kindle Previewer, Calibre) to verify it opens and displays text/styles correctly.
