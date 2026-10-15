import {makeZip, validateSettings} from './core.mjs';
import {PAGE_CSS} from './renderer.mjs';

export function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
/** Snapshot the confirmed, unscaled DOM. No second pagination or remote renderer. */
export async function pagePng(sheet, settings) {
  validateSettings(settings);
  const clone = sheet.cloneNode(true); clone.querySelectorAll('[data-guide]').forEach(n => n.remove());
  clone.style.transform = 'none'; clone.style.margin = '0'; clone.style.boxShadow = 'none';
  clone.querySelectorAll('a').forEach(n => n.removeAttribute('href'));
  for (const img of clone.querySelectorAll('img')) if (!img.src.startsWith('data:image/png;base64,')) throw new Error('出力画像が自己完結していません');
  const {width, height} = settings.page, scale = settings.export.scale;
  const wrapper = document.createElement('div'); wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  const style = document.createElement('style'); style.textContent = PAGE_CSS; wrapper.append(style, clone);
  const serialized = new XMLSerializer().serializeToString(wrapper);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;
  // A data URL keeps foreignObject rasterization origin-clean in Chromium.
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await Promise.race([img.decode(), new Promise((_, reject) => setTimeout(() => reject(new Error('PNG描画がタイムアウトしました')), 15000))]);
  const canvas = document.createElement('canvas'); canvas.width = width * scale; canvas.height = height * scale;
  const context = canvas.getContext('2d'); if (!context) throw new Error('Canvasを作成できません');
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve, reject) => { try { canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG生成に失敗しました')), 'image/png'); } catch (error) { reject(error); } });
  canvas.width = canvas.height = 1;
  if (blob.size < 100) throw new Error('PNGが空です'); return blob;
}
export async function exportPages(result, currentPage, all, filename, progress = () => {}, isCurrent = () => true) {
  if (result.diagnostics.some(d => d.level === 'error')) throw new Error('紙面のエラーを修正してから出力してください');
  const pages = all ? result.pages : [result.pages[currentPage - 1]], files = []; let total = 0;
  for (const [i, sheet] of pages.entries()) {
    progress(i + 1, pages.length);
    const blob = await pagePng(sheet, result.settings);
    if (!isCurrent()) throw new Error('出力中に原稿・設定が変更されました');
    total += blob.size;
    if (total > 150 * 1024 * 1024) throw new Error('ZIPが150MBを超えました。ページ単位で出力してください');
    files.push({name: `${filename}-${String(all ? i + 1 : currentPage).padStart(3, '0')}.png`, bytes: new Uint8Array(await blob.arrayBuffer())});
  }
  if (!isCurrent()) throw new Error('出力中に原稿・設定が変更されました');
  if (all) download(makeZip(files), `${filename}-pages.zip`);
  else download(new Blob([files[0].bytes], {type: 'image/png'}), files[0].name);
}
