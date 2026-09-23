(() => {
  const PAGE_W = 1456;
  const PAGE_H = 2056;
  const ALLOWED_ISSUE = "202604";

  const fallbackArticles = [
    { label: "00 表紙", src: "../202604/00_表紙/fixed_layout.html" },
    { label: "01 王都女学院春の制服名鑑", src: "../202604/01_王都女学院春の制服名鑑/fixed_layout.html" },
  ];

  const els = {
    articleSelect: document.getElementById("article-select"),
    sourcePath: document.getElementById("source-path"),
    loadButton: document.getElementById("load-button"),
    zoomSelect: document.getElementById("zoom-select"),
    guideToggle: document.getElementById("guide-toggle"),
    directLink: document.getElementById("direct-link"),
    status: document.getElementById("status"),
    workspace: document.getElementById("workspace"),
    stageSizer: document.getElementById("stage-sizer"),
    frame: document.getElementById("preview-frame"),
  };

  let articles = fallbackArticles;
  let contentHeight = PAGE_H;

  function setStatus(message, isError = false) {
    els.status.textContent = message;
    els.status.style.color = isError ? "#b91c1c" : "";
    els.status.style.fontWeight = isError ? "800" : "";
  }

  function sourceUrl(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) throw new Error("fixed_layout.html のパスが空です。");

    const url = new URL(trimmed, window.location.href);
    if (window.location.protocol !== "file:" && url.origin !== window.location.origin) {
      throw new Error("同一サイト内の fixed_layout.html だけを表示できます。");
    }

    const decodedPath = decodeURIComponent(url.pathname);
    if (!decodedPath.includes("/" + ALLOWED_ISSUE + "/") || !decodedPath.endsWith("/fixed_layout.html")) {
      throw new Error(ALLOWED_ISSUE + " 配下の fixed_layout.html だけを表示対象にしています。");
    }
    return url;
  }

  function selectedScale() {
    const value = els.zoomSelect.value;
    if (value !== "auto") return Number(value);
    const available = Math.max(240, els.workspace.clientWidth - 48);
    return Math.min(1, available / PAGE_W);
  }

  function applyScale() {
    const scale = selectedScale();
    els.frame.style.transform = "scale(" + scale + ")";
    els.frame.style.height = contentHeight + "px";
    els.stageSizer.style.width = Math.ceil(PAGE_W * scale) + "px";
    els.stageSizer.style.height = Math.ceil(contentHeight * scale) + "px";
  }

  function injectGuide(doc) {
    let style = doc.getElementById("fixed-layout-pages-preview-guide");
    if (!style) {
      style = doc.createElement("style");
      style.id = "fixed-layout-pages-preview-guide";
      doc.head.appendChild(style);
    }

    style.textContent = els.guideToggle.checked
      ? [
          ".fixed-page{outline:4px solid #1683ff !important;outline-offset:-4px !important;}",
          ".fixed-page{margin-bottom:32px !important;}",
          ".fixed-page[data-preview-size-error]{outline-color:#dc2626 !important;}"
        ].join("\n")
      : ".fixed-page{margin-bottom:32px !important;}";
  }

  function measureFrame() {
    try {
      const doc = els.frame.contentDocument;
      if (!doc) return;

      injectGuide(doc);
      const pages = Array.from(doc.querySelectorAll(".fixed-page"));
      if (pages.length === 0) {
        setStatus(".fixed-page が見つかりません。", true);
        return;
      }

      let bad = 0;
      for (const page of pages) {
        const rect = page.getBoundingClientRect();
        const ok = Math.abs(rect.width - PAGE_W) <= 1 && Math.abs(rect.height - PAGE_H) <= 1;
        if (ok) {
          page.removeAttribute("data-preview-size-error");
        } else {
          page.setAttribute("data-preview-size-error", "1");
          bad += 1;
        }
      }

      contentHeight = Math.max(
        PAGE_H,
        doc.documentElement.scrollHeight,
        doc.body ? doc.body.scrollHeight : 0
      );
      applyScale();

      if (bad > 0) {
        setStatus(pages.length + "ページ / " + bad + "ページが 1456×2056 から外れています。赤枠を確認してください。", true);
      } else {
        setStatus(pages.length + "ページ / 全ページ 1456×2056 CSS px");
      }
    } catch (error) {
      setStatus("プレビュー計測に失敗: " + error.message, true);
    }
  }

  function loadSource(value, updateUrl = true) {
    try {
      const url = sourceUrl(value);
      els.sourcePath.value = value;
      els.directLink.href = url.href;
      els.frame.src = url.href;
      setStatus("読み込み中: " + value);

      if (updateUrl) {
        const params = new URLSearchParams(window.location.search);
        params.set("src", value);
        history.replaceState(null, "", window.location.pathname + "?" + params.toString());
      }
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  function renderArticleOptions() {
    els.articleSelect.innerHTML = "";
    for (const article of articles) {
      const option = document.createElement("option");
      option.value = article.src;
      option.textContent = article.label;
      els.articleSelect.appendChild(option);
    }
  }

  async function loadManifest() {
    try {
      const response = await fetch("./articles.json", { cache: "no-store" });
      if (!response.ok) throw new Error("manifest HTTP " + response.status);
      const data = await response.json();
      if (Array.isArray(data.articles) && data.articles.length > 0) {
        articles = data.articles;
      }
    } catch (error) {
      console.warn("articles.json fallback:", error);
    }
    renderArticleOptions();
  }

  els.frame.addEventListener("load", () => {
    requestAnimationFrame(() => {
      measureFrame();
      setTimeout(measureFrame, 300);
      setTimeout(measureFrame, 1200);
    });
  });

  els.loadButton.addEventListener("click", () => loadSource(els.sourcePath.value));
  els.sourcePath.addEventListener("keydown", event => {
    if (event.key === "Enter") loadSource(els.sourcePath.value);
  });
  els.articleSelect.addEventListener("change", () => loadSource(els.articleSelect.value));
  els.zoomSelect.addEventListener("change", applyScale);
  els.guideToggle.addEventListener("change", measureFrame);
  window.addEventListener("resize", () => {
    if (els.zoomSelect.value === "auto") applyScale();
  });

  (async () => {
    await loadManifest();
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("src");
    const initial = requested || (articles[0] && articles[0].src) || "";
    if (initial) {
      const matched = Array.from(els.articleSelect.options).find(option => option.value === initial);
      if (matched) els.articleSelect.value = initial;
      loadSource(initial, Boolean(requested));
    }
  })();
})();
