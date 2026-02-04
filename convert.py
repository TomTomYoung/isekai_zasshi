import os
import re

def parse_markdown(text):
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
            html_lines.append('<hr>')
        # Normal Paragraphs
        else:
            # Bold processing
            content = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', line)
            html_lines.append(f'<p>{content}</p>')
            
    if in_list:
        html_lines.append('</ul>')
        
    return '\n'.join(html_lines)

def convert_file(file_path, root_dir):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract Title (first h1 or just filename)
    title_match = re.search(r'^# (.*)', content, re.MULTILINE)
    title = title_match.group(1) if title_match else os.path.basename(file_path).replace('.md', '')
    
    body_html = parse_markdown(content)
    
    # Determine CSS path relative to file
    rel_path = os.path.relpath(file_path, root_dir)
    depth = rel_path.count(os.sep)
    css_path = '../' * depth + 'style.css' if depth > 0 else 'style.css'
    
    template = f"""<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <link rel="stylesheet" href="{css_path}">
</head>
<body>
    <article>
        <header>
            <span class="scoop-tag">記事</span>
            <h1>{title}</h1>
        </header>
        {body_html}
    </article>
</body>
</html>"""
    
    html_path = file_path.replace('.md', '.html')
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(template)
    
    return title, html_path

def main():
    root_dir = os.getcwd()
    all_files = []
    
    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Skip .git or other hidden dirs
        if '.git' in dirpath:
            continue
            
        for filename in filenames:
            if filename.endswith('.md') and filename != 'image_prompts.md' and filename != 'prompts.md' and filename != 'README.md':
                file_path = os.path.join(dirpath, filename)
                title, html_path = convert_file(file_path, root_dir)
                
                # Store relative path for index
                rel_html_path = os.path.relpath(html_path, root_dir)
                all_files.append((title, rel_html_path))
                print(f"Converted: {filename} -> {os.path.basename(html_path)}")

    # Generate Index (目次.html)
    index_html_lines = [
        '<!DOCTYPE html>',
        '<html lang="ja">',
        '<head>',
        '    <meta charset="UTF-8">',
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0">',
        '    <title>異世界ゴシップ誌 - 目次</title>',
        '    <link rel="stylesheet" href="style.css">',
        '</head>',
        '<body>',
        '    <article>',
        '        <header>',
        '            <span class="scoop-tag">目次</span>',
        '            <h1>異世界ゴシップ誌 記事一覧</h1>',
        '        </header>',
        '        <div class="lead-block">',
        '            <p>本号のラインナップをお届けします。</p>',
        '        </div>',
        '        <ul>'
    ]
    
    for title, path in sorted(all_files):
        index_html_lines.append(f'            <li><a href="{path}"><strong>{title}</strong></a></li>')
        
    index_html_lines.extend([
        '        </ul>',
        '    </article>',
        '</body>',
        '</html>'
    ])
    
    with open('目次.html', 'w', encoding='utf-8') as f:
        f.write('\n'.join(index_html_lines))
    print("Created: 目次.html")

if __name__ == '__main__':
    main()
