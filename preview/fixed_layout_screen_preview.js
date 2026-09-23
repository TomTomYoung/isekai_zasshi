(() => {
  if (navigator.webdriver) return;

  const PAGE_W = 1456;
  const PAGE_H = 2056;

  function install() {
    const pages = Array.from(document.querySelectorAll(".fixed-page"));
    if (pages.length === 0) return;

    document.documentElement.dataset.fixedLayoutManualPreview = "1";

    const style = document.createElement("style");
    style.id = "fixed-layout-manual-preview-style";
    style.textContent = [
      "html[data-fixed-layout-manual-preview=\"1\"] body{background:#e7f0ff !important;padding-top:42px !important;padding-bottom:64px !important;}",
      "html[data-fixed-layout-manual-preview=\"1\"] .fixed-page{outline:4px solid #1683ff !important;outline-offset:-4px !important;}",
      "html[data-fixed-layout-manual-preview=\"1\"] .fixed-page[data-preview-size-error]{outline-color:#dc2626 !important;}"
    ].join("\n");
    document.head.appendChild(style);

    const badge = document.createElement("div");
    badge.id = "fixed-layout-manual-preview-badge";
    Object.assign(badge.style, {
      position: "fixed",
      top: "10px",
      right: "10px",
      zIndex: "2147483647",
      maxWidth: "420px",
      padding: "8px 11px",
      border: "2px solid #1683ff",
      borderRadius: "7px",
      background: "rgba(239,246,255,.96)",
      color: "#0f172a",
      font: "700 13px/1.35 system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      boxShadow: "0 4px 16px rgba(15,23,42,.18)",
      pointerEvents: "none"
    });
    document.body.appendChild(badge);

    function measure() {
      let bad = 0;
      for (const page of pages) {
        const rect = page.getBoundingClientRect();
        const ok = Math.abs(rect.width - PAGE_W) <= 1 && Math.abs(rect.height - PAGE_H) <= 1;
        if (ok) page.removeAttribute("data-preview-size-error");
        else {
          page.setAttribute("data-preview-size-error", "1");
          bad += 1;
        }
      }

      badge.textContent = bad === 0
        ? "PNG基準プレビュー: " + pages.length + "ページ / 1456×2056 CSS px / 青枠=ページ境界"
        : "サイズ警告: " + bad + "ページが 1456×2056 から外れています / 赤枠を確認";
      badge.style.borderColor = bad === 0 ? "#1683ff" : "#dc2626";
    }

    measure();
    window.addEventListener("resize", measure, { passive: true });
    setTimeout(measure, 300);
    setTimeout(measure, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
