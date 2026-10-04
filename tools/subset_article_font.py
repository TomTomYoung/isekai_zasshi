"""Explicitly rebuild the illustrated article's bundled font, never its prose.

python tools/subset_article_font.py /path/to/NotoSansCJKjp-Regular.otf article-dir
Requires fontTools; normal builds only need Node.
"""
import hashlib
import json
from pathlib import Path
import sys
from fontTools import subset
from fontTools.ttLib import TTFont

source, article = map(Path, sys.argv[1:])
config = json.loads((article / 'layout-source.json').read_text())
text = (article / config['source']).read_text() + '異世界丸見え実話現地取材202604月号続0123456789 /'
codepoints = set(map(ord, text)) | set(range(32, 127))
font = TTFont(source)
missing = codepoints - set(font.getBestCmap()) - {10, 13, 9}
if missing:
    raise SystemExit(f'Font lacks source characters: {sorted(missing)}')
options = subset.Options()
options.flavor = 'woff'
options.name_IDs = ['*']
options.name_legacy = True
options.name_languages = ['*']
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=codepoints)
subsetter.subset(font)
# This is a modified subset, named separately from the original family.
for record in font['name'].names:
    if record.nameID in (1, 4, 6, 16):
        record.string = 'IsekaiArticleSubset'.encode(record.getEncoding())
font.flavor = 'woff'
font.recalcTimestamp = False
out = article / 'fonts'
out.mkdir(exist_ok=True)
font.save(out / 'article.woff')
metadata = {
    'family': 'IsekaiArticleSubset',
    'original': 'Noto Sans CJK JP Regular',
    'upstream': 'https://github.com/notofonts/noto-cjk/blob/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf',
    'copyright': '© 2014-2021 Adobe (http://www.adobe.com/).',
    'license': 'SIL Open Font License 1.1 (OFL.txt)',
    'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'sha256': hashlib.sha256((out / 'article.woff').read_bytes()).hexdigest(),
    'codepoints': sorted(font.getBestCmap()),
}
(out / 'font.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
print(f'{out / "article.woff"}: {len(metadata["codepoints"])} codepoints')
