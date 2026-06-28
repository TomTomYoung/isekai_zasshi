async function loadPreview(cssFile) {
  const res = await fetch('../fixed_layout.html');
  if (!res.ok) throw new Error(`fixed_layout.html fetch failed: ${res.status}`);

  const text = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');

  document.title = `${cssFile} - 王都女学院春の制服名鑑`;

  const root = document.getElementById('preview-root');
  root.innerHTML = doc.body.innerHTML;

  document.querySelectorAll('img[data-candidates]').forEach((img) => {
    const list = (img.dataset.candidates || '')
      .split('|')
      .map(s => s.trim())
      .filter(Boolean);

    let index = 0;
    function tryNext() {
      index += 1;
      if (index < list.length) img.src = '../' + list[index].replace(/^\.\//, '');
    }

    img.addEventListener('error', tryNext);
    if (list.length > 0) img.src = '../' + list[0].replace(/^\.\//, '');
  });

  const variantLink = document.createElement('link');
  variantLink.rel = 'stylesheet';
  variantLink.href = cssFile;
  document.head.appendChild(variantLink);
}

window.addEventListener('DOMContentLoaded', async () => {
  const cssFile = document.body.dataset.css;
  try {
    await loadPreview(cssFile);
  } catch (error) {
    document.body.innerHTML = `
      <main style="font-family:sans-serif;padding:24px;background:#fff;min-height:100vh;">
        <h1>CSS Preview Error</h1>
        <p>${String(error.message)}</p>
      </main>
    `;
  }
});
