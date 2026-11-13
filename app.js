(() => {
  "use strict";

  const STORAGE_KEY_CUSTOM_VERSES = "quranic_sfl_custom_verses_v6";
  const STORAGE_KEY_IMPORTED_DATASET = "quranic_sfl_imported_dataset_v6";
  const STORAGE_KEY_DYNAMIC_KNOWLEDGE = "quranic_lsf_dynamic_knowledge_v1";
  const STORAGE_KEY_ARABIC_TERMS = "quranic_lsf_show_arabic_terms_v1";

  const VALID_PROCESSES = ["Material", "Mental", "Relational", "Verbal", "Behavioural", "Existential"];
  const VALID_SPEECH = ["Deklaratif", "Imperatif", "Interogatif", "Doa"];
  const VALID_THEMES = ["Unmarked", "Marked", "Multiple"];

  const PROCESS_AR_MAP = {
    Material: "العملية المادية",
    Mental: "العملية العقلية / الذهنية",
    Relational: "العملية العلاقاتية",
    Verbal: "العملية اللفظية",
    Behavioural: "العملية السلوكية",
    Existential: "العملية الوجودية"
  };

  const PROCESS_BAR_COLORS = {
    Material: "bg-emerald-600",
    Mental: "bg-sky-600",
    Relational: "bg-teal-600",
    Verbal: "bg-indigo-600",
    Behavioural: "bg-amber-500",
    Existential: "bg-purple-600"
  };

  // App State
  let dataset = cloneObject(window.QURANIC_SFL_DEFAULT_DATA || { metadata: { references: [], methodologyMatrix: [] }, taxonomy: {}, verses: {} });
  const kemenagCorpus = window.QURAN_KEMENAG_FULL || { totalSurah: 0, totalAyat: 0, surahs: [] };
  const tafsirCache = (window.QURAN_TAFSIR_KEMENAG_FULL && window.QURAN_TAFSIR_KEMENAG_FULL.tafsir) || cloneObject(window.QURAN_PRELOADED_TAFSIR || {});
  const ibnKathirInflight = {};

  let activePillar = "sfl"; // "mushaf" | "sfl" | "tafsir"
  let currentVerseKey = "1:2";
  let activeVerseObj = null; // May be curated or heuristic draft
  let currentMetaTab = "ideational";
  let filteredKeys = [];
  let isCompareMode = false;
  let isAnalyticsOpen = false;
  let showArabicTerms = true;
  let activeMushafSurah = 1;
  let studioTafsirFilter = "all";
  let currentKtmContext = { surah: 1, ayah: 1 };
  let audioCtx = null;

  // Helpers
  function cloneObject(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Format teks Al-Qur'an Kemenag agar tanda waqaf (U+06D6..U+06DC) terpisah rapi dan tidak menumpuk kata/badge. */
  function formatQuranArabicHtml(str, darkBg = false) {
    const safe = escapeHtml(str || "");
    const cls = darkBg ? "waqf-mark-light" : "waqf-mark";
    return safe.replace(/([\u06D6-\u06DC])/g, `<span class="${cls}" title="Tanda Waqaf">$1</span>`);
  }

  function showToast(msg, isError = false) {
    const toast = document.createElement("div");
    toast.className = `fixed bottom-5 right-5 ${isError ? "bg-rose-700" : "bg-emerald-800"} text-white text-xs px-4 py-2.5 rounded-lg shadow-xl z-50 transition`;
    toast.innerHTML = `<span class="font-bold">${isError ? "!" : "✓"}</span> ${escapeHtml(msg)}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
  }

  function playHarmonicTone(freq = 523.25) {
    try {
      if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) audioCtx = new AudioContextClass();
      }
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
      if (!audioCtx) return;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } catch (_) {
      // Safe fallback
    }
  }

  // DOM References
  const el = {
    navMushaf: document.getElementById("nav-pillar-mushaf"),
    navSfl: document.getElementById("nav-pillar-sfl"),
    navTafsir: document.getElementById("nav-pillar-tafsir"),
    pillarMushaf: document.getElementById("pillar-mushaf"),
    pillarSfl: document.getElementById("pillar-sfl"),
    pillarTafsir: document.getElementById("pillar-tafsir"),

    // Mushaf Directory
    mushafSearchSurah: document.getElementById("mushaf-search-surah"),
    mushafFilterRevelation: document.getElementById("mushaf-filter-revelation"),
    mushafFilterCount: document.getElementById("mushaf-filter-count"),
    mushafSurahGrid: document.getElementById("mushaf-surah-grid"),
    mushafSurahDetail: document.getElementById("mushaf-surah-detail"),
    mushafDetailNum: document.getElementById("mushaf-detail-num"),
    mushafDetailRev: document.getElementById("mushaf-detail-rev"),
    mushafDetailTitle: document.getElementById("mushaf-detail-title"),
    mushafDetailDesc: document.getElementById("mushaf-detail-desc"),
    mushafDetailArabic: document.getElementById("mushaf-detail-arabic"),
    mushafFromAyah: document.getElementById("mushaf-from-ayah"),
    mushafToAyah: document.getElementById("mushaf-to-ayah"),
    btnMushafApplyRange: document.getElementById("btn-mushaf-apply-range"),
    chkMushafTranslit: document.getElementById("chk-mushaf-translit"),
    chkMushafTranslation: document.getElementById("chk-mushaf-translation"),
    btnHeroOpenMushaf: document.getElementById("btn-hero-open-mushaf"),
    btnHeroOpenStudio: document.getElementById("btn-hero-open-studio"),
    btnKpiMushaf: document.getElementById("btn-kpi-mushaf"),
    btnKpiLsf: document.getElementById("btn-kpi-lsf"),
    btnKpiTafsir: document.getElementById("btn-kpi-tafsir"),
    btnKpiActiveVerse: document.getElementById("btn-kpi-active-verse"),
    sflActiveVerseSection: document.getElementById("sfl-active-verse-section"),
    sflDiagramSection: document.getElementById("sfl-diagram-section"),
    kpiActiveRef: document.getElementById("kpi-active-ref"),
    kpiActiveProcess: document.getElementById("kpi-active-process"),
    mushafAyahsList: document.getElementById("mushaf-ayahs-list"),

    // Quick Jump in LSF
    quickSurahSelect: document.getElementById("quick-surah-select"),
    quickAyahSelect: document.getElementById("quick-ayah-select"),
    btnQuickLoadAyah: document.getElementById("btn-quick-load-ayah"),
    btnSaveHeuristicVerse: document.getElementById("btn-save-heuristic-verse"),
    badgeHeuristicMode: document.getElementById("badge-heuristic-mode"),
    btnJumpToTafsirComp: document.getElementById("btn-jump-to-tafsir-comp"),

    // LSF Navigation & Display
    sourceRefLabel: document.getElementById("source-ref-label"),
    btnPrev: document.getElementById("btn-prev-verse"),
    btnNext: document.getElementById("btn-next-verse"),

    badgeVerseRef: document.getElementById("badge-verse-ref"),
    badgeProcessPill: document.getElementById("badge-process-pill"),
    badgeSpeechPill: document.getElementById("badge-speech-pill"),
    badgeThemePill: document.getElementById("badge-theme-pill"),
    arabicText: document.getElementById("arabic-text"),
    translitText: document.getElementById("transliteration-text"),
    translationText: document.getElementById("translation-text"),
    tokensContainer: document.getElementById("tokens-container"),
    tokenInspector: document.getElementById("token-inspector"),
    tokDetailAr: document.getElementById("tok-detail-ar"),
    tokDetailRoot: document.getElementById("tok-detail-root"),
    tokDetailPos: document.getElementById("tok-detail-pos"),
    tokDetailRole: document.getElementById("tok-detail-role"),
    tokDetailRoleAr: document.getElementById("tok-detail-role-ar"),

    diagRowArabic: document.getElementById("diagram-row-arabic"),
    diagRowIdeational: document.getElementById("diagram-row-ideational"),
    diagRowInterpersonal: document.getElementById("diagram-row-interpersonal"),
    diagRowTextual: document.getElementById("diagram-row-textual"),

    tabIdeational: document.getElementById("tab-ideational"),
    tabInterpersonal: document.getElementById("tab-interpersonal"),
    tabTextual: document.getElementById("tab-textual"),
    tabBridge: document.getElementById("tab-bridge"),
    tabVerseTafsir: document.getElementById("tab-verse-tafsir"),
    panelIdeational: document.getElementById("panel-ideational"),
    panelInterpersonal: document.getElementById("panel-interpersonal"),
    panelTextual: document.getElementById("panel-textual"),
    panelBridge: document.getElementById("panel-bridge"),
    panelVerseTafsir: document.getElementById("panel-verse-tafsir"),
    verseKemenagTafsirBox: document.getElementById("verse-kemenag-tafsir-box"),
    verseIbnKatsirEnBox: document.getElementById("verse-ibnkatsir-en-box"),
    verseIbnKatsirArBox: document.getElementById("verse-ibnkatsir-ar-box"),
    btnOpenFullTafsirStudio: document.getElementById("btn-open-full-tafsir-studio"),

    clausesBreakdownContainer: document.getElementById("clauses-breakdown-container"),

    // Studio Perbandingan LSF vs Tafsir (Full 114 Surat & 6.236 Ayat)
    studioSurahSelect: document.getElementById("studio-surah-select"),
    studioAyahSelect: document.getElementById("studio-ayah-select"),
    btnStudioPrev: document.getElementById("btn-studio-prev"),
    btnStudioNext: document.getElementById("btn-studio-next"),
    btnStudioNewWindow: document.getElementById("btn-studio-new-window"),
    studioVerseRef: document.getElementById("studio-verse-ref"),
    studioVerseTags: document.getElementById("studio-verse-tags"),
    studioVerseArabic: document.getElementById("studio-verse-arabic"),
    studioVerseTranslation: document.getElementById("studio-verse-translation"),
    studioLsfIdeational: document.getElementById("studio-lsf-ideational"),
    studioLsfInterpersonal: document.getElementById("studio-lsf-interpersonal"),
    studioLsfTextual: document.getElementById("studio-lsf-textual"),
    studioLsfBridge: document.getElementById("studio-lsf-bridge"),
    studioTafsirCards: document.getElementById("studio-tafsir-cards"),
    studioKemenagFulltext: document.getElementById("studio-kemenag-fulltext"),
    studioIbnKatsirEn: document.getElementById("studio-ibnkatsir-en"),
    studioIbnKatsirAr: document.getElementById("studio-ibnkatsir-ar"),
    studioSynthesisText: document.getElementById("studio-synthesis-text"),
    methodologyMatrixBody: document.getElementById("methodology-matrix-body"),

    // Header Actions
    btnToggleArabicTerms: document.getElementById("btn-toggle-arabic-terms"),
    labelArabicTerms: document.getElementById("label-arabic-terms"),
    btnToggleAnalytics: document.getElementById("btn-toggle-analytics"),
    btnAnalyticsNewWindow: document.getElementById("btn-analytics-new-window"),
    btnCloseAnalytics: document.getElementById("btn-close-analytics"),
    sectionAnalytics: document.getElementById("section-analytics"),
    analyticsTotalVerses: document.getElementById("analytics-total-verses"),
    analyticsLiveBars: document.getElementById("analytics-live-bars"),
    analyticsBenchmarkBars: document.getElementById("analytics-benchmark-bars"),

    btnToggleCompare: document.getElementById("btn-toggle-compare"),
    btnCompareNewWindow: document.getElementById("btn-compare-new-window"),
    btnCloseComparison: document.getElementById("btn-close-comparison"),
    labelCompareBtn: document.getElementById("label-compare-btn"),
    sectionComparison: document.getElementById("section-comparison"),
    compareSurahA: document.getElementById("compare-surah-a"),
    compareAyahA: document.getElementById("compare-ayah-a"),
    compareSurahB: document.getElementById("compare-surah-b"),
    compareAyahB: document.getElementById("compare-ayah-b"),
    compareArabicA: document.getElementById("compare-arabic-a"),
    compareTransA: document.getElementById("compare-trans-a"),
    compareProcA: document.getElementById("compare-proc-a"),
    compareSpeechA: document.getElementById("compare-speech-a"),
    compareThemeA: document.getElementById("compare-theme-a"),
    compareArabicB: document.getElementById("compare-arabic-b"),
    compareTransB: document.getElementById("compare-trans-b"),
    compareProcB: document.getElementById("compare-proc-b"),
    compareSpeechB: document.getElementById("compare-speech-b"),
    compareThemeB: document.getElementById("compare-theme-b"),
    compareSynthesisText: document.getElementById("compare-synthesis-text"),

    // Modals
    theoryModal: document.getElementById("theory-modal"),
    btnInfoToggle: document.getElementById("btn-info-toggle"),
    btnTheoryNewWindow: document.getElementById("btn-theory-new-window"),
    btnCloseModal: document.getElementById("btn-close-modal"),
    btnCloseModalBottom: document.getElementById("btn-close-modal-bottom"),
    glossaryContent: document.getElementById("glossary-content"),
    referencesList: document.getElementById("references-list"),
    theorySyncText: document.getElementById("theory-sync-text"),
    btnSyncKnowledgeNow: document.getElementById("btn-sync-knowledge-now"),
    glossaryDynamicBadge: document.getElementById("glossary-dynamic-badge"),
    refsDynamicBadge: document.getElementById("refs-dynamic-badge"),

    kemenagTafsirModal: document.getElementById("kemenag-tafsir-modal"),
    btnKtmNewWindow: document.getElementById("btn-ktm-new-window"),
    ktmTitle: document.getElementById("ktm-title"),
    ktmArabic: document.getElementById("ktm-arabic"),
    ktmTranslit: document.getElementById("ktm-translit"),
    ktmTranslation: document.getElementById("ktm-translation"),
    ktmTabKemenag: document.getElementById("ktm-tab-kemenag"),
    ktmTabIbnKatsir: document.getElementById("ktm-tab-ibnkatsir"),
    ktmPanelKemenag: document.getElementById("ktm-panel-kemenag"),
    ktmPanelIbnKatsir: document.getElementById("ktm-panel-ibnkatsir"),
    ktmBody: document.getElementById("ktm-body"),
    ktmIkEn: document.getElementById("ktm-ik-en"),
    ktmIkAr: document.getElementById("ktm-ik-ar"),
    btnCloseKtm: document.getElementById("btn-close-ktm"),
    btnCloseKtmBottom: document.getElementById("btn-close-ktm-bottom"),
    btnKtmAnalyzeSfl: document.getElementById("btn-ktm-analyze-sfl"),
    btnKtmCompare: document.getElementById("btn-ktm-compare"),

    // 6 LSF Processes & Kitab Reference Modal
    lsfProcessModal: document.getElementById("lsf-process-modal"),
    lsfModalPill: document.getElementById("lsf-modal-pill"),
    lsfModalArTitle: document.getElementById("lsf-modal-ar-title"),
    lsfModalTitle: document.getElementById("lsf-modal-title"),
    lsfModalSubtitle: document.getElementById("lsf-modal-subtitle"),
    lsfProcessModalBody: document.getElementById("lsf-process-modal-body"),
    btnCloseProcessModal: document.getElementById("btn-close-process-modal"),
    btnCloseProcessModalBottom: document.getElementById("btn-close-process-modal-bottom"),
    btnProcessNewWindow: document.getElementById("btn-process-new-window"),

    addVerseModal: document.getElementById("add-verse-modal"),
    btnAddVerseModal: document.getElementById("btn-add-verse-modal"),
    btnCloseAddModal: document.getElementById("btn-close-add-modal"),
    btnCancelAdd: document.getElementById("btn-cancel-add"),
    formAddVerse: document.getElementById("form-add-verse")
  };

  // Normalisasi teks judul Arab agar seluruh glif kompatibel dengan font Khot Diwani Biasa
  function formatDiwaniArabic(str) {
    return String(str || "").replace(/\u06e4/g, "\u0653");
  }

  // Konversi angka Latin ke angka Arab-Indik (١, ٢, ٣, dst.)
  function toArabicIndicDigits(num) {
    const map = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
    return String(num).replace(/\d/g, (d) => map[Number(d)]);
  }

  // Standalone Window Helper ("Buka di Jendela Baru")
  function openStandaloneWindow(title, bodyHtml, subtitle = "Quranic LSF & Tafsir Explorer") {
    const win = window.open("", "_blank", "width=1100,height=780,scrollbars=yes,resizable=yes");
    if (!win) {
      showToast("Popup diblokir browser — izinkan jendela baru untuk membuka tampilan terpisah.", true);
      return null;
    }
    const htmlDoc = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — Quranic LSF</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Scheherazade+New:wght@400;700&family=Noto+Naskh+Arabic:wght@400;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; background: #fbf7ef; color: #1e293b; }
    .font-arabic { font-family: 'Scheherazade New', 'Noto Naskh Arabic', serif; }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body class="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
  <header class="bg-gradient-to-r from-emerald-950 via-teal-900 to-emerald-900 text-white rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3 shadow-sm border border-amber-400/50">
    <div>
      <span class="text-[11px] uppercase tracking-wider text-amber-300 font-bold">${escapeHtml(subtitle)}</span>
      <h1 class="text-xl font-bold mt-0.5">${escapeHtml(title)}</h1>
    </div>
    <div class="flex gap-2 no-print">
      <button onclick="window.print()" class="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-xl text-xs">Cetak / PDF</button>
      <button onclick="window.close()" class="px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white font-semibold rounded-xl text-xs">Tutup Jendela</button>
    </div>
  </header>
  <main class="space-y-4">${bodyHtml}</main>
</body>
</html>`;
    win.document.open();
    win.document.write(htmlDoc);
    win.document.close();
    win.focus();
    return win;
  }

  // =========================================================================
  // PILLAR NAVIGATION
  // =========================================================================
  function setPillar(name, shouldScroll = false) {
    activePillar = name;
    const map = [
      { key: "mushaf", btn: el.navMushaf, sec: el.pillarMushaf },
      { key: "sfl", btn: el.navSfl, sec: el.pillarSfl },
      { key: "tafsir", btn: el.navTafsir, sec: el.pillarTafsir }
    ];
    let targetSec = null;
    map.forEach((item) => {
      const isActive = item.key === name;
      item.btn.className = `pillar-btn w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold transition flex items-center gap-2.5 text-left ${
        isActive
          ? "bg-gradient-to-r from-emerald-700 to-teal-700 text-white shadow-sm"
          : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-900"
      }`;
      item.sec.classList.toggle("hidden", !isActive);
      if (isActive) targetSec = item.sec;
    });

    if (name === "tafsir") {
      renderTafsirStudio();
    }
    if (shouldScroll && targetSec) {
      targetSec.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  el.navMushaf.addEventListener("click", () => setPillar("mushaf", true));
  el.navSfl.addEventListener("click", () => setPillar("sfl", true));
  el.navTafsir.addEventListener("click", () => setPillar("tafsir", true));
  if (el.btnHeroOpenMushaf) el.btnHeroOpenMushaf.addEventListener("click", () => setPillar("mushaf", true));
  if (el.btnHeroOpenStudio) el.btnHeroOpenStudio.addEventListener("click", () => setPillar("tafsir", true));
  if (el.btnKpiMushaf) el.btnKpiMushaf.addEventListener("click", () => setPillar("mushaf", true));
  if (el.btnKpiLsf) {
    el.btnKpiLsf.addEventListener("click", () => {
      setPillar("sfl", false);
      if (el.sflDiagramSection) {
        el.sflDiagramSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }
  if (el.btnKpiTafsir) el.btnKpiTafsir.addEventListener("click", () => setPillar("tafsir", true));
  if (el.btnKpiActiveVerse) {
    el.btnKpiActiveVerse.addEventListener("click", () => {
      setPillar("sfl", false);
      if (el.sflActiveVerseSection) {
        el.sflActiveVerseSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }
  el.btnJumpToTafsirComp.addEventListener("click", () => setPillar("tafsir", true));
  el.btnOpenFullTafsirStudio.addEventListener("click", () => setPillar("tafsir", true));

  // =========================================================================
  // KEMENAG & IBNU KATSIR TAFSIR LOADERS (Full 114-Surah Offline + Lazy Chunks)
  // =========================================================================
  async function getKemenagTafsirForVerse(surahNum, ayahNum) {
    const sKey = String(surahNum);
    const aKey = String(ayahNum);
    const cached = tafsirCache[sKey] || tafsirCache[surahNum];
    if (cached && (cached[aKey] || cached[ayahNum])) {
      return cached[aKey] || cached[ayahNum];
    }
    try {
      const res = await fetch(`https://equran.id/api/v2/tafsir/${surahNum}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const map = {};
      ((json && json.data && json.data.tafsir) || []).forEach((item) => {
        map[String(item.ayat)] = item.teks;
      });
      tafsirCache[sKey] = map;
      return map[aKey] || "Tafsir Kemenag untuk ayat ini tidak tersedia.";
    } catch (_) {
      return "Tafsir Tahlili Kemenag RI untuk ayat ini belum termuat (pastikan file quran-tafsir-kemenag-full.js berada di folder yang sama).";
    }
  }

  function loadIbnKathirSurahChunk(surahNum) {
    const cache = (window.QURAN_TAFSIR_IK_CACHE = window.QURAN_TAFSIR_IK_CACHE || {});
    if (cache[surahNum]) return Promise.resolve(cache[surahNum]);
    if (ibnKathirInflight[surahNum]) return ibnKathirInflight[surahNum];

    ibnKathirInflight[surahNum] = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = `./tafsir-ik/${surahNum}.js`;
      script.async = true;
      script.onload = () => resolve(cache[surahNum] || { ar: {}, en: {} });
      script.onerror = async () => {
        try {
          const [arRes, enRes] = await Promise.all([
            fetch(`https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/ar-tafsir-ibn-kathir/${surahNum}.json`),
            fetch(`https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/en-tafisr-ibn-kathir/${surahNum}.json`)
          ]);
          const arJson = arRes.ok ? await arRes.json() : [];
          const enJson = enRes.ok ? await enRes.json() : [];
          const arObj = {};
          const enObj = {};
          (Array.isArray(arJson) ? arJson : arJson.ayahs || []).forEach((it) => {
            if (it && it.ayah != null) arObj[String(it.ayah)] = it.text || "";
          });
          (Array.isArray(enJson) ? enJson : enJson.ayahs || []).forEach((it) => {
            if (it && it.ayah != null) enObj[String(it.ayah)] = it.text || "";
          });
          cache[surahNum] = { s: surahNum, ar: arObj, en: enObj };
          resolve(cache[surahNum]);
        } catch (_) {
          resolve({ s: surahNum, ar: {}, en: {} });
        }
      };
      document.head.appendChild(script);
    });
    return ibnKathirInflight[surahNum];
  }

  let ibnKatsirLang = (() => {
    try {
      return localStorage.getItem("quran_sfl_ik_lang") === "en" ? "en" : "id";
    } catch (_) {
      return "id";
    }
  })();
  const ibnKatsirIdCache = (() => {
    try {
      return JSON.parse(localStorage.getItem("quran_sfl_ik_id_cache") || "{}");
    } catch (_) {
      return {};
    }
  })();

  function offlineTranslateIbnKathirToId(enText) {
    if (!enText) return "Uraian Tafsir Ibnu Katsir untuk ayat ini tidak tersedia.";
    const pairs = [
      [/\bThe Meaning of\b/gi, "Makna"],
      [/\bAllah, the Exalted,?\s*said\b/gi, "Allah Ta'ala berfirman"],
      [/\bAllah the Exalted\b/gi, "Allah Yang Maha Tinggi"],
      [/\bAllah said\b/gi, "Allah berfirman"],
      [/\bMessenger of Allah\b/gi, "Rasulullah ﷺ"],
      [/\bThe Prophet\b/gi, "Nabi ﷺ"],
      [/\bAbu Ja`?far bin Jarir said\b/gi, "Abu Ja'far bin Jarir (Ath-Thabari) berkata"],
      [/\bIbn [`']?Abbas said\b/gi, "Ibnu Abbas berkata"],
      [/\bAl-Bukhari recorded\b/gi, "Al-Bukhari meriwayatkan"],
      [/\bMuslim recorded\b/gi, "Muslim meriwayatkan"],
      [/\bImam Ahmad recorded\b/gi, "Imam Ahmad meriwayatkan"],
      [/\bAt-Tirmidhi recorded\b/gi, "At-Tirmidzi meriwayatkan"],
      [/\ball praise and thanks be to Allah\b/gi, "segala puji dan syukur hanya bagi Allah"],
      [/\bLord of the worlds\b/gi, "Tuhan seluruh alam"],
      [/\bThis means\b/gi, "Hal ini bermakna"],
      [/\bwhich means\b/gi, "yang berarti"],
      [/\bHe said\b/gi, "Beliau berkata"],
      [/\bsaid:\s*/gi, "berkata: "],
      [/\bThis Ayah\b/gi, "Ayat ini"],
      [/\bThis Surah\b/gi, "Surat ini"],
      [/\bDay of Resurrection\b/gi, "Hari Kiamat"],
      [/\bthe Hereafter\b/gi, "akhirat"],
      [/\bParadise\b/gi, "Surga"],
      [/\bHellfire\b/gi, "Neraka"],
      [/\brighteous deeds\b/gi, "amal saleh"],
      [/\bthe believers\b/gi, "orang-orang beriman"],
      [/\bthe disbelievers\b/gi, "orang-orang kafir"],
      [/\bguidance\b/gi, "petunjuk (hidayah)"],
      [/\bstraight path\b/gi, "jalan yang lurus"],
      [/\bmercy\b/gi, "rahmat"]
    ];
    let out = String(enText);
    pairs.forEach(([re, rep]) => {
      out = out.replace(re, rep);
    });
    return out;
  }

  async function translateChunkEnToId(chunkText) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 3600) : null;
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=id&dt=t&q=${encodeURIComponent(chunkText)}`;
      const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
      return data[0].map((part) => (part && part[0] ? part[0] : "")).join("");
    } catch (_) {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function resolveIbnKathirId(surahNum, ayahNum, enText) {
    const key = `${surahNum}:${ayahNum}`;
    if (ibnKatsirIdCache[key]) return ibnKatsirIdCache[key];
    if (!enText || enText.startsWith("Uraian Tafsir Ibnu Katsir")) {
      return "Uraian Tafsir Ibnu Katsir untuk ayat ini tidak tersedia.";
    }

    const paragraphs = String(enText).split(/\n+/);
    const chunks = [];
    let current = "";
    paragraphs.forEach((p) => {
      const next = current ? `${current}\n${p}` : p;
      if (next.length > 1450 && current) {
        chunks.push(current);
        current = p.slice(0, 1450);
      } else {
        current = next;
      }
    });
    if (current) chunks.push(current);

    const translatedParts = await Promise.all(chunks.slice(0, 3).map((ch) => translateChunkEnToId(ch)));
    const okParts = translatedParts.filter((x) => typeof x === "string" && x.trim().length > 0);

    let resultId = "";
    if (okParts.length === Math.min(chunks.length, 3) && okParts.length > 0) {
      const remainder = chunks.slice(3).map(offlineTranslateIbnKathirToId);
      resultId = [...okParts, ...remainder].join("\n\n").trim();
      try {
        ibnKatsirIdCache[key] = resultId;
        const keys = Object.keys(ibnKatsirIdCache);
        if (keys.length > 60) delete ibnKatsirIdCache[keys[0]];
        localStorage.setItem("quran_sfl_ik_id_cache", JSON.stringify(ibnKatsirIdCache));
      } catch (_) {
        // Ignore storage quota errors
      }
    } else {
      resultId = offlineTranslateIbnKathirToId(enText);
    }
    return resultId;
  }

  function getIbnKathirDisplayText(ikData) {
    if (!ikData) return "Memuat Tafsir Ibnu Katsir...";
    return ibnKatsirLang === "en" ? (ikData.en || "Tafsir Ibn Kathir in English is unavailable for this ayah.") : (ikData.id || offlineTranslateIbnKathirToId(ikData.en));
  }

  async function getIbnKathirTafsirForVerse(surahNum, ayahNum) {
    const chunk = await loadIbnKathirSurahChunk(Number(surahNum));
    const aKey = String(ayahNum);
    const en = (chunk && chunk.en && chunk.en[aKey]) || "Uraian Tafsir Ibnu Katsir untuk ayat ini tidak tersedia.";
    const ar = (chunk && chunk.ar && chunk.ar[aKey]) || "النص العربي لتفسير ابن كثير غير متاح لهذه الآية.";
    const cachedId = ibnKatsirIdCache[`${surahNum}:${ayahNum}`];
    const id = ibnKatsirLang === "id" ? await resolveIbnKathirId(surahNum, ayahNum, en) : cachedId || offlineTranslateIbnKathirToId(en);
    return { en, ar, id };
  }

  function syncIbnKatsirLangButtons() {
    document.querySelectorAll(".ik-lang-btn").forEach((btn) => {
      const active = btn.getAttribute("data-ik-lang") === ibnKatsirLang;
      btn.className = active
        ? "ik-lang-btn px-2.5 py-0.5 rounded-md bg-amber-600 text-white transition"
        : "ik-lang-btn px-2.5 py-0.5 rounded-md text-amber-900 hover:bg-amber-200/70 transition";
    });
  }

  async function setIbnKatsirLang(lang) {
    ibnKatsirLang = lang === "en" ? "en" : "id";
    try {
      localStorage.setItem("quran_sfl_ik_lang", ibnKatsirLang);
    } catch (_) {}
    syncIbnKatsirLangButtons();

    const tasks = [];
    if (el.kemenagTafsirModal && !el.kemenagTafsirModal.classList.contains("hidden") && currentKtmContext.surah) {
      tasks.push(
        getIbnKathirTafsirForVerse(currentKtmContext.surah, currentKtmContext.ayah).then((ikData) => {
          if (el.ktmIkEn) el.ktmIkEn.textContent = getIbnKathirDisplayText(ikData);
        })
      );
    }
    const v = activeVerseObj || dataset.verses[currentVerseKey];
    if (v && v.surah && v.verse) {
      tasks.push(
        getIbnKathirTafsirForVerse(v.surah, v.verse).then((ikData) => {
          if (el.verseIbnKatsirEnBox) el.verseIbnKatsirEnBox.textContent = getIbnKathirDisplayText(ikData);
          if (el.studioIbnKatsirEn) el.studioIbnKatsirEn.textContent = getIbnKathirDisplayText(ikData);
          if (activePillar === "tafsir") renderStudioTafsirCards(v, ikData);
        })
      );
    }
    await Promise.all(tasks);
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".ik-lang-btn");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const chosen = btn.getAttribute("data-ik-lang") || "id";
    setIbnKatsirLang(chosen).then(() => {
      const v = activeVerseObj || dataset.verses[currentVerseKey];
      if (v) captureGeminiKnowledgeFromVerse(v, "Pembaruan Bahasa Tafsir");
    });
  });

  // =========================================================================
  // HEURISTIC AUTO-LSF ANALYZER FOR ALL 6.236 AYAHS
  // =========================================================================
  function stripDiacritics(ar) {
    return (ar || "").replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "");
  }

  function buildHeuristicSflVerse(surahObj, ayahObj) {
    const ar = ayahObj.ar;
    const plain = stripDiacritics(ar);
    const words = ar.split(/\s+/).filter(Boolean);

    // Heuristic Process Detection
    let processCategory = "Material";
    let speechCategory = "Deklaratif";
    let themeCategory = "Unmarked";

    if (/^(هل|ألم|ألا|ما |من |كيف|أيان|أين)/.test(plain) || plain.includes("ألم ") || plain.includes("هل ")) {
      speechCategory = "Interogatif";
      themeCategory = "Multiple";
    } else if (/^(قل |اقرأ|اعبدوا|اتقوا|يا أيها|اذكر|سبح|اهدنا|ربنا)/.test(plain)) {
      speechCategory = plain.includes("ربنا") || plain.includes("اهدنا") ? "Doa" : "Imperatif";
    }

    if (/(^| )(قال|قالت|قالوا|قل |يقول|يقولون|نادى|أوحى)/.test(plain)) {
      processCategory = "Verbal";
    } else if (/(^| )(علم|يعلم|تعلمون|رأى|تر|يشاء|شاء|آمن|يؤمنون|تفكرون|تذكرون|يحب|يكره)/.test(plain)) {
      processCategory = "Mental";
    } else if (/(^| )(كان|لم يكن|يكون|تكون|ليس|هنالك)/.test(plain)) {
      processCategory = "Existential";
    } else if (/(^| )(ضحك|يبكون|بكي|شاكرا|كفورا|صبر|يصبرون|يخشى)/.test(plain)) {
      processCategory = "Behavioural";
    } else if (/^(إن الله|الله |هو |ذلك |الحمد لله|لله )/.test(plain) || /( إن الله | والله )/.test(plain)) {
      processCategory = "Relational";
    }

    if (/^(إذا|إن |لو|لما|يوم |إياك|في |على |من )/.test(plain)) {
      themeCategory = "Marked";
    } else if (/^(و|ف|ثم|إن |لكن)/.test(plain) && themeCategory === "Unmarked") {
      themeCategory = "Multiple";
    }

    const procAr = PROCESS_AR_MAP[processCategory];
    const ref = `QS. ${surahObj.namaLatin} [${surahObj.nomor}]: ${ayahObj.n}`;

    const segCount = Math.min(4, Math.max(1, Math.ceil(words.length / 3)));
    const chunkSize = Math.ceil(words.length / segCount);
    const diagramSegments = [];
    for (let i = 0; i < words.length; i += chunkSize) {
      const segText = words.slice(i, i + chunkSize).join(" ");
      const isFirst = i === 0;
      diagramSegments.push({
        ar: segText,
        ide: isFirst ? `Proses ${processCategory} / Fokus Awal` : "Partisipan / Sirkumstansi",
        ideAr: isFirst ? procAr : "مشارك / ظرف",
        int: isFirst ? `Mood (${speechCategory})` : "Residu Proposisi",
        intAr: isFirst ? "المزاج" : "البقية",
        tex: isFirst ? `Tema (${themeCategory})` : "Rema Pengembang",
        texAr: isFirst ? "الموضوع" : "الخبر",
        flex: "1"
      });
    }

    const tokens = words.map((w, idx) => {
      const pw = stripDiacritics(w);
      let pos = "Isim / Lafadz";
      let role = idx === 0 ? `Elemen Awal (${themeCategory})` : "Partisipan / Pelengkap";
      let roleAr = idx === 0 ? "الموضوع" : "مشارك";
      if (/^(و|ف|في|من|إلى|على|عن|ب|ل|إن|أن|هل|لم|لا|ما)$/.test(pw)) {
        pos = "Harf / Partikel";
        role = "Penghubung / Sirkumstansi";
        roleAr = "أداة ربط / ظرف";
      } else if (/^(ي|ت|ن|أ)/.test(pw) && pw.length >= 4) {
        pos = "Fi'il / Verba Potensial";
        role = `Proses (${processCategory})`;
        roleAr = procAr;
      }
      return { ar: w, tr: "-", root: "-", pos, role, roleAr };
    });

    return {
      surah: surahObj.nomor,
      surahName: surahObj.namaLatin,
      verse: ayahObj.n,
      ref,
      sourceRef: "Korpus Lengkap Kemenag RI + Draf Heuristik LSF V6.0 (Dapat disunting & disimpan)",
      isDraftHeuristic: true,
      arabic: ar,
      translit: ayahObj.tr,
      translation: ayahObj.id,
      audioUrl: ayahObj.au || "",
      processCategory,
      processCategoryAr: procAr,
      speechCategory,
      themeCategory,
      clauses: [
        {
          clauseId: `${surahObj.nomor}:${ayahObj.n}:c1`,
          arabicText: ar,
          transitivity: {
            process: { typeEn: processCategory, typeAr: procAr, lexicalVerb: words[0] || ar },
            participants: [{ roleEn: "Core Participant", roleAr: "المشارك الرئيس", text: words.slice(1, 5).join(" ") || ar }],
            circumstances: []
          },
          interpersonal: { speechFunction: speechCategory, mood: speechCategory },
          textual: { theme: words[0] || ar, rheme: words.slice(1).join(" ") || ar, themeType: themeCategory }
        }
      ],
      diagramSegments,
      tokens,
      ideational: {
        processType: `${processCategory} (Draf Heuristik)`,
        processTypeAr: procAr,
        rows: [
          {
            seg: ar,
            comp: `Proses ${processCategory}`,
            compAr: procAr,
            role: "Pemetaan Awal Klausa",
            desc: `Deteksi leksikogramatika awal mengklasifikasikan klausa ini cenderung berproses ${processCategory}.`
          }
        ],
        summary: `Draf otomatis mengidentifikasi dominasi proses ${processCategory} (${procAr}). Anda dapat memverifikasi teks Arabnya dan menyimpannya ke korpus permanen.`
      },
      interpersonal: {
        speechFunc: `${speechCategory} (Draf Heuristik)`,
        modality: "Analisis Awal Mood",
        rows: [
          {
            seg: words.slice(0, 3).join(" "),
            block: "Mood Pembuka",
            blockAr: "المزاج",
            role: `Penanda ${speechCategory}`,
            desc: `Struktur pembuka klausa mengarah pada tindak tutur ${speechCategory}.`
          }
        ],
        summary: `Secara interpersonal, ayat ini diklasifikasikan sebagai tindak tutur ${speechCategory} antara penutur dan mitra tutur.`
      },
      textual: {
        themeType: `${themeCategory} Theme`,
        themeContent: words[0] || ar,
        themeDesc: `Kata pembuka ayat berfungsi sebagai titik tolak pesan (${themeCategory}).`,
        rhemeContent: words.slice(1).join(" ") || "-",
        rhemeDesc: "Bagian pengembangan informasi baru ayat.",
        summary: `Pola Tema (${themeCategory}) menata alur fokus informasi dari awal hingga akhir ayat.`
      },
      nahwuBalaghahBridge: {
        nahwu: "Analisis I'rab Nahwu dapat diamati pada kata pembuka dan relasi verba/nomina di dalam ayat.",
        balaghah: "Perhatikan kesesuaian pilihan kata (diksinya) dengan konteks surat Makkiyyah/Madaniyyah.",
        sflSynthesis: `Draf LSF ini menjadi pintu masuk membaca struktur fungsional ${ref}.`
      },
      pedagogicalNote: {
        targetLevel: "Eksplorasi Mandiri",
        learningObjective: `Mengidentifikasi Proses ${processCategory}, Mood ${speechCategory}, dan Tema ${themeCategory} pada ${ref}.`,
        qiraahActivity: "Bandingkan hasil draf LSF ini dengan uraian Tafsir Kemenag RI pada Tab 5 atau Studio Perbandingan."
      }
    };
  }

  // =========================================================================
  // PILAR 1: DIREKTORI 114 SURAT & 6.236 AYAT (KEMENAG RI)
  // =========================================================================
  function renderSurahGrid() {
    const surahs = kemenagCorpus.surahs || [];
    const q = (el.mushafSearchSurah.value || "").toLowerCase().trim();
    const rev = el.mushafFilterRevelation.value;

    const filtered = surahs.filter((s) => {
      const matchRev = rev === "all" || s.tempatTurun === rev;
      const matchQ =
        !q ||
        s.namaLatin.toLowerCase().includes(q) ||
        s.arti.toLowerCase().includes(q) ||
        s.nama.includes(q) ||
        String(s.nomor) === q;
      return matchRev && matchQ;
    });

    if (el.mushafFilterCount) {
      const labelRev = rev === "Mekah" ? " Makkiyyah" : rev === "Madinah" ? " Madaniyyah" : "";
      el.mushafFilterCount.textContent = `${filtered.length} Surat${labelRev}`;
    }

    if (filtered.length > 0 && !filtered.some((x) => x.nomor === activeMushafSurah)) {
      selectMushafSurah(filtered[0].nomor, false);
      return;
    }

    const prevScrollTop = el.mushafSurahGrid.scrollTop;
    el.mushafSurahGrid.innerHTML = filtered
      .map((s) => {
        const isActive = s.nomor === activeMushafSurah;
        const revLabel = s.tempatTurun === "Mekah" ? "Makkiyyah" : "Madaniyyah";
        const revPillCls = s.tempatTurun === "Mekah" ? "bg-amber-100/80 text-amber-900" : "bg-emerald-100/85 text-emerald-900";
        return `
        <button type="button" data-surah-id="${s.nomor}" class="surah-card w-full min-w-0 overflow-hidden cursor-pointer text-left p-2.5 sm:p-3 rounded-xl border transition flex flex-col justify-between ${
          isActive
            ? "bg-emerald-50 border-emerald-500 ring-2 ring-emerald-200"
            : "bg-white border-slate-200 hover:bg-emerald-50/50 hover:border-emerald-400 shadow-xs"
        }">
          <div class="flex items-center justify-between gap-1.5 w-full min-w-0">
            <span class="w-7 h-7 rounded-lg bg-emerald-800 text-white text-xs font-bold flex items-center justify-center shrink-0">${s.nomor}</span>
            <span class="font-diwani text-[20px] sm:text-[21px] leading-[1.6] text-emerald-950 text-right min-w-0 max-w-full px-1 py-0.5 truncate" dir="rtl" lang="ar">${escapeHtml(formatDiwaniArabic(s.nama))}</span>
          </div>
          <div class="mt-1.5 flex flex-wrap items-center justify-between gap-1 w-full min-w-0">
            <span class="font-bold text-[13px] text-slate-900 leading-tight break-words">${escapeHtml(s.namaLatin)}</span>
            ${isActive ? `<span class="px-1.5 py-0.5 rounded text-[8.5px] font-bold bg-emerald-600 text-white uppercase shrink-0">Dibuka</span>` : ""}
          </div>
          <div class="text-[10.5px] text-slate-500 truncate w-full mt-0.5">${escapeHtml(s.arti)}</div>
          <div class="mt-1.5 pt-1 border-t border-slate-100 flex items-center justify-between gap-1 w-full min-w-0 text-[10px] leading-tight">
            <span class="font-semibold text-emerald-800 whitespace-nowrap">${s.jumlahAyat} Ayat</span>
            <span class="font-bold px-1.5 py-0.5 rounded ${revPillCls} whitespace-nowrap">${revLabel}</span>
          </div>
        </button>
      `;
      })
      .join("");

    el.mushafSurahGrid.scrollTop = prevScrollTop;

    el.mushafSurahGrid.querySelectorAll(".surah-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = parseInt(btn.getAttribute("data-surah-id"), 10);
        selectMushafSurah(id, true);
      });
    });
  }

  function selectMushafSurah(surahId, shouldScroll = false) {
    const s = (kemenagCorpus.surahs || []).find((x) => x.nomor === surahId);
    if (!s) return;
    activeMushafSurah = surahId;
    renderSurahGrid();

    const revLabel = s.tempatTurun === "Mekah" ? "Makkiyyah" : "Madaniyyah";
    el.mushafDetailNum.textContent = `Surat ke-${s.nomor}`;
    el.mushafDetailRev.textContent = `${revLabel} • ${s.jumlahAyat} Ayat`;
    el.mushafDetailTitle.textContent = `${s.namaLatin} (${s.arti})`;
    el.mushafDetailArabic.textContent = formatDiwaniArabic(s.nama);
    // deskripsi dari API berisi tag <i>/<br> sederhana; strip tags safely
    const tmpDiv = document.createElement("div");
    tmpDiv.innerHTML = s.deskripsi || "";
    el.mushafDetailDesc.textContent = tmpDiv.textContent || "";

    el.mushafFromAyah.max = s.jumlahAyat;
    el.mushafToAyah.max = s.jumlahAyat;
    el.mushafFromAyah.value = 1;
    el.mushafToAyah.value = Math.min(s.jumlahAyat, 30); // Default tampilkan 30 ayat awal agar responsif, bisa dinaikkan s.d. jumlahAyat

    renderMushafAyahs(s);
    if (shouldScroll && el.mushafSurahDetail) {
      el.mushafSurahDetail.scrollIntoView({ behavior: "smooth", block: "start" });
      showToast(`Membuka QS. ${s.namaLatin} [${s.nomor}]`);
    }
  }

  // =========================================================================
  // SURAH & AYAH SELECTOR OPTION BUILDERS
  // =========================================================================
  function buildSurahOptionsHtml() {
    return (kemenagCorpus.surahs || [])
      .map((s) => `<option value="${s.nomor}">${s.nomor}. ${escapeHtml(s.namaLatin)} (${s.jumlahAyat} Ayat)</option>`)
      .join("");
  }

  function buildAyahOptionsHtml(surahId, { includeFullSurah = false, markCurated = false } = {}) {
    const s = (kemenagCorpus.surahs || []).find((x) => x.nomor === Number(surahId));
    if (!s) return "";
    let html = includeFullSurah ? `<option value="full">Surat Penuh (${s.jumlahAyat} Ayat)</option>` : "";
    for (let i = 1; i <= s.jumlahAyat; i++) {
      const star = markCurated && dataset.verses[`${s.nomor}:${i}`] ? " ★" : "";
      html += `<option value="${i}">Ayat ${i}${star}</option>`;
    }
    return html;
  }

  function renderMushafAyahs(s) {
    const from = Math.max(1, parseInt(el.mushafFromAyah.value, 10) || 1);
    const to = Math.min(s.jumlahAyat, parseInt(el.mushafToAyah.value, 10) || s.jumlahAyat);
    const showTr = el.chkMushafTranslit.checked;
    const showId = el.chkMushafTranslation.checked;

    const slice = (s.ayat || []).filter((a) => a.n >= from && a.n <= to);

    el.mushafAyahsList.innerHTML = slice
      .map((a) => {
        const key = `${s.nomor}:${a.n}`;
        const hasCuratedSfl = Boolean(dataset.verses[key]);
        return `
        <div data-ayah-card="${s.nomor}:${a.n}" class="p-4 rounded-xl border ${hasCuratedSfl ? "border-emerald-300 bg-emerald-50/30" : "border-slate-200 bg-white"} space-y-3 transition">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="px-2.5 py-1 rounded-full bg-emerald-800 text-white text-xs font-bold">${s.nomor}:${a.n}</span>
              ${
                hasCuratedSfl
                  ? `<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[10px] font-bold border border-emerald-300">Terkurasi Ebook LSF</span>`
                  : ""
              }
            </div>
            <div class="flex flex-wrap gap-1.5 text-xs">
              <button type="button" data-open-ktm="${s.nomor}:${a.n}" class="btn-ayah-ktm px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-lg font-semibold transition">Tafsir Kemenag &amp; Ibnu Katsir</button>
              <button type="button" data-open-sfl="${s.nomor}:${a.n}" class="btn-ayah-sfl px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-semibold transition">Analisis LSF</button>
              <button type="button" data-open-comp="${s.nomor}:${a.n}" class="btn-ayah-comp px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition">LSF vs. Tafsir</button>
            </div>
          </div>

          <p class="font-arabic ${(a.ar || "").length > 200 ? "text-base sm:text-lg" : "text-lg sm:text-xl"} text-emerald-950 leading-[2.35] text-right font-normal pt-2" dir="rtl">${formatQuranArabicHtml(a.ar)}</p>
          ${showTr ? `<p class="text-xs text-slate-500 italic">${escapeHtml(a.tr)}</p>` : ""}
          ${showId ? `<p class="text-sm text-slate-800 leading-relaxed">${escapeHtml(a.id)}</p>` : ""}
        </div>
      `;
      })
      .join("");

    if (to < s.jumlahAyat) {
      el.mushafAyahsList.insertAdjacentHTML(
        "beforeend",
        `<div class="text-center pt-2">
          <button type="button" id="btn-mushaf-show-all" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition">
            Tampilkan Semua ${s.jumlahAyat} Ayat Surat ${escapeHtml(s.namaLatin)}
          </button>
        </div>`
      );
      document.getElementById("btn-mushaf-show-all").addEventListener("click", () => {
        el.mushafFromAyah.value = 1;
        el.mushafToAyah.value = s.jumlahAyat;
        renderMushafAyahs(s);
      });
    }

    el.mushafAyahsList.querySelectorAll(".btn-ayah-ktm").forEach((b) => {
      b.addEventListener("click", () => {
        const [sid, aid] = b.getAttribute("data-open-ktm").split(":").map(Number);
        openKemenagTafsirModal(sid, aid);
      });
    });

    el.mushafAyahsList.querySelectorAll(".btn-ayah-sfl").forEach((b) => {
      b.addEventListener("click", () => {
        const [sid, aid] = b.getAttribute("data-open-sfl").split(":").map(Number);
        loadAnyQuranVerse(sid, aid);
        setPillar("sfl");
      });
    });

    el.mushafAyahsList.querySelectorAll(".btn-ayah-comp").forEach((b) => {
      b.addEventListener("click", () => {
        const [sid, aid] = b.getAttribute("data-open-comp").split(":").map(Number);
        loadAnyQuranVerse(sid, aid);
        setPillar("tafsir");
      });
    });
  }

  el.mushafSearchSurah.addEventListener("input", renderSurahGrid);
  el.mushafFilterRevelation.addEventListener("change", renderSurahGrid);
  el.btnMushafApplyRange.addEventListener("click", () => {
    const s = (kemenagCorpus.surahs || []).find((x) => x.nomor === activeMushafSurah);
    if (s) renderMushafAyahs(s);
  });
  el.chkMushafTranslit.addEventListener("change", () => {
    const s = (kemenagCorpus.surahs || []).find((x) => x.nomor === activeMushafSurah);
    if (s) renderMushafAyahs(s);
  });
  el.chkMushafTranslation.addEventListener("change", () => {
    const s = (kemenagCorpus.surahs || []).find((x) => x.nomor === activeMushafSurah);
    if (s) renderMushafAyahs(s);
  });

  function setKtmTab(tabName) {
    const isIk = tabName === "ibnkatsir";
    el.ktmTabKemenag.className = isIk
      ? "px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
      : "px-3 py-1.5 rounded-lg bg-emerald-700 text-white";
    el.ktmTabIbnKatsir.className = isIk
      ? "px-3 py-1.5 rounded-lg bg-amber-600 text-white"
      : "px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200";
    el.ktmPanelKemenag.classList.toggle("hidden", isIk);
    el.ktmPanelIbnKatsir.classList.toggle("hidden", !isIk);
  }
  el.ktmTabKemenag.addEventListener("click", () => setKtmTab("kemenag"));
  el.ktmTabIbnKatsir.addEventListener("click", () => setKtmTab("ibnkatsir"));

  // Modal Tafsir Kemenag & Ibnu Katsir
  async function openKemenagTafsirModal(surahId, ayahNum) {
    const s = (kemenagCorpus.surahs || []).find((x) => x.nomor === surahId);
    const a = s && (s.ayat || []).find((x) => x.n === ayahNum);
    if (!s || !a) return;

    currentKtmContext = { surah: surahId, ayah: ayahNum };
    el.ktmTitle.textContent = `Tafsir Surat ${s.namaLatin} [${s.nomor}] Ayat ${a.n}`;
    el.ktmArabic.innerHTML = formatQuranArabicHtml(a.ar);
    el.ktmTranslit.textContent = a.tr;
    el.ktmTranslation.textContent = a.id;
    el.ktmBody.textContent = "Memuat Tafsir Tahlili Kemenag RI...";
    el.ktmIkEn.textContent = "Memuat Tafsir Ibnu Katsir...";
    el.ktmIkAr.textContent = "جاري التحميل...";
    el.kemenagTafsirModal.classList.remove("hidden");

    const [kemenagText, ikData] = await Promise.all([
      getKemenagTafsirForVerse(surahId, ayahNum),
      getIbnKathirTafsirForVerse(surahId, ayahNum)
    ]);
    if (currentKtmContext.surah === surahId && currentKtmContext.ayah === ayahNum) {
      el.ktmBody.textContent = kemenagText;
      el.ktmIkEn.textContent = getIbnKathirDisplayText(ikData);
      el.ktmIkAr.textContent = ikData.ar;
      syncIbnKatsirLangButtons();
    }
  }

  el.btnCloseKtm.addEventListener("click", () => el.kemenagTafsirModal.classList.add("hidden"));
  el.btnCloseKtmBottom.addEventListener("click", () => el.kemenagTafsirModal.classList.add("hidden"));
  el.btnKtmAnalyzeSfl.addEventListener("click", () => {
    el.kemenagTafsirModal.classList.add("hidden");
    loadAnyQuranVerse(currentKtmContext.surah, currentKtmContext.ayah);
    setPillar("sfl");
  });
  el.btnKtmCompare.addEventListener("click", () => {
    el.kemenagTafsirModal.classList.add("hidden");
    loadAnyQuranVerse(currentKtmContext.surah, currentKtmContext.ayah);
    setPillar("tafsir");
  });

  // Quick Jump Dropdowns (114 Surahs)
  function populateQuickSurahSelect() {
    const surahs = kemenagCorpus.surahs || [];
    el.quickSurahSelect.innerHTML = surahs
      .map((s) => `<option value="${s.nomor}">${s.nomor}. ${escapeHtml(s.namaLatin)} (${s.jumlahAyat} Ayat)</option>`)
      .join("");
    populateQuickAyahSelect(1);
  }

  function populateQuickAyahSelect(surahId) {
    const s = (kemenagCorpus.surahs || []).find((x) => x.nomor === surahId);
    if (!s) return;
    let html = "";
    for (let i = 1; i <= s.jumlahAyat; i++) {
      const hasSfl = dataset.verses[`${surahId}:${i}`] ? " ★" : "";
      html += `<option value="${i}">Ayat ${i}${hasSfl}</option>`;
    }
    el.quickAyahSelect.innerHTML = html;
  }

  el.quickSurahSelect.addEventListener("change", () => {
    const sid = parseInt(el.quickSurahSelect.value, 10) || 1;
    populateQuickAyahSelect(sid);
    loadAnyQuranVerse(sid, 1);
  });

  el.quickAyahSelect.addEventListener("change", () => {
    const sid = parseInt(el.quickSurahSelect.value, 10) || 1;
    const aid = parseInt(el.quickAyahSelect.value, 10) || 1;
    loadAnyQuranVerse(sid, aid);
  });

  el.btnQuickLoadAyah.addEventListener("click", () => {
    const sid = parseInt(el.quickSurahSelect.value, 10) || 1;
    const aid = parseInt(el.quickAyahSelect.value, 10) || 1;
    loadAnyQuranVerse(sid, aid);
    const target = document.getElementById("sfl-active-verse-section");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });

  function loadAnyQuranVerse(surahId, ayahNum) {
    const key = `${surahId}:${ayahNum}`;
    if (dataset.verses[key]) {
      renderVerse(key);
      return;
    }
    const s = (kemenagCorpus.surahs || []).find((x) => x.nomor === surahId);
    const a = s && (s.ayat || []).find((x) => x.n === ayahNum);
    if (!s || !a) {
      showToast("Ayat tidak ditemukan dalam korpus.", true);
      return;
    }
    const heuristicObj = buildHeuristicSflVerse(s, a);
    renderVerseObject(key, heuristicObj);
    showToast(`Memuat draf analisis LSF untuk ${heuristicObj.ref}`);
  }

  el.btnSaveHeuristicVerse.addEventListener("click", () => {
    if (!activeVerseObj) return;
    const toSave = cloneObject(activeVerseObj);
    toSave.isDraftHeuristic = false;
    toSave.sourceRef = "Tersimpan dari Korpus Kemenag RI (Analisis LSF Pengguna)";
    dataset.verses[currentVerseKey] = toSave;
    saveCustomVerse(currentVerseKey, toSave);
    applyFilters();
    renderVerse(currentVerseKey);
    renderAnalytics();
    showToast(`${toSave.ref} disimpan ke korpus permanen!`);
  });

  // =========================================================================
  // PILAR 3: STUDIO PERBANDINGAN LSF VS TAFSIR KLASIK & KONTEMPORER
  // =========================================================================
  function populateMethodologyMatrix() {
    const matrix = (dataset.metadata && dataset.metadata.methodologyMatrix) || [];
    el.methodologyMatrixBody.innerHTML = matrix
      .map((m, idx) => `
      <tr class="${idx === 0 ? "bg-emerald-50/70" : "hover:bg-slate-50"} align-top">
        <td class="py-3 px-3 font-bold ${idx === 0 ? "text-emerald-950" : "text-slate-900"}">
          ${escapeHtml(m.name)}
          ${idx === 0 ? `<span class="block mt-1 text-[10px] font-semibold bg-emerald-700 text-white px-2 py-0.5 rounded w-fit">Metode Utama Aplikasi</span>` : ""}
        </td>
        <td class="py-3 px-3 text-slate-600">
          <div class="font-semibold text-slate-800">${escapeHtml(m.era)}</div>
          <div class="mt-0.5">${escapeHtml(m.keyFigures)}</div>
        </td>
        <td class="py-3 px-3 text-slate-700">${escapeHtml(m.paradigm)}</td>
        <td class="py-3 px-3 text-slate-700">${escapeHtml(m.unitOfAnalysis)}</td>
        <td class="py-3 px-3 text-slate-700 space-y-1">
          <div><strong>Keunggulan:</strong> ${escapeHtml(m.strength)}</div>
          <div class="text-indigo-800"><strong>Relasi dgn LSF:</strong> ${escapeHtml(m.relationToLsf)}</div>
        </td>
      </tr>
    `)
      .join("");
  }

  function getOrBuildVerseObj(surahNum, ayahNum) {
    const sNum = Number(surahNum) || 1;
    const aNum = Number(ayahNum) || 1;
    const key = `${sNum}:${aNum}`;
    if (dataset.verses[key]) return dataset.verses[key];
    const s = (kemenagCorpus.surahs || []).find((x) => x.nomor === sNum);
    const a = s && (s.ayat || []).find((x) => x.n === aNum);
    if (!s || !a) return null;
    return buildHeuristicSflVerse(s, a);
  }

  function populateStudioSelectors() {
    if (!el.studioSurahSelect || !el.studioAyahSelect) return;
    if (el.studioSurahSelect.options.length === 0) {
      el.studioSurahSelect.innerHTML = buildSurahOptionsHtml();
    }
    const v = activeVerseObj || dataset.verses[currentVerseKey] || getOrBuildVerseObj(1, 2);
    const sNum = v ? Number(v.surah) : 1;
    const aNum = v ? Number(v.verse) : 1;
    el.studioSurahSelect.value = String(sNum);
    if (Number(el.studioAyahSelect.getAttribute("data-surah")) !== sNum || el.studioAyahSelect.options.length === 0) {
      el.studioAyahSelect.innerHTML = buildAyahOptionsHtml(sNum, { markCurated: true });
      el.studioAyahSelect.setAttribute("data-surah", String(sNum));
    }
    el.studioAyahSelect.value = String(aNum);
  }

  el.studioSurahSelect.addEventListener("change", () => {
    const sid = parseInt(el.studioSurahSelect.value, 10) || 1;
    el.studioAyahSelect.innerHTML = buildAyahOptionsHtml(sid, { markCurated: true });
    el.studioAyahSelect.setAttribute("data-surah", String(sid));
    loadAnyQuranVerse(sid, 1);
    renderTafsirStudio();
  });

  el.studioAyahSelect.addEventListener("change", () => {
    const sid = parseInt(el.studioSurahSelect.value, 10) || 1;
    const aid = parseInt(el.studioAyahSelect.value, 10) || 1;
    loadAnyQuranVerse(sid, aid);
    renderTafsirStudio();
  });

  el.btnStudioPrev.addEventListener("click", () => {
    stepQuranVerse(-1);
    renderTafsirStudio();
  });
  el.btnStudioNext.addEventListener("click", () => {
    stepQuranVerse(1);
    renderTafsirStudio();
  });
  el.btnStudioNewWindow.addEventListener("click", () => {
    const v = activeVerseObj || getOrBuildVerseObj(1, 2);
    if (!v) return;
    const bodyHtml = `
      <div class="bg-emerald-950 text-white rounded-2xl p-5 space-y-3">
        <div class="flex flex-wrap gap-2 text-xs">
          <span class="px-2.5 py-1 rounded bg-emerald-800 text-emerald-100 font-bold">${escapeHtml(v.ref)}</span>
          <span class="px-2.5 py-1 rounded bg-amber-400/20 text-amber-200 font-semibold">${escapeHtml(v.processCategory)} • ${escapeHtml(v.speechCategory)} • Tema ${escapeHtml(v.themeCategory)}</span>
        </div>
        <p class="font-arabic text-3xl text-right leading-[2.35]" dir="rtl">${formatQuranArabicHtml(v.arabic, true)}</p>
        <p class="text-sm text-emerald-100 italic">"${escapeHtml(v.translation)}"</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="bg-white rounded-2xl border border-emerald-200 p-4 space-y-2 text-xs">
          <h2 class="font-bold text-sm text-emerald-900">Analisis Linguistik Sistemik Fungsional (LSF)</h2>
          <div><strong>Ideasional:</strong> ${escapeHtml(el.studioLsfIdeational.textContent)}</div>
          <div><strong>Interpersonal:</strong> ${escapeHtml(el.studioLsfInterpersonal.textContent)}</div>
          <div><strong>Tekstual:</strong> ${escapeHtml(el.studioLsfTextual.textContent)}</div>
          <div><strong>Nahwu &amp; Balaghah:</strong> ${escapeHtml(el.studioLsfBridge.textContent)}</div>
        </div>
        <div class="bg-white rounded-2xl border border-indigo-200 p-4 space-y-2 text-xs">
          <h2 class="font-bold text-sm text-indigo-900">Sintesis Perbandingan LSF vs Tafsir</h2>
          <p class="leading-relaxed">${escapeHtml(el.studioSynthesisText.textContent)}</p>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-emerald-200 p-4 space-y-2 text-xs">
        <h2 class="font-bold text-sm text-emerald-900">Tafsir Tahlili Kemenag RI</h2>
        <div class="leading-relaxed whitespace-pre-line">${escapeHtml(el.studioKemenagFulltext.textContent)}</div>
      </div>
      <div class="bg-white rounded-2xl border border-amber-200 p-4 space-y-2 text-xs">
        <h2 class="font-bold text-sm text-amber-950">Tafsir Ibnu Katsir (Ma'tsur)</h2>
        <div class="font-arabic text-xl text-right leading-[2.2] bg-amber-50/50 p-3 rounded-xl" dir="rtl">${escapeHtml(el.studioIbnKatsirAr.textContent)}</div>
        <div class="leading-relaxed whitespace-pre-line">${escapeHtml(el.studioIbnKatsirEn.textContent)}</div>
      </div>`;
    openStandaloneWindow(`Perbandingan LSF vs. Tafsir — ${v.ref}`, bodyHtml, "Studio Perbandingan 6.236 Ayat");
  });

  document.querySelectorAll(".tafsir-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      studioTafsirFilter = btn.getAttribute("data-tafsir-filter");
      document.querySelectorAll(".tafsir-filter-btn").forEach((b) => {
        const active = b.getAttribute("data-tafsir-filter") === studioTafsirFilter;
        b.className = `tafsir-filter-btn px-3 py-1.5 rounded-lg ${active ? "bg-purple-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`;
      });
      renderStudioTafsirCards(activeVerseObj);
    });
  });

  async function renderTafsirStudio() {
    populateStudioSelectors();
    populateMethodologyMatrix();
    const v = activeVerseObj || dataset.verses[currentVerseKey];
    if (!v) return;

    el.studioVerseRef.textContent = v.ref;
    el.studioVerseTags.textContent = `${v.processCategory} • ${v.speechCategory || "Deklaratif"} • Tema ${v.themeCategory}`;
    el.studioVerseArabic.className =
      (v.arabic || "").length > 200
        ? "font-arabic text-[15px] sm:text-base font-normal text-amber-200 leading-[2.3] pt-1"
        : "font-arabic text-base sm:text-lg font-normal text-amber-200 leading-[2.35] pt-1";
    el.studioVerseArabic.innerHTML = formatQuranArabicHtml(v.arabic, true);
    el.studioVerseTranslation.textContent = `"${v.translation}"`;

    el.studioLsfIdeational.textContent = `[${v.ideational.processType}] ${v.ideational.summary}`;
    el.studioLsfInterpersonal.textContent = `[${v.interpersonal.speechFunc}] ${v.interpersonal.summary}`;
    el.studioLsfTextual.textContent = `[${v.textual.themeType}] ${v.textual.summary}`;
    el.studioLsfBridge.textContent = v.nahwuBalaghahBridge
      ? `${v.nahwuBalaghahBridge.nahwu} | Balaghah: ${v.nahwuBalaghahBridge.balaghah}`
      : "Integrasi Nahwu dan Ilmu Ma'ani memperkaya pembacaan leksikogramatika ayat ini.";

    el.studioKemenagFulltext.textContent = "Memuat Tafsir Tahlili Kemenag RI...";
    el.studioIbnKatsirEn.textContent = "Memuat Tafsir Ibnu Katsir...";
    el.studioIbnKatsirAr.textContent = "جاري التحميل...";
    renderStudioTafsirCards(v);

    const [fullTafsir, ikData] = await Promise.all([
      getKemenagTafsirForVerse(v.surah, v.verse),
      getIbnKathirTafsirForVerse(v.surah, v.verse)
    ]);
    el.studioKemenagFulltext.textContent = fullTafsir;
    el.studioIbnKatsirEn.textContent = getIbnKathirDisplayText(ikData);
    el.studioIbnKatsirAr.textContent = ikData.ar;
    renderStudioTafsirCards(v, ikData);
    syncIbnKatsirLangButtons();
    captureGeminiKnowledgeFromVerse(v, "Pantauan Korpus");

    const comp = v.tafsirComparison;
    el.studioSynthesisText.textContent = comp
      ? comp.lsfVsTafsirSynthesis
      : `Metode LSF menganalisis ${v.ref} melalui bukti mikro-klausa (Proses ${v.processCategory}, Mood ${v.speechCategory}, Tema ${v.themeCategory}), melengkapi Tafsir Kemenag RI dan Tafsir Ibnu Katsir (Ma'tsur Jilid I–VIII) yang memaparkan riwayat asbabun nuzul, atsar sahabat, dan hikmah syariatnya.`;
  }

  function renderStudioTafsirCards(v, ikData = null) {
    if (!v) return;
    const comp = v.tafsirComparison;
    const cachedIk =
      ikData ||
      (() => {
        const c = window.QURAN_TAFSIR_IK_CACHE && window.QURAN_TAFSIR_IK_CACHE[Number(v.surah)];
        const rawEn = c && c.en ? c.en[String(v.verse)] : "";
        return c
          ? {
              en: rawEn,
              ar: c.ar && c.ar[String(v.verse)],
              id: ibnKatsirIdCache[`${v.surah}:${v.verse}`] || (rawEn ? offlineTranslateIbnKathirToId(rawEn) : "")
            }
          : null;
      })();
    const rawIkEn = cachedIk && cachedIk.en ? cachedIk.en.replace(/\s+/g, " ").trim() : "";
    const rawIkId = cachedIk && cachedIk.id ? cachedIk.id.replace(/\s+/g, " ").trim() : "";
    const ikExcerptEn = rawIkEn ? rawIkEn.slice(0, 360) + (rawIkEn.length > 360 ? "..." : "") : "English Ibn Kathir excerpt for this ayah is loading...";
    const ikExcerptId = rawIkId ? rawIkId.slice(0, 360) + (rawIkId.length > 360 ? "..." : "") : "";
    const kemenagCached =
      tafsirCache[String(v.surah)] && tafsirCache[String(v.surah)][String(v.verse)]
        ? tafsirCache[String(v.surah)][String(v.verse)].replace(/\s+/g, " ").trim().slice(0, 320) + "..."
        : "";

    const ikBodyText =
      ibnKatsirLang === "en"
        ? ikExcerptEn
        : (comp && comp.klasikMatsur ? comp.klasikMatsur : ikExcerptId || "Pendekatan klasik menelusuri ayat melalui riwayat Al-Qur'an bil-Qur'an, Hadis Nabi saw, serta atsar sahabat & tabi'in terkait konteks turunnya ayat.");

    const cards = [
      {
        group: "kemenag",
        badge: "Tafsir Resmi Kemenag RI",
        color: "border-purple-200 bg-purple-50/50",
        titleColor: "text-purple-950",
        title: "Tafsir Kemenag RI (Tahlili & Al-Wajiz)",
        body: comp
          ? comp.kemenagSummary
          : kemenagCached || "Lihat teks lengkap Tafsir Tahlili Kemenag RI di panel lipat di bawah untuk uraian kosakata, munasabah, dan pesan praktis resmi LPMQ."
      },
      {
        group: "klasik",
        isIbnuKatsir: true,
        badge: "Tafsir Klasik (Ma'tsur • Lubaabut Tafsiir Jilid I–VIII)",
        color: "border-amber-200 bg-amber-50/40",
        titleColor: "text-amber-950",
        title: "Tafsir Bi al-Ma'tsur (Ibnu Katsir — Lubaabut Tafsiir)",
        body: ikBodyText
      },
      {
        group: "klasik",
        badge: "Tafsir Klasik (Kebahasaan)",
        color: "border-teal-200 bg-teal-50/50",
        titleColor: "text-teal-950",
        title: "Tafsir Lughawi–Balaghi (Az-Zamakhsyari / Al-Kasysyaf & Al-Jurjani)",
        body: comp
          ? comp.lughawiBalaghi
          : "Pendekatan Balaghah klasik menganalisis susunan Nazhm, ketepatan diksi, Taqdim wa Ta'khir, serta rahasia I'jaz bahasa Arab."
      },
      {
        group: "kontemporer",
        badge: "Tafsir Kontemporer (Sastra–Sosial)",
        color: "border-sky-200 bg-sky-50/50",
        titleColor: "text-sky-950",
        title: "Tafsir Adabi Ijtima'i (Al-Misbah – M. Quraish Shihab & Al-Manar)",
        body: comp
          ? comp.kontemporerAdabi
          : "Pendekatan kontemporer menghubungkan keserasian antar-ayat (munasabah), nuansa psikologis pendengar, dan solusi sosial kemasyarakatan modern."
      },
      {
        group: "kontemporer",
        badge: "Tafsir Kontemporer (Nilai Universal)",
        color: "border-indigo-200 bg-indigo-50/50",
        titleColor: "text-indigo-950",
        title: "Tafsir Maqashidi & Tematik (Ibnu 'Asyur / Fazlur Rahman)",
        body: comp
          ? comp.kontemporerMaqashidi
          : "Menggali tujuan luhur syariat (maqashid al-syari'ah), prinsip keadilan, dan nilai etis universal dari wacana ayat."
      }
    ];

    const shown = cards.filter((c) => studioTafsirFilter === "all" || c.group === studioTafsirFilter);
    el.studioTafsirCards.innerHTML = shown
      .map(
        (c) => `
      <div class="p-4 rounded-xl border ${c.color} space-y-1.5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h4 class="font-bold text-xs sm:text-sm ${c.titleColor}">${escapeHtml(c.title)}</h4>
          <div class="flex flex-wrap items-center gap-1.5">
            ${
              c.isIbnuKatsir
                ? `<div class="inline-flex rounded-lg bg-amber-100/90 p-0.5 border border-amber-200 text-[10px] font-bold">
                    <button type="button" data-ik-lang="id" class="ik-lang-btn px-2 py-0.5 rounded-md ${ibnKatsirLang === "id" ? "bg-amber-600 text-white" : "text-amber-900 hover:bg-amber-200/70"} transition">Indonesia</button>
                    <button type="button" data-ik-lang="en" class="ik-lang-btn px-2 py-0.5 rounded-md ${ibnKatsirLang === "en" ? "bg-amber-600 text-white" : "text-amber-900 hover:bg-amber-200/70"} transition">English</button>
                  </div>`
                : `<span class="px-2 py-0.5 text-[10px] font-semibold bg-white/80 rounded border border-slate-200 text-slate-600">${escapeHtml(c.badge)}</span>`
            }
            <button type="button" data-ai-scope="studio-card" data-ai-label="${escapeHtml(c.title)}" data-ai-snippet="${escapeHtml(c.body)}" class="btn-ask-ai-cloud inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 text-[10px] font-bold transition">
              <svg class="w-3 h-3 text-sky-600" fill="currentColor" viewBox="0 0 24 24"><path d="M6.5 19h11a4.5 4.5 0 00.9-8.91A6 6 0 006.74 8.2 4 4 0 006.5 19z"/></svg>
              <span>Tanya AI</span>
            </button>
          </div>
        </div>
        <p class="text-slate-700">${escapeHtml(c.body)}</p>
      </div>
    `
      )
      .join("");
  }

  // =========================================================================
  // CORE LSF DATASET & VALIDATION
  // =========================================================================
  function validateVerseEntry(key, v) {
    const errs = [];
    if (!v || typeof v !== "object") return [`Ayat '${key}' harus berupa objek.`];
    const required = ["ref", "arabic", "translit", "translation", "processCategory", "themeCategory", "diagramSegments", "tokens", "ideational", "interpersonal", "textual"];
    required.forEach((field) => {
      if (v[field] === undefined || v[field] === null) errs.push(`Ayat '${key}' kekurangan field wajib '${field}'.`);
    });
    if (v.processCategory && !VALID_PROCESSES.includes(v.processCategory)) {
      errs.push(`Ayat '${key}': processCategory '${v.processCategory}' tidak valid.`);
    }
    if (v.speechCategory && !VALID_SPEECH.includes(v.speechCategory)) {
      errs.push(`Ayat '${key}': speechCategory '${v.speechCategory}' tidak valid.`);
    }
    if (v.themeCategory && !VALID_THEMES.includes(v.themeCategory)) {
      errs.push(`Ayat '${key}': themeCategory '${v.themeCategory}' tidak valid.`);
    }
    return errs;
  }

  function validateImportedJson(parsed) {
    if (!parsed || typeof parsed !== "object") return { ok: false, errors: ["Root JSON harus berupa objek."] };
    if (parsed.verses && typeof parsed.verses === "object") {
      const keys = Object.keys(parsed.verses);
      if (keys.length === 0) return { ok: false, errors: ["Objek 'verses' kosong."] };
      const allErrs = [];
      keys.forEach((k) => allErrs.push(...validateVerseEntry(k, parsed.verses[k])));
      if (allErrs.length > 0) return { ok: false, errors: allErrs.slice(0, 6) };
      return { ok: true, mode: "dataset", data: parsed };
    }
    if (parsed.ref && parsed.arabic) {
      const errs = validateVerseEntry("single", parsed);
      if (errs.length > 0) return { ok: false, errors: errs };
      return { ok: true, mode: "single", data: parsed };
    }
    return { ok: false, errors: ["Format JSON tidak dikenali."] };
  }

  async function initDataset() {
    if (window.location.protocol.startsWith("http")) {
      try {
        const resp = await fetch("./quranic-sfl-data.json");
        if (resp.ok) {
          const remoteJson = await resp.json();
          if (remoteJson && remoteJson.verses) dataset = remoteJson;
        }
      } catch (_) {
        // Fallback to quranic-sfl-data.js
      }
    }

    try {
      const savedDataset = localStorage.getItem(STORAGE_KEY_IMPORTED_DATASET);
      if (savedDataset) {
        const parsed = JSON.parse(savedDataset);
        if (parsed && parsed.verses) dataset = parsed;
      }
      const savedCustom = localStorage.getItem(STORAGE_KEY_CUSTOM_VERSES);
      if (savedCustom) {
        const customVerses = JSON.parse(savedCustom);
        Object.assign(dataset.verses, customVerses);
      }
    } catch (_) {
      // Ignore
    }

    try {
      const savedArabicPref = localStorage.getItem(STORAGE_KEY_ARABIC_TERMS);
      if (savedArabicPref === "0") showArabicTerms = false;
      else if (savedArabicPref === "1") showArabicTerms = true;
    } catch (_) {
      // Ignore
    }
    syncArabicTermsUi();

    populateGuideReferencesAndGlossary();
    populateQuickSurahSelect();
    populateStudioSelectors();
    populateCompareSelectors();
    renderSurahGrid();
    selectMushafSurah(1);

    applyFilters();
    const keys = Object.keys(dataset.verses);
    if (keys.length > 0) {
      renderVerse(keys.includes("1:2") ? "1:2" : keys[0]);
    }
    renderAnalytics();
    setPillar("sfl");
  }

  function syncArabicTermsUi() {
    document.body.classList.toggle("hide-arabic-terms", !showArabicTerms);
    if (el.labelArabicTerms) {
      el.labelArabicTerms.textContent = showArabicTerms ? "Istilah Arab: ON" : "Istilah Arab: OFF";
    }
    if (el.btnToggleArabicTerms) {
      el.btnToggleArabicTerms.setAttribute("aria-pressed", showArabicTerms ? "true" : "false");
      el.btnToggleArabicTerms.className = showArabicTerms
        ? "text-xs bg-[#fdf4df] hover:bg-[#faebc8] text-[#7c2d12] font-bold px-3.5 py-1.5 rounded-full border border-[#ebd7ac] transition flex items-center gap-1.5 shadow-2xs"
        : "text-xs bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold px-3.5 py-1.5 rounded-full border border-slate-300 transition flex items-center gap-1.5 shadow-2xs";
    }
  }

  el.btnToggleArabicTerms.addEventListener("click", () => {
    showArabicTerms = !showArabicTerms;
    try {
      localStorage.setItem(STORAGE_KEY_ARABIC_TERMS, showArabicTerms ? "1" : "0");
    } catch (_) {
      // Ignore
    }
    syncArabicTermsUi();
    if (activeVerseObj) renderVerseObject(currentVerseKey, activeVerseObj);
    renderAnalytics();
    if (isCompareMode) renderComparison();
    showToast(showArabicTerms ? "Istilah Arab LSF: ON (Ditampilkan)" : "Istilah Arab LSF: OFF (Disembunyikan)");
  });

  // Analytics
  function renderAnalytics() {
    const verses = Object.values(dataset.verses || {});
    const total = verses.length;
    el.analyticsTotalVerses.textContent = `${total} Ayat`;

    const counts = {};
    VALID_PROCESSES.forEach((p) => { counts[p] = 0; });
    verses.forEach((v) => {
      if (counts[v.processCategory] !== undefined) counts[v.processCategory] += 1;
    });

    el.analyticsLiveBars.innerHTML = VALID_PROCESSES.map((proc) => {
      const count = counts[proc];
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      const barColor = PROCESS_BAR_COLORS[proc] || "bg-emerald-600";
      return `
        <div class="space-y-1">
          <div class="flex justify-between text-[11px]">
            <span class="font-semibold text-slate-700">${proc}${showArabicTerms ? ` <span class="arabic-term-badge font-arabic text-slate-500">(${PROCESS_AR_MAP[proc]})</span>` : ""}</span>
            <span class="font-semibold text-slate-800">${count} ayat (${pct}%)</span>
          </div>
          <div class="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div class="${barColor} h-full rounded-full transition-all duration-300" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join("");

    const benchmark = (dataset.metadata && dataset.metadata.corpusBenchmark && dataset.metadata.corpusBenchmark.distribution) || {
      Material: 47.0,
      Verbal: 14.7,
      Mental: 14.7,
      Relational: 11.8,
      Existential: 11.8,
      Behavioural: 0.0
    };

    el.analyticsBenchmarkBars.innerHTML = VALID_PROCESSES.map((proc) => {
      const pct = benchmark[proc] ?? 0;
      const barColor = PROCESS_BAR_COLORS[proc] || "bg-emerald-600";
      return `
        <div class="space-y-1">
          <div class="flex justify-between text-[11px]">
            <span class="font-semibold text-emerald-950">${proc}${showArabicTerms ? ` <span class="arabic-term-badge font-arabic text-emerald-800">(${PROCESS_AR_MAP[proc]})</span>` : ""}</span>
            <span class="font-semibold text-emerald-950">${pct}%</span>
          </div>
          <div class="w-full h-2 bg-white border border-emerald-200 rounded-full overflow-hidden">
            <div class="${barColor} h-full rounded-full" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join("");
  }

  el.btnToggleAnalytics.addEventListener("click", () => {
    isAnalyticsOpen = !isAnalyticsOpen;
    el.sectionAnalytics.classList.toggle("hidden", !isAnalyticsOpen);
    if (isAnalyticsOpen) {
      renderAnalytics();
      el.sectionAnalytics.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  el.btnAnalyticsNewWindow.addEventListener("click", () => {
    renderAnalytics();
    const bodyHtml = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="bg-white rounded-2xl border border-emerald-200 p-5 space-y-3">
          <div class="flex justify-between items-center border-b border-slate-100 pb-2">
            <h2 class="font-bold text-sm text-emerald-950">Distribusi Korpus LSF Saat Ini</h2>
            <span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-xs font-bold">${escapeHtml(el.analyticsTotalVerses.textContent)}</span>
          </div>
          ${el.analyticsLiveBars.innerHTML}
        </div>
        <div class="bg-white rounded-2xl border border-amber-200 p-5 space-y-3">
          <div class="border-b border-slate-100 pb-2">
            <h2 class="font-bold text-sm text-amber-950">Benchmark Korpus Ebook LSF (Al-Baqarah)</h2>
          </div>
          ${el.analyticsBenchmarkBars.innerHTML}
        </div>
      </div>`;
    openStandaloneWindow("Statistik Korpus Linguistik Sistemik Fungsional", bodyHtml, "Distribusi Transitivitas 6 Proses Halliday");
  });
  el.btnCloseAnalytics.addEventListener("click", () => {
    isAnalyticsOpen = false;
    el.sectionAnalytics.classList.add("hidden");
  });

  // Comparison Mode (2 Verses — Seluruh 114 Surat & 6.236 Ayat)
  el.btnToggleCompare.addEventListener("click", () => {
    isCompareMode = !isCompareMode;
    el.sectionComparison.classList.toggle("hidden", !isCompareMode);
    el.labelCompareBtn.textContent = isCompareMode ? "Sembunyikan Komparasi" : "Bandingkan 2 Ayat";
    if (isCompareMode) {
      populateCompareSelectors();
      renderComparison();
      el.sectionComparison.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  el.btnCompareNewWindow.addEventListener("click", () => {
    populateCompareSelectors();
    renderComparison();
    const sA = el.compareSurahA.value;
    const aA = el.compareAyahA.value;
    const sB = el.compareSurahB.value;
    const aB = el.compareAyahB.value;
    const itemA = getOrBuildVerseObj(sA, aA);
    const itemB = getOrBuildVerseObj(sB, aB);
    if (!itemA || !itemB) return;
    const bodyHtml = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="bg-white rounded-2xl border border-emerald-200 p-5 space-y-3">
          <span class="px-2.5 py-1 rounded bg-emerald-100 text-emerald-900 text-xs font-bold">${escapeHtml(itemA.ref)}</span>
          <p class="font-arabic text-2xl text-right leading-[2.3] text-emerald-950" dir="rtl">${formatQuranArabicHtml(itemA.arabic)}</p>
          <p class="text-xs text-slate-600 italic">"${escapeHtml(itemA.translation)}"</p>
          <div class="text-xs space-y-1 pt-2 border-t border-slate-100">
            <div><strong>Proses:</strong> ${escapeHtml(itemA.ideational.processType)}</div>
            <div><strong>Fungsi Tutur:</strong> ${escapeHtml(itemA.interpersonal.speechFunc)}</div>
            <div><strong>Pola Tema:</strong> ${escapeHtml(itemA.textual.themeType)}</div>
          </div>
        </div>
        <div class="bg-white rounded-2xl border border-amber-200 p-5 space-y-3">
          <span class="px-2.5 py-1 rounded bg-amber-100 text-amber-900 text-xs font-bold">${escapeHtml(itemB.ref)}</span>
          <p class="font-arabic text-2xl text-right leading-[2.3] text-emerald-950" dir="rtl">${formatQuranArabicHtml(itemB.arabic)}</p>
          <p class="text-xs text-slate-600 italic">"${escapeHtml(itemB.translation)}"</p>
          <div class="text-xs space-y-1 pt-2 border-t border-slate-100">
            <div><strong>Proses:</strong> ${escapeHtml(itemB.ideational.processType)}</div>
            <div><strong>Fungsi Tutur:</strong> ${escapeHtml(itemB.interpersonal.speechFunc)}</div>
            <div><strong>Pola Tema:</strong> ${escapeHtml(itemB.textual.themeType)}</div>
          </div>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-indigo-200 p-5 text-xs leading-relaxed">
        <h2 class="font-bold text-sm text-indigo-900 mb-1">Sintesis Komparasi LSF</h2>
        <p>${el.compareSynthesisText.innerHTML}</p>
      </div>`;
    openStandaloneWindow(`Bandingkan 2 Ayat: ${itemA.ref} vs ${itemB.ref}`, bodyHtml, "Analisis Komparatif Metafungsi LSF");
  });
  el.btnCloseComparison.addEventListener("click", () => {
    isCompareMode = false;
    el.sectionComparison.classList.add("hidden");
    el.labelCompareBtn.textContent = "Bandingkan 2 Ayat";
  });

  function populateCompareSelectors() {
    if (!el.compareSurahA || !el.compareAyahA || !el.compareSurahB || !el.compareAyahB) return;
    if (el.compareSurahA.options.length === 0) {
      const surahHtml = buildSurahOptionsHtml();
      el.compareSurahA.innerHTML = surahHtml;
      el.compareSurahB.innerHTML = surahHtml;

      const curS = activeVerseObj ? Number(activeVerseObj.surah) : 1;
      const curA = activeVerseObj ? Number(activeVerseObj.verse) : 2;
      el.compareSurahA.value = String(curS);
      el.compareAyahA.innerHTML = buildAyahOptionsHtml(curS, { markCurated: true });
      el.compareAyahA.value = String(curA);

      const defSurahB = curS === 14 && curA === 11 ? 2 : 14;
      const defAyahB = curS === 14 && curA === 11 ? 255 : 11;
      el.compareSurahB.value = String(defSurahB);
      el.compareAyahB.innerHTML = buildAyahOptionsHtml(defSurahB, { markCurated: true });
      el.compareAyahB.value = String(defAyahB);
    }
  }

  el.compareSurahA.addEventListener("change", () => {
    const sid = parseInt(el.compareSurahA.value, 10) || 1;
    el.compareAyahA.innerHTML = buildAyahOptionsHtml(sid, { markCurated: true });
    renderComparison();
  });
  el.compareAyahA.addEventListener("change", renderComparison);
  el.compareSurahB.addEventListener("change", () => {
    const sid = parseInt(el.compareSurahB.value, 10) || 1;
    el.compareAyahB.innerHTML = buildAyahOptionsHtml(sid, { markCurated: true });
    renderComparison();
  });
  el.compareAyahB.addEventListener("change", renderComparison);

  function renderComparison() {
    const sA = parseInt(el.compareSurahA.value, 10) || 1;
    const aA = parseInt(el.compareAyahA.value, 10) || 1;
    const sB = parseInt(el.compareSurahB.value, 10) || 14;
    const aB = parseInt(el.compareAyahB.value, 10) || 11;
    const itemA = getOrBuildVerseObj(sA, aA);
    const itemB = getOrBuildVerseObj(sB, aB);
    if (!itemA || !itemB) return;

    el.compareArabicA.innerHTML = formatQuranArabicHtml(itemA.arabic, true);
    el.compareTransA.textContent = `"${itemA.translation}"`;
    el.compareProcA.textContent = `${itemA.ideational.processType}${showArabicTerms && itemA.processCategoryAr ? ` (${itemA.processCategoryAr})` : ""}`;
    el.compareSpeechA.textContent = itemA.interpersonal.speechFunc;
    el.compareThemeA.textContent = itemA.textual.themeType;

    el.compareArabicB.innerHTML = formatQuranArabicHtml(itemB.arabic, true);
    el.compareTransB.textContent = `"${itemB.translation}"`;
    el.compareProcB.textContent = `${itemB.ideational.processType}${showArabicTerms && itemB.processCategoryAr ? ` (${itemB.processCategoryAr})` : ""}`;
    el.compareSpeechB.textContent = itemB.interpersonal.speechFunc;
    el.compareThemeB.textContent = itemB.textual.themeType;

    let synthesis = `<strong>Analisis Komparatif:</strong> <em>${escapeHtml(itemA.ref)}</em> bertumpu pada Proses <strong>${escapeHtml(itemA.processCategory)}</strong> (${escapeHtml(PROCESS_AR_MAP[itemA.processCategory] || "")}) dengan pola tema <strong>${escapeHtml(itemA.themeCategory)}</strong>. `;
    if (itemA.themeCategory !== itemB.themeCategory) {
      synthesis += `Sebaliknya, <em>${escapeHtml(itemB.ref)}</em> beralih ke pola <strong>${escapeHtml(itemB.themeCategory)} Theme</strong> untuk menata fokus wacana dan penegasan retoris (<em>Taqdim / Qashr</em>). `;
    } else {
      synthesis += `Keduanya menerapkan pola tema <strong>${escapeHtml(itemA.themeCategory)}</strong> dalam menyusun titik tolak pesan. `;
    }
    synthesis += `Pada dimensi interpersonal, fungsi tutur bergeser dari <strong>${escapeHtml(itemA.interpersonal.speechFunc)}</strong> ke <strong>${escapeHtml(itemB.interpersonal.speechFunc)}</strong>.`;
    el.compareSynthesisText.innerHTML = synthesis;
  }

  // Guide Modal & Dynamic Knowledge Store (Pembaruan Berkala Gemini AI -> Pustaka & Kamus)
  function loadDynamicKnowledge() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY_DYNAMIC_KNOWLEDGE) || "{}");
      return {
        lastUpdated: raw.lastUpdated || "",
        glossaryEntries: Array.isArray(raw.glossaryEntries) ? raw.glossaryEntries : [],
        libraryEntries: Array.isArray(raw.libraryEntries) ? raw.libraryEntries : []
      };
    } catch (_) {
      return { lastUpdated: "", glossaryEntries: [], libraryEntries: [] };
    }
  }

  let dynamicKnowledge = loadDynamicKnowledge();

  function formatSyncTimestamp(isoStr) {
    if (!isoStr) return "Belum ada pembaruan";
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch (_) {
      return isoStr;
    }
  }

  function saveDynamicKnowledge() {
    dynamicKnowledge.lastUpdated = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY_DYNAMIC_KNOWLEDGE, JSON.stringify(dynamicKnowledge));
    } catch (_) {
      // Ignore quota errors
    }
  }

  function upsertDynamicEntry(listName, entry, maxItems) {
    const list = dynamicKnowledge[listName] || [];
    const idx = list.findIndex((x) => x.key === entry.key);
    const stamped = { ...entry, updatedAt: new Date().toISOString() };
    if (idx >= 0) {
      const prev = list[idx];
      if (prev.description === stamped.description && prev.notes === stamped.notes && prev.title === stamped.title) {
        return false;
      }
      list.splice(idx, 1);
    }
    list.unshift(stamped);
    if (list.length > maxItems) list.length = maxItems;
    dynamicKnowledge[listName] = list;
    return true;
  }

  function captureGeminiKnowledgeFromVerse(v, reasonLabel = "Sinkronisasi Ayat") {
    if (!v) return false;
    let changed = false;

    // 1) Tangkap akar kata Arab & istilah LSF baru ke Kamus Dinamis
    const richTokens = (v.tokens || []).filter((t) => t && t.ar && (t.root && t.root !== "-" || t.roleAr)).slice(0, 3);
    richTokens.forEach((t) => {
      const cleanRoot = t.root && t.root !== "-" ? ` (Akar: ${t.root})` : "";
      const didChange = upsertDynamicEntry(
        "glossaryEntries",
        {
          key: `tok:${t.ar}:${t.role || ""}`,
          labelId: `${t.role || "Elemen Klausa"} • ${v.ref}`,
          labelEn: `${t.pos || "Arabic Lexical"} (${t.tr && t.tr !== "-" ? t.tr : "Token"})`,
          labelAr: `${t.ar}${t.roleAr ? ` — ${t.roleAr}` : ""}`,
          description: `${t.role || "Peran LSF"} dalam klausa ${v.ref}${cleanRoot}. Kategori Proses: ${v.processCategory || "-"} • Tema: ${v.themeCategory || "-"}.`,
          origin: reasonLabel
        },
        60
      );
      if (didChange) changed = true;
    });

    // 2) Tangkap entri Pustaka & Rujukan Kajian untuk ayat / tafsir aktif
    const bridgeTxt = v.nahwuBalaghahBridge
      ? `Nahwu: ${v.nahwuBalaghahBridge.nahwu} | Balaghah: ${v.nahwuBalaghahBridge.balaghah}`
      : `Proses ${v.processCategory}, Tutur ${v.speechCategory}, Tema ${v.themeCategory}.`;
    const libChanged = upsertDynamicEntry(
      "libraryEntries",
      {
        key: `ref:${v.surah}:${v.verse}`,
        title: `Catatan Kajian Gemini AI — ${v.ref}`,
        type: `${reasonLabel} • LSF & Tafsir (${ibnKatsirLang === "en" ? "EN" : "ID"})`,
        author: "Gemini AI • Korpus LSF & Tafsir Kemenag / Ibnu Katsir",
        year: formatSyncTimestamp(new Date().toISOString()),
        notes: `${bridgeTxt} — Sintesis: ${(v.ideational && v.ideational.summary) || v.translation || "-"}`
      },
      40
    );
    if (libChanged) changed = true;

    if (changed) {
      saveDynamicKnowledge();
      populateGuideReferencesAndGlossary();
    }
    return changed;
  }

  function captureGeminiQaKnowledge(promptText, scope, v, summarySnippet) {
    if (!v && !promptText) return;
    const ref = v ? v.ref : "Korpus Al-Qur'an";
    const keyTerms = v ? buildGeminiKeyTerms(v) : [];
    const arTerm = keyTerms.find((k) => k.isArabic);
    const plainSnippet = String(summarySnippet || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220);

    const gChanged = upsertDynamicEntry(
      "glossaryEntries",
      {
        key: `qa:${ref}:${scope}:${promptText.slice(0, 40)}`,
        labelId: `${promptText.slice(0, 56)}${promptText.length > 56 ? "..." : ""}`,
        labelEn: `Gemini AI (${scope || "LSF"}) • ${ref}`,
        labelAr: arTerm ? arTerm.label : (v && v.arabic ? v.arabic.split(/\s+/).slice(0, 2).join(" ") : "اللسانيات"),
        description: plainSnippet || `Uraian Gemini AI untuk ${ref}.`,
        origin: "Gemini AI Tanya Jawab"
      },
      60
    );
    const lChanged = upsertDynamicEntry(
      "libraryEntries",
      {
        key: `qa-lib:${ref}:${scope}`,
        title: `Sintesis Tanya Jawab Gemini AI: ${ref} (${scope})`,
        type: "Pengembangan Berkala Gemini AI",
        author: "Gemini AI • Integrasi LSF, Kemenag & Ibnu Katsir",
        year: formatSyncTimestamp(new Date().toISOString()),
        notes: `${promptText} → ${plainSnippet}`
      },
      40
    );
    if (gChanged || lChanged) {
      saveDynamicKnowledge();
      populateGuideReferencesAndGlossary();
    }
  }

  function populateGuideReferencesAndGlossary() {
    const tax = dataset.taxonomy || {};
    const sections = [
      { title: "6 Tipe Proses Transitivitas", titleAr: "العمليات", items: tax.processes || [] },
      { title: "Peran Partisipan", titleAr: "المشاركون", items: tax.participants || [] },
      { title: "Sirkumstansi Konteks", titleAr: "محددات الظروف", items: tax.circumstances || [] }
    ];

    const dynGlossary = dynamicKnowledge.glossaryEntries || [];
    const dynLibs = dynamicKnowledge.libraryEntries || [];

    if (el.glossaryDynamicBadge) {
      el.glossaryDynamicBadge.textContent = `+${dynGlossary.length}`;
      el.glossaryDynamicBadge.classList.toggle("hidden", dynGlossary.length === 0);
    }
    if (el.refsDynamicBadge) {
      el.refsDynamicBadge.textContent = `+${dynLibs.length}`;
      el.refsDynamicBadge.classList.toggle("hidden", dynLibs.length === 0);
    }
    if (el.theorySyncText) {
      el.theorySyncText.textContent = `✦ Sinkronisasi Gemini AI: +${dynGlossary.length} Entri Kamus & +${dynLibs.length} Catatan Pustaka • Pembaruan: ${formatSyncTimestamp(dynamicKnowledge.lastUpdated)}`;
    }

    const dynGlossaryHtml = dynGlossary.length
      ? `
      <div class="border border-sky-200 rounded-xl overflow-hidden bg-sky-50/30">
        <div class="bg-sky-100/80 px-3 py-2 font-bold text-sky-950 flex flex-wrap items-center justify-between gap-2">
          <span>Pengembangan Kamus Otomatis oleh Gemini AI (${dynGlossary.length} Entri Terbaru)</span>
          <span class="text-[10px] font-semibold text-sky-800">Pembaruan: ${escapeHtml(formatSyncTimestamp(dynamicKnowledge.lastUpdated))}</span>
        </div>
        <div class="divide-y divide-sky-100">
          ${dynGlossary
            .map(
              (item) => `
            <div class="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2 items-start bg-white/80">
              <div>
                <div class="font-semibold text-emerald-950">${escapeHtml(item.labelId)}</div>
                <div class="text-[10px] text-sky-800 font-medium">${escapeHtml(item.labelEn)}</div>
              </div>
              <div class="arabic-term-badge font-arabic text-base font-bold text-teal-800" dir="rtl">${escapeHtml(item.labelAr || "—")}</div>
              <div class="text-slate-600">${escapeHtml(item.description)}</div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `
      : "";

    el.glossaryContent.innerHTML =
      dynGlossaryHtml +
      sections
        .map(
          (sec) => `
      <div class="border border-slate-200 rounded-xl overflow-hidden">
        <div class="bg-slate-100 px-3 py-2 font-bold text-slate-800">${escapeHtml(sec.title)}<span class="arabic-term-badge"> (${escapeHtml(sec.titleAr)})</span></div>
        <div class="divide-y divide-slate-100">
          ${sec.items
            .map(
              (item) => `
            <div class="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2 items-start">
              <div>
                <div class="font-semibold text-emerald-900">${escapeHtml(item.labelId)}</div>
                <div class="text-[11px] text-slate-500">${escapeHtml(item.labelEn)}</div>
              </div>
              <div class="arabic-term-badge font-arabic text-base font-bold text-teal-800" dir="rtl">${escapeHtml(item.labelAr)}</div>
              <div class="text-slate-600">${escapeHtml(item.description)}</div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `
        )
        .join("");

    const baseRefs = (dataset.metadata && dataset.metadata.references) || [];
    const hasIkRef = baseRefs.some((r) => (r.title || "").toLowerCase().includes("ibnu katsir"));
    const staticRefs = hasIkRef
      ? baseRefs
      : [
          ...baseRefs,
          {
            title: "Tafsir Ibnu Katsir (Lubaabut Tafsiir Min Ibni Katsiir) Jilid I–VIII",
            type: "Kitab Tafsir Klasik (Lubaabut Tafsiir • 6.236 Ayat)",
            author: "Ibnu Katsir / DR. Abdullah bin Muhammad Al-Sheikh (Pustaka Imam Asy-Syafi'i)",
            year: "2004 • Pustaka Imam Asy-Syafi'i",
            notes: "Integrasi penuh 114 surat & 6.236 ayat (Matan Arab & Terjemahan) bersama rujukan edisi 8 Jilid Pustaka Imam Asy-Syafi'i."
          }
        ];
    const refs = [...dynLibs, ...staticRefs];
    el.referencesList.innerHTML = refs
      .map(
        (r) => `
      <div class="p-3.5 ${r.key ? "bg-sky-50/70 border-sky-200" : "bg-slate-50 border-slate-200"} rounded-xl border space-y-1">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-bold text-emerald-950">${escapeHtml(r.title)}</span>
          <span class="px-2 py-0.5 text-[10px] font-semibold ${r.key ? "bg-sky-100 text-sky-900" : "bg-emerald-100 text-emerald-800"} rounded">${escapeHtml(r.type)}</span>
        </div>
        <div class="text-slate-600">Sumber/Penulis: <strong>${escapeHtml(r.author)}</strong> (${escapeHtml(r.year || "-")})</div>
        ${r.notes ? `<p class="text-slate-500">${escapeHtml(r.notes)}</p>` : ""}
      </div>
    `
      )
      .join("");
  }

  function setGuideTab(activeKey) {
    const map = [
      { key: "theory", btn: document.getElementById("guide-tab-theory"), panel: document.getElementById("guide-panel-theory") },
      { key: "glossary", btn: document.getElementById("guide-tab-glossary"), panel: document.getElementById("guide-panel-glossary") },
      { key: "refs", btn: document.getElementById("guide-tab-refs"), panel: document.getElementById("guide-panel-refs") }
    ];
    map.forEach((item) => {
      const isActive = item.key === activeKey;
      item.btn.className = `guide-tab px-3 py-2 border-b-2 ${isActive ? "border-emerald-600 text-emerald-800" : "border-transparent text-slate-500 hover:text-slate-800"}`;
      item.panel.classList.toggle("hidden", !isActive);
    });
  }

  document.getElementById("guide-tab-theory").addEventListener("click", () => setGuideTab("theory"));
  document.getElementById("guide-tab-glossary").addEventListener("click", () => setGuideTab("glossary"));
  document.getElementById("guide-tab-refs").addEventListener("click", () => setGuideTab("refs"));

  el.btnInfoToggle.addEventListener("click", () => el.theoryModal.classList.remove("hidden"));
  el.btnTheoryNewWindow.addEventListener("click", () => {
    const html = `
      <div class="bg-white rounded-2xl border border-emerald-200 p-5 space-y-4">
        <h2 class="font-bold text-base text-emerald-950">1. Kerangka Teori LSF (3 Metafungsi &amp; 6 Proses)</h2>
        ${document.getElementById("guide-panel-theory").innerHTML}
      </div>
      <div class="bg-white rounded-2xl border border-emerald-200 p-5 space-y-3">
        <h2 class="font-bold text-base text-emerald-950">2. Kamus Istilah Arab–LSF</h2>
        ${el.glossaryContent.innerHTML}
      </div>
      <div class="bg-white rounded-2xl border border-amber-200 p-5 space-y-3">
        <h2 class="font-bold text-base text-amber-950">3. Pustaka Ebook &amp; Kitab Tafsir</h2>
        ${el.referencesList.innerHTML}
      </div>`;
    openStandaloneWindow("Pustaka, Kamus & Panduan Teori LSF", html, "Korpus LSF Halliday & Kitab Tafsir");
  });
  el.btnKtmNewWindow.addEventListener("click", () => {
    const html = `
      <div class="bg-slate-50 rounded-2xl border border-slate-200 p-4 text-right space-y-2">
        <p class="font-arabic text-2xl leading-[2.3] text-emerald-950" dir="rtl">${el.ktmArabic.innerHTML}</p>
        <p class="text-xs text-slate-500 italic text-left">${escapeHtml(el.ktmTranslit.textContent)}</p>
        <p class="text-sm text-slate-800 font-medium text-left">${escapeHtml(el.ktmTranslation.textContent)}</p>
      </div>
      <div class="bg-white rounded-2xl border border-emerald-200 p-5 space-y-2">
        <h2 class="font-bold text-sm text-emerald-900">Tafsir Tahlili Kemenag RI</h2>
        <div class="text-xs sm:text-sm leading-relaxed whitespace-pre-line">${escapeHtml(el.ktmBody.textContent)}</div>
      </div>
      <div class="bg-white rounded-2xl border border-amber-200 p-5 space-y-3">
        <h2 class="font-bold text-sm text-amber-950">Tafsir Ibnu Katsir (Ma'tsur)</h2>
        <div class="font-arabic text-xl text-right leading-[2.2] bg-amber-50/50 p-3 rounded-xl" dir="rtl">${escapeHtml(el.ktmIkAr.textContent)}</div>
        <div class="text-xs sm:text-sm leading-relaxed whitespace-pre-line">${escapeHtml(el.ktmIkEn.textContent)}</div>
      </div>`;
    openStandaloneWindow(el.ktmTitle.textContent || "Tafsir Kemenag & Ibnu Katsir", html, "Tafsir Tahlili Kemenag & Ibnu Katsir");
  });
  el.btnCloseModal.addEventListener("click", () => el.theoryModal.classList.add("hidden"));
  el.btnCloseModalBottom.addEventListener("click", () => el.theoryModal.classList.add("hidden"));

  // =========================================================================
  // REFERENSI INTI: 6 PROSES LSF & KITAB TAFSIR (MODAL WINDOW & JENDELA BARU)
  // =========================================================================
  const LSF_PROCESS_KNOWLEDGE = {
    Material: {
      pill: "1. Metafungsi Ideasional • Transitivitas LSF",
      title: "Proses Material (Material Process)",
      titleAr: "العملية المادية",
      subtitle: "Klausa tindakan fisik, peristiwa nyata, dan aksi kebendaan (Doing & Happening)",
      summary: "Proses Material adalah jenis proses utama dalam Metafungsi Ideasional (Transitivitas) LSF Halliday yang memodelkan pengalaman eksternal manusia berupa aksi fisik, perbuatan konkret, atau peristiwa dinamis yang terjadi dalam dunia objektif.",
      coreQuestions: "Apa yang dilakukan oleh Actor? / Apa yang terjadi terhadap Goal?",
      participants: [
        { nameEn: "Actor", nameAr: "الفاعل / المُحْدِث", role: "Entitas sadar atau benda yang melakukan tindakan atau menjadi penggerak aksi." },
        { nameEn: "Goal", nameAr: "المفعول به / الهدف", role: "Entitas yang menjadi sasaran langsung atau terdampak oleh tindakan Actor." },
        { nameEn: "Scope / Range", nameAr: "المفعول المطلق / النطاق", role: "Batasan atau domain aktivitas tanpa mengalami perubahan bentuk fisik." },
        { nameEn: "Recipient / Client", nameAr: "المستفيد / المجرور باللام", role: "Penerima manfaat atau pihak yang diserahi sesuatu." }
      ],
      nahwuBalaghah: "Dalam tata bahasa Arab klasik, Proses Material berkorespondensi dengan <strong>Fi'il Muta'addi (فعل متعدٍ)</strong> yang menuntut <em>Fa'il</em> dan <em>Maf'ul bih</em>, atau <strong>Fi'il Lazim (فعل لازم)</strong> yang hanya membutuhkan <em>Fa'il</em>. Dari tinjauan Balaghah (Ilmu Ma'ani), penggunaan kata kerja material menunjukkan <em>At-Tajaddud wal-Huduts (التجدد والحدوث)</em>, yaitu keterbaruan peristiwa yang terjadi secara berproses dalam dimensi ruang dan waktu.",
      quranVerse: "الَّذِي جَعَلَ لَكُمُ الْأَرْضَ فِرَاشًا وَالسَّمَاءَ بِنَاءً وَأَنْزَلَ مِنَ السَّمَاءِ مَاءً فَأَخْرَجَ بِهِ مِنَ الثَّمَرَاتِ رِزْقًا لَكُمْ",
      quranRef: "QS. Al-Baqarah [2]: 22",
      quranTrans: "\"(Dialah) yang menjadikan bumi sebagai hamparan bagimu dan langit sebagai atap, dan Dialah yang menurunkan air (hujan) dari langit, lalu Dia menghasilkan dengan (hujan) itu buah-buahan sebagai rezeki untukmu.\"",
      quranAnalysis: [
        { part: "أَنْزَلَ (Anzala)", role: "Proses Material (Tindakan fisik menurunkan air hujan)" },
        { part: "هُوَ / Allah (Dhamir Mustatir)", role: "Actor (Pelaku Tunggal Maha Kuasa)" },
        { part: "مَاءً (Mā'an)", role: "Goal (Objek fisik materi yang diturunkan)" },
        { part: "مِنَ السَّمَاءِ (Minas-Samā'i)", role: "Sirkumstansi Lokasi Spasial (Sumber/Arah)" }
      ],
      tafsirNote: "Tafsir Ibnu Katsir menguraikan bahwa ayat ini menyajikan bukti-bukti empiris materiil penciptaan alam semesta sebagai dalil qath'i bagi manusia untuk beribadah semata-mata kepada Allah tanpa menyekutukan-Nya (Tauhid Rububiyyah & Uluhiyyah).",
      references: [
        "Halliday, M.A.K. & Matthiessen, C.M.I.M. (2014). Halliday's Introduction to Functional Grammar (4th ed.). Routledge, Bab 5 'Clauses as Representation', hlm. 224–248.",
        "Eggins, Suzanne. (2004). An Introduction to Systemic Functional Linguistics (2nd ed.). Continuum, hlm. 215–228.",
        "Ad-Darwisy, Muhyiddin. I'rab Al-Qur'an Al-Karim wa Bayanuhu, Jilid 1, hlm. 68–73.",
        "Tafsir Al-Qur'an Al-'Azhim (Ibnu Katsir), Jilid 1, Penjelasan QS. Al-Baqarah: 21–22.",
        "Kementerian Agama RI. Al-Qur'an dan Tafsirnya (Edisi yang Disempurnakan), Tafsir Tahlili Surah Al-Baqarah: 22."
      ]
    },
    Mental: {
      pill: "2. Metafungsi Ideasional • Transitivitas LSF",
      title: "Proses Mental (Mental Process)",
      titleAr: "العملية العقلية / الذهنية",
      subtitle: "Klausa representasi kesadaran batin, persepsi indrawi, kognisi akal, dan afeksi emosi (Sensing & Thinking)",
      summary: "Proses Mental memodelkan pengalaman batiniah makhluk berkesadaran (conscious being). Berbeda dari aksi fisik dunia luar, proses ini berlangsung di alam kesadaran pikiran, pancaindra, perasaan hati, dan kehendak ruhiyah.",
      coreQuestions: "Apa yang dipikirkan, dirasakan, dilihat, atau diketahui oleh Senser?",
      participants: [
        { nameEn: "Senser", nameAr: "المدرِك / الشاعر", role: "Partisipan sadar yang mengalami proses batin atau persepsi pancaindra." },
        { nameEn: "Phenomenon", nameAr: "المدرَك / الظاهرة", role: "Objek, ide, fakta, atau entitas yang dipersepsikan, dipikirkan, atau dirasakan." }
      ],
      nahwuBalaghah: "Berkorespondensi dengan <strong>Af'al al-Qulub (أفعال القلوب)</strong> dalam bab <em>Zhanna wa Akhwatuha</em> (علم، رأى، ظن، خاف، وجد) yang menghubungkan keyakinan hati dengan hakikat kebenaran. Dalam Balaghah, proses mental menegaskan dimensi aqidah batiniah, keikhlasan niat, dan keterikatan fitrah jiwa manusia dengan wahyu ilahi.",
      quranVerse: "المر ۚ تِلْكَ آيَاتُ الْكِتَابِ ۗ وَالَّذِي أُنْزِلَ إِلَيْكَ مِنْ رَبِّكَ الْحَقُّ وَلَٰكِنَّ أَكْثَرَ النَّاسِ لَا يُؤْمِنُونَ",
      quranRef: "QS. Ar-Ra'd [13]: 1",
      quranTrans: "\"Alif Lām Mīm Rā. Itulah ayat-ayat Kitab (Al-Qur'an). Dan (Kitab) yang diturunkan kepadamu dari Tuhanmu itu adalah kebenaran, tetapi kebanyakan manusia tidak beriman.\"",
      quranAnalysis: [
        { part: "أَكْثَرَ النَّاسِ (Aktsaran-Nās)", role: "Senser (Entitas manusia yang dituntut memiliki kesadaran iman)" },
        { part: "لَا يُؤْمِنُونَ (Lā Yu'minūn)", role: "Proses Mental Kognitif/Keimanan (Penolakan keyakinan batin)" },
        { part: "الْحَقُّ (Al-Haqq)", role: "Phenomenon (Kebenaran wahyu Al-Qur'an yang ditolak)" }
      ],
      tafsirNote: "Tafsir Kemenag RI dan Ibnu Katsir menggarisbawahi bahwa tidak berimannya mayoritas manusia bukan karena kurangnya dalil logika atau mukjizat, melainkan karena keangkuhan batin dan keengganan membuka pintu kesadaran hati terhadap kebenaran wahyu.",
      references: [
        "Halliday, M.A.K. & Matthiessen, C.M.I.M. (2014). Halliday's Introduction to Functional Grammar (4th ed.). Routledge, Bab 5, hlm. 248–268.",
        "Eggins, Suzanne. (2004). An Introduction to Systemic Functional Linguistics, hlm. 225–235.",
        "Ibnu Hisyam Al-Anshari. Awdhah Al-Masalik ila Alfiyyah Ibn Malik, Bab Af'al al-Qulub.",
        "Tafsir Al-Qur'an Al-'Azhim (Ibnu Katsir), Jilid 4, Tafsir QS. Ar-Ra'd: 1.",
        "Tafsir Tahlili Kemenag RI, Juz 13, Tafsir Surah Ar-Ra'd: 1."
      ]
    },
    Relational: {
      pill: "3. Metafungsi Ideasional • Transitivitas LSF",
      title: "Proses Relasional (Relational Process)",
      titleAr: "العملية العلائقية / التناسبية",
      subtitle: "Klausa penetapan sifat, relasi kepemilikan, atau penentuan identitas hakiki (Being & Having)",
      summary: "Proses Relasional berfungsi mengidentifikasi dan mencirikan entitas. Menghubungkan dua konsep dalam relasi logis tanpa aksi materiil, terbagi menjadi dua mode utama: <strong>Atributif</strong> (menisbatkan sifat) dan <strong>Identifikatif</strong> (menetapkan kesamaan hakikat atau definisi esensial).",
      coreQuestions: "Apa kualitas/sifat dari Carrier? / Siapa atau apa identitas dari Token/Value?",
      participants: [
        { nameEn: "Carrier / Attribute", nameAr: "الحامل / الصفة والنعت", role: "Pada relasi atributif (X memiliki karakteristik/kualitas Y)." },
        { nameEn: "Token / Value", nameAr: "الممثل / القيمة والمدلول", role: "Pada relasi identifikatif (X mendefinisikan atau sama dengan Y secara hakiki)." }
      ],
      nahwuBalaghah: "Berkorespondensi langsung dengan <strong>Jumlah Ismiyyah (جملة اسمية)</strong>: Mubtada' dan Khabar, kalimat bertauhid dengan <em>Inna wa Akhwatuha</em>, atau <em>Kana an-Naqishah</em>. Dalam kaidah Balaghah, struktur ini melambangkan <em>Ats-Tsubut wad-Dawam (الثبوت والدوام)</em>, yakni sifat atau identitas yang mapan, abadi, dan tidak terikat batas waktu.",
      quranVerse: "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
      quranRef: "QS. Al-Fatihah [1]: 2",
      quranTrans: "\"Segala puji bagi Allah, Tuhan seluruh alam.\"",
      quranAnalysis: [
        { part: "الْحَمْدُ (Al-Hamdu)", role: "Token / Carrier (Segala bentuk pujian kesempurnaan mutlak)" },
        { part: "لِلَّهِ (Lillāh)", role: "Proses Relasional Identifikatif + Nilai (Kekhususan hakiki bagi Allah)" },
        { part: "رَبِّ الْعَالَمِينَ", role: "Attribute / Value (Sifat Rububiyyah pemelihara seluruh alam)" }
      ],
      tafsirNote: "Tafsir Ibnu Katsir menerangkan bahwa penetapan puji-pujian dalam bentuk isim (relasional) menunjukkan bahwa Allah senantiasa terpuji pada dzat, nama, dan sifat-Nya sejak azali hingga abadi, terlepas apakah ada hamba yang memuji-Nya atau tidak.",
      references: [
        "Halliday, M.A.K. & Matthiessen, C.M.I.M. (2014). Halliday's Introduction to Functional Grammar (4th ed.). Routledge, Bab 5, hlm. 259–309.",
        "Martin, J.R., Matthiessen, C., & Painter, C. (1997). Working with Functional Grammar. Arnold.",
        "Az-Zamakhsyari. Al-Kasysyaf 'an Haqa'iq Ghawamidh At-Tanzil, Tafsir Surah Al-Fatihah.",
        "Tafsir Al-Qur'an Al-'Azhim (Ibnu Katsir), Jilid 1, Tafsir Al-Hamdullilah.",
        "Kementerian Agama RI. Al-Qur'an dan Tafsirnya, Tafsir QS. Al-Fatihah: 2."
      ]
    },
    Verbal: {
      pill: "4. Metafungsi Ideasional • Transitivitas LSF",
      title: "Proses Verbal (Verbal Process)",
      titleAr: "العملية اللفظية / القولية",
      subtitle: "Klausa ujaran, pertukaran pesan firman wahyu, dan komunikasi dakwah (Saying & Telling)",
      summary: "Proses Verbal memodelkan kegiatan komunikasi simbolik melalui bahasa dan ujaran. Dalam Al-Qur'an, proses ini menjadi instrumen sentral pewahyuan kalam ilahi, dialog para anbiya', amanat risalah, serta seruan dakwah tauhid.",
      coreQuestions: "Apa yang difirmankan/diucapkan oleh Sayer? / Kepada siapa pesan itu disampaikan?",
      participants: [
        { nameEn: "Sayer", nameAr: "القائل / المتكلم", role: "Penutur yang menyampaikan perkataan, perintah, atau wahyu." },
        { nameEn: "Receiver", nameAr: "المخاطَب / المتلقي", role: "Mitra tutur yang dituju oleh perkataan." },
        { nameEn: "Verbiage", nameAr: "مقول القول / البيان", role: "Konten teks atau pesan yang disampaikan." },
        { nameEn: "Target", nameAr: "المقصود بالقول", role: "Entitas yang menjadi sasaran evaluasi verbal." }
      ],
      nahwuBalaghah: "Berkorespondensi dengan <strong>Jumlatul Qaul (جملة مقول القول)</strong> yang menduduki posisi <em>Maf'ul bih</em> bagi kata kerja ujaran seperti <em>Qala (قال), Nada (نادى), Aw-ha (أوحى)</em>. Dalam Balaghah, mencakup ragam gaya bahasa <em>Khabar wa Insya'</em>, uslub Khithab, Nida' (seruan ilahiah), dan Basyarah/Indzar.",
      quranVerse: "وَإِذْ قَالَ رَبُّكَ لِلْمَلَائِكَةِ إِنِّي جَاعِلٌ فِي الْأَرْضِ خَلِيفَةً",
      quranRef: "QS. Al-Baqarah [2]: 30",
      quranTrans: "\"Dan (ingatlah) ketika Tuhanmu berfirman kepada para malaikat, 'Sesungguhnya Aku hendak menjadikan seorang khalifah di bumi.'\"",
      quranAnalysis: [
        { part: "قَالَ (Qāla)", role: "Proses Verbal (Tindakan berfirman menyampaikan amanat wahyu)" },
        { part: "رَبُّكَ (Rabbuka)", role: "Sayer (Allah Sang Maha Pencipta)" },
        { part: "لِلْمَلَائِكَةِ (Lil-Malā'ikah)", role: "Receiver (Para Malaikat sebagai mitra tutur penerima pesan)" },
        { part: "إِنِّي جَاعِلٌ فِي الْأَرْضِ خَلِيفَةً", role: "Verbiage / Maqul Al-Qaul (Ketetapan penciptaan khalifah)" }
      ],
      tafsirNote: "Tafsir Ibnu Katsir menguraikan bahwa dialog verbal ini bukan bermaksud meminta musyawarah, melainkan bentuk pemuliaan terhadap kedudukan Adam AS dan pengumuman agung kepada para malaikat tentang hikmah penciptaan manusia.",
      references: [
        "Halliday, M.A.K. & Matthiessen, C.M.I.M. (2014). Halliday's Introduction to Functional Grammar (4th ed.). Routledge, Bab 5, hlm. 302–320.",
        "Thompson, Geoff. (2014). Introducing Functional Grammar (3rd ed.). Routledge, hlm. 112–120.",
        "As-Suyuthi, Jalaluddin. Al-Itqan fi 'Ulum Al-Qur'an, Pembahasan Gaya Bahasa Kalam Al-Qur'an.",
        "Tafsir Al-Qur'an Al-'Azhim (Ibnu Katsir), Jilid 1, Tafsir QS. Al-Baqarah: 30.",
        "Tafsir Tahlili Kemenag RI, Juz 1, Tafsir Kisah Penciptaan Khalifah."
      ]
    },
    Behavioural: {
      pill: "5. Metafungsi Ideasional • Transitivitas LSF",
      title: "Proses Behavioural (Behavioural Process)",
      titleAr: "العملية السلوكية",
      subtitle: "Klausa representasi perilaku fisiologis-psikologis dan manifestasi raga berjiwa (Behaving)",
      summary: "Proses Behavioural menempati irisan unik antara tindakan fisik (Material) dan kesadaran batin (Mental). Menggambarkan perbuatan lahiriah manusia yang berakar langsung dari luapan kesadaran batiniah, refleks indrawi, atau kepatuhan spiritual (seperti menangis khusyuk, sujud merendah, tersenyum, bersabar).",
      coreQuestions: "Bagaimana manifestasi ekspresi ragawi yang diwujudkan oleh Behaver?",
      participants: [
        { nameEn: "Behaver", nameAr: "الفاعل السلوكي", role: "Partisipan sadar yang mengekspresikan tindakan fisiologis/psikologis." },
        { nameEn: "Behaviour", nameAr: "السلوك", role: "Wujud perilaku atau ekspresi yang teramati." },
        { nameEn: "Matter / Circumstance", nameAr: "المتعلق بالسلوك", role: "Fenomena atau situasi yang memicu timbulnya perilaku tersebut." }
      ],
      nahwuBalaghah: "Dalam tata bahasa Arab, proses ini terangkum pada verba-verba perpaduan <em>Al-Jawarih (jasmani)</em> dan <em>Al-Qalb (ruhani)</em> seperti <em>Baka (بكى - menangis), Kharra Sujjadan (خرَّ ساجداً - tersungkur bersujud), Dhahika (ضحك - tertawa), Shabara (صبر - bersabar)</em>. Dalam Balaghah, melambangkan kepasrahan total dan kelembutan sanubari insan bertauhid.",
      quranVerse: "إِذَا تُتْلَىٰ عَلَيْهِمْ آيَاتُ الرَّحْمَٰنِ خَرُّوا سُجَّدًا وَبُكِيًّا ۩",
      quranRef: "QS. Maryam [19]: 58",
      quranTrans: "\"Apabila dibacakan ayat-ayat Allah Yang Maha Pengasih kepada mereka, maka mereka tunduk bersujud dan menangis.\"",
      quranAnalysis: [
        { part: "هُمْ / Para Nabi (Mustatir)", role: "Behaver (Sosok anbiya' yang berjiwa suci)" },
        { part: "خَرُّوا سُجَّدًا وَبُكِيًّا", role: "Proses Behavioural Gabungan (Sujud ragawi dan tangisan haru batin)" },
        { part: "إِذَا تُتْلَىٰ عَلَيْهِمْ آيَاتُ الرَّحْمَٰنِ", role: "Circumstance Waktu & Stimulus (Mendengar lantunan wahyu Ar-Rahman)" }
      ],
      tafsirNote: "Tafsir Ibnu Katsir mengutip atsar bahwa para sahabat nabi dan salafus shalih senantiasa menangis tersedu-sedu ketika mendengar ayat rahmat dan ancaman, membuktikan bahwa iman sejati menggetarkan fisik hingga mengucurkan air mata.",
      references: [
        "Halliday, M.A.K. & Matthiessen, C.M.I.M. (2014). Halliday's Introduction to Functional Grammar (4th ed.). Routledge, Bab 5, hlm. 300–306.",
        "Butt, D., Fahey, R., Feez, S., & Spinks, S. (2000). Using Functional Grammar: An Explorer's Guide. NCELTR.",
        "Al-Jurjani, Abdul Qahir. Dala'il Al-I'jaz fi 'Ilmil Ma'ani.",
        "Tafsir Al-Qur'an Al-'Azhim (Ibnu Katsir), Jilid 5, Tafsir QS. Maryam: 58.",
        "Tafsir Tahlili Kemenag RI, Juz 16, Karakteristik Para Nabi dalam Surah Maryam."
      ]
    },
    Existential: {
      pill: "6. Metafungsi Ideasional • Transitivitas LSF",
      title: "Proses Eksistensial (Existential Process)",
      titleAr: "العملية الوجودية",
      subtitle: "Klausa representasi kehadiran, keberadaan hakiki, dan wujud fenomena di alam nyata (Existing & Being in reality)",
      summary: "Proses Eksistensial menyatakan kehadiran atau ketiadaan sesuatu di dunia nyata. Proses ini menegaskan bahwa suatu entitas atau kejadian 'itu ada / terjadi', tanpa melibatkan tindakan aktif dari pelaku sekunder.",
      coreQuestions: "Apa yang dinyatakan ada atau hadir di alam semesta?",
      participants: [
        { nameEn: "Existent", nameAr: "الموجود / الكائن", role: "Entitas atau fenomena tunggal yang dinyatakan eksistensinya." },
        { nameEn: "Circumstantial Location", nameAr: "المكان / ظرف الوجود", role: "Koordinat ruang atau masa di mana entitas tersebut mewujud." }
      ],
      nahwuBalaghah: "Berkorespondensi dengan <strong>Kāna at-Tāmmah (كان التامة)</strong> yang mencukupi diri dengan <em>Fa'il</em> tanpa membutuhkan khabar (bermakna wujud/terjadi), verba <em>Wujida (وُجِدَ)</em>, serta partikel eksistensi/ketiadaan seperti <em>Laisa (ليس)</em> dan <em>Tsamma (ثَمَّ)</em>. Dalam Balaghah, menjadi puncak penetapan tauhid wujud dan kalimat penciptaan instan (Kun Fayakun).",
      quranVerse: "بَدِيعُ السَّمَاوَاتِ وَالْأَرْضِ ۖ وَإِذَا قَضَىٰ أَمْرًا فَإِنَّمَا يَقُولُ لَهُ كُنْ فَيَكُونُ",
      quranRef: "QS. Al-Baqarah [2]: 117",
      quranTrans: "\"(Allah) Pencipta langit dan bumi. Apabila Dia hendak menetapkan sesuatu, Dia hanya berkata kepadanya, 'Jadilah!' Maka jadilah sesuatu itu.\"",
      quranAnalysis: [
        { part: "كُنْ (Kun)", role: "Proses Eksistensial Imperatif / Kana at-Tammah (Perintah berwujud seketika)" },
        { part: "أَمْرًا (Amran / Al-Wujud)", role: "Existent (Entitas ciptaan yang dihadirkan ke alam eksistensi)" },
        { part: "فَيَكُونُ (Fa-Yakūn)", role: "Realisasi Eksistensi Wujud (Maka berwujudlah ia secara nyata)" }
      ],
      tafsirNote: "Tafsir Kemenag RI dan Ibnu Katsir menguraikan bahwa penciptaan Allah terjadi tanpa perantara bahan baku maupun usaha bertahap yang melelahkan. Titah eksistensi ilahi mutlak dan seketika menembus ruang ketiadaan menjadi keberadaan.",
      references: [
        "Halliday, M.A.K. & Matthiessen, C.M.I.M. (2014). Halliday's Introduction to Functional Grammar (4th ed.). Routledge, Bab 5, hlm. 307–313.",
        "Fawcett, Robin P. (2000). A Theory of Syntax for Systemic Functional Linguistics. John Benjamins.",
        "Az-Zarkasyi, Badruddin. Al-Burhan fi 'Ulum Al-Qur'an, Pembahasan Kaidah Kana at-Tammah.",
        "Tafsir Al-Qur'an Al-'Azhim (Ibnu Katsir), Jilid 1, Tafsir QS. Al-Baqarah: 117.",
        "Tafsir Tahlili Kemenag RI, Juz 1, Tafsir Hakikat Keagungan Kalimat 'Kun Fayakun'."
      ]
    },
    Kitab: {
      pill: "Kitab Rujukan Tafsir Resmi & Mu'tabarah",
      title: "Kitab Pendamping Terintegrasi: Tafsir Kemenag RI & Tafsir Ibnu Katsir",
      titleAr: "التفسير التحليلي لوزارة الشؤون الدينية وتفسير ابن كثير العظيم",
      subtitle: "Integrasi 6.236 Ayat Tafsir Tahlili Resmi Indonesia dan 8 Jilid Matan Otoritatif Ibnu Katsir",
      summary: "Aplikasi Quranic LSF & Tafsir Explorer memadukan analisis gramatika linguistik modern (LSF Halliday) dengan dua pilar khazanah tafsir otoritatif umat Islam: Tafsir Tahlili Kemenag RI sebagai standar tafsir komprehensif resmi kontemporer Indonesia dan Tafsir Ibnu Katsir sebagai mahakarya tafsir bi al-ma'tsur terbesar sepanjang sejarah.",
      kemenagInfo: "Diterbitkan resmi oleh Lajnah Pentashihan Mushaf Al-Qur'an (LPMQ) Badan Litbang dan Diklat Kementerian Agama RI. Mengkaji seluruh ayat Al-Qur'an secara runtut analitis (tahlili) dalam 30 Juz dan 114 Surat, melengkapi setiap ayat dengan asbabun nuzul, munasabah, telaah mufradat kosa kata, terjemah resmi, dan penjelasan kontekstual ilmiah.",
      ibnKatsirInfo: "Karya Al-Hafizh Abu Al-Fida' Imaduddin Isma'il bin Katsir (701–774 H). Merupakan standar tertinggi Tafsir bi al-Ma'tsur yang menafsirkan ayat Al-Qur'an dengan ayat lainnya, Hadits Nabi SAW berderajat shahih/hasan, serta riwayat sahabat dan tabi'in. Terintegrasi matan bahasa Arab lengkap serta terjemahan bahasa Inggris/Indonesia.",
      synergyInfo: "Linguistik Sistemik Fungsional (LSF) membedah struktur gramatika mikro (ideasional, interpersonal, tekstual). Kitab Tafsir melengkapi dengan pemahaman makro: maksud syar'i (Maqashid asy-Syari'ah), dimensi aqidah tauhid, hukum fiqih, serta asbab turunnya firman ilahi.",
      references: [
        "Kementerian Agama Republik Indonesia. (2019). Al-Qur'an dan Tafsirnya (Edisi yang Disempurnakan), 10 Jilid. Jakarta: Balai Pustaka & LPMQ Kemenag RI.",
        "Ibnu Katsir, Abu Al-Fida' Isma'il. Tafsir Al-Qur'an Al-'Azhim, Tahqiq Sami bin Muhammad As-Salamah (8 Jilid). Riyadh: Dar Thayyibah.",
        "Lajnah Pentashihan Mushaf Al-Qur'an (LPMQ). Database Mushaf Standar Indonesia & Terjemah Kemenag RI.",
        "Qattan, Manna' Khalil. (2000). Mabahits fi 'Ulum Al-Qur'an. Kairo: Maktabah Wahbah.",
        "Halliday, M.A.K. & Hasan, Ruqaiya. (1989). Language, Context, and Text: Aspects of Language in a Social-Semiotic Perspective. Oxford University Press."
      ]
    }
  };

  let currentLsfModalProcessKey = "Material";

  function openLsfProcessModal(processKey) {
    const item = LSF_PROCESS_KNOWLEDGE[processKey] || LSF_PROCESS_KNOWLEDGE.Material;
    currentLsfModalProcessKey = processKey;

    if (el.lsfModalPill) el.lsfModalPill.textContent = item.pill;
    if (el.lsfModalArTitle) el.lsfModalArTitle.textContent = item.titleAr;
    if (el.lsfModalTitle) el.lsfModalTitle.textContent = item.title;
    if (el.lsfModalSubtitle) el.lsfModalSubtitle.textContent = item.subtitle;

    let bodyHtml = "";
    if (processKey === "Kitab") {
      bodyHtml = `
        <div class="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-2">
          <h4 class="font-bold text-amber-950 text-sm flex items-center gap-2">
            <span>📖</span><span>Hakikat &amp; Metodologi Integrasi Kitab Tafsir</span>
          </h4>
          <p class="leading-relaxed text-slate-700">${item.summary}</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 space-y-2">
            <h4 class="font-bold text-emerald-950 text-sm flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
              <span>1. Tafsir Tahlili Kemenag RI (6.236 Ayat)</span>
            </h4>
            <p class="text-xs text-slate-700 leading-relaxed">${item.kemenagInfo}</p>
          </div>
          <div class="p-4 rounded-2xl bg-indigo-50/80 border border-indigo-200 space-y-2">
            <h4 class="font-bold text-indigo-950 text-sm flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
              <span>2. Tafsir Ibnu Katsir (8 Jilid Matan)</span>
            </h4>
            <p class="text-xs text-slate-700 leading-relaxed">${item.ibnKatsirInfo}</p>
          </div>
        </div>

        <div class="p-4 rounded-2xl bg-white border border-slate-200 space-y-2">
          <h4 class="font-bold text-slate-900 text-sm">3. Sinergi Metodologis LSF &amp; Ilmu Tafsir</h4>
          <p class="text-xs text-slate-700 leading-relaxed">${item.synergyInfo}</p>
        </div>

        <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
          <h4 class="font-bold text-slate-900 text-xs uppercase tracking-wider">📚 Sumber Rujukan Otoritatif:</h4>
          <ul class="list-disc list-inside space-y-1 text-xs text-slate-600">
            ${item.references.map(r => `<li>${escapeHtml(r)}</li>`).join("")}
          </ul>
        </div>
      `;
    } else {
      bodyHtml = `
        <div class="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
          <h4 class="font-bold text-emerald-950 text-sm flex items-center gap-2">
            <span>✦</span><span>Konsep Dasar &amp; Hakikat Semantik LSF</span>
          </h4>
          <p class="leading-relaxed text-slate-700">${item.summary}</p>
          <div class="mt-2 text-xs font-semibold text-emerald-900 bg-white/80 p-2.5 rounded-xl border border-emerald-200/80">
            <strong>Pertanyaan Kunci:</strong> <em>${item.coreQuestions}</em>
          </div>
        </div>

        <div class="p-4 rounded-2xl bg-white border border-slate-200 space-y-3">
          <h4 class="font-bold text-slate-900 text-sm flex items-center justify-between">
            <span>Struktur Partisipan Kunci (Participants)</span>
            <span class="text-xs font-normal text-slate-500 font-arabic">المشاركون في التركيب</span>
          </h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            ${item.participants.map(p => `
              <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div class="flex items-center justify-between font-bold text-emerald-900 mb-1">
                  <span>${escapeHtml(p.nameEn)}</span>
                  <span class="font-arabic text-sm text-teal-800">${escapeHtml(p.nameAr)}</span>
                </div>
                <p class="text-slate-600 leading-snug">${escapeHtml(p.role)}</p>
              </div>
            `).join("")}
          </div>
        </div>

        <div class="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200 space-y-2">
          <h4 class="font-bold text-indigo-950 text-sm">Integrasi Gramatika Arab &amp; Balaghah (Nahwu &amp; Ilmu Ma'ani)</h4>
          <div class="text-xs text-slate-700 leading-relaxed">${item.nahwuBalaghah}</div>
        </div>

        <div class="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-3">
          <div class="flex items-center justify-between">
            <h4 class="font-bold text-amber-950 text-sm">Contoh Analisis Ayat Al-Qur'an</h4>
            <span class="text-xs font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">${item.quranRef}</span>
          </div>
          <div class="bg-slate-900 text-amber-200 p-4 rounded-xl text-center space-y-2 shadow-inner">
            <p class="font-arabic text-xl sm:text-2xl leading-[2.3]" dir="rtl">${item.quranVerse}</p>
            <p class="text-xs text-slate-300 italic font-normal text-left">${item.quranTrans}</p>
          </div>
          <div class="space-y-1.5 pt-1">
            <span class="text-xs font-bold text-slate-800 block">Bedah Konstituen &amp; Peran Kata:</span>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              ${item.quranAnalysis.map(a => `
                <div class="p-2 rounded-lg bg-white border border-amber-200 flex items-center justify-between gap-2">
                  <span class="font-arabic font-semibold text-emerald-950">${escapeHtml(a.part)}</span>
                  <span class="text-slate-600 text-right text-[11px]">${escapeHtml(a.role)}</span>
                </div>
              `).join("")}
            </div>
          </div>
        </div>

        <div class="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 space-y-2">
          <h4 class="font-bold text-emerald-950 text-sm">Signifikansi Tadabbur &amp; Penafsiran (Ibnu Katsir &amp; Kemenag RI)</h4>
          <p class="text-xs text-slate-700 leading-relaxed">${item.tafsirNote}</p>
        </div>

        <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
          <h4 class="font-bold text-slate-900 text-xs uppercase tracking-wider">📚 Sumber Rujukan Akademik &amp; Kitab:</h4>
          <ul class="list-disc list-inside space-y-1 text-xs text-slate-600">
            ${item.references.map(r => `<li>${escapeHtml(r)}</li>`).join("")}
          </ul>
        </div>
      `;
    }

    if (el.lsfProcessModalBody) el.lsfProcessModalBody.innerHTML = bodyHtml;
    if (el.lsfProcessModal) el.lsfProcessModal.classList.remove("hidden");
  }

  // Event Listeners for 6 Process Cards & Kitab Box (Link Jendela Baru & Modal Rujukan)
  document.querySelectorAll(".btn-lsf-process-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      const proc = btn.getAttribute("data-process") || "Material";
      openLsfProcessModal(proc);
    });
  });

  if (el.btnCloseProcessModal) {
    el.btnCloseProcessModal.addEventListener("click", () => el.lsfProcessModal.classList.add("hidden"));
  }
  if (el.btnCloseProcessModalBottom) {
    el.btnCloseProcessModalBottom.addEventListener("click", () => el.lsfProcessModal.classList.add("hidden"));
  }
  if (el.lsfProcessModal) {
    el.lsfProcessModal.addEventListener("click", (e) => {
      if (e.target === el.lsfProcessModal) el.lsfProcessModal.classList.add("hidden");
    });
  }

  if (el.btnProcessNewWindow) {
    el.btnProcessNewWindow.addEventListener("click", () => {
      const item = LSF_PROCESS_KNOWLEDGE[currentLsfModalProcessKey] || LSF_PROCESS_KNOWLEDGE.Material;
      const targetUrl = `referensi-proses-lsf.html?proses=${encodeURIComponent(currentLsfModalProcessKey.toLowerCase())}`;
      const win = window.open(targetUrl, "_blank");
      if (!win) {
        const html = el.lsfProcessModalBody ? el.lsfProcessModalBody.innerHTML : "";
        openStandaloneWindow(item.title, html, `${item.pill} • ${item.titleAr}`);
      }
    });
  }


  function saveCustomVerse(key, verseObj) {
    try {
      const existing = JSON.parse(localStorage.getItem(STORAGE_KEY_CUSTOM_VERSES) || "{}");
      existing[key] = verseObj;
      localStorage.setItem(STORAGE_KEY_CUSTOM_VERSES, JSON.stringify(existing));
    } catch (_) {
      // Ignore
    }
    captureGeminiKnowledgeFromVerse(verseObj, "Penambahan Analisis Baru");
  }

  // Add Verse Modal
  el.btnAddVerseModal.addEventListener("click", () => el.addVerseModal.classList.remove("hidden"));
  el.btnCloseAddModal.addEventListener("click", () => el.addVerseModal.classList.add("hidden"));
  el.btnCancelAdd.addEventListener("click", () => el.addVerseModal.classList.add("hidden"));

  el.formAddVerse.addEventListener("submit", (e) => {
    e.preventDefault();
    const surahNum = parseInt(document.getElementById("input-surah").value, 10) || 1;
    const verseNum = parseInt(document.getElementById("input-verse").value, 10) || 1;
    const ref = document.getElementById("input-ref").value.trim();
    const ar = document.getElementById("input-arabic").value.trim();
    const tr = document.getElementById("input-translit").value.trim();
    const idTr = document.getElementById("input-translation").value.trim();
    const pType = document.getElementById("input-process-type").value;
    const sFunc = document.getElementById("input-speech-func").value;
    const tTheme = document.getElementById("input-theme-type").value;
    const circ = document.getElementById("input-circumstance").value.trim();
    const nahwuInput = document.getElementById("input-nahwu").value.trim();
    const summaryText = document.getElementById("input-summary").value.trim() || `Analisis LSF untuk ${ref}.`;
    const tafsirNote = document.getElementById("input-tafsir-note").value.trim();

    let newKey = `${surahNum}:${verseNum}`;
    if (dataset.verses[newKey]) newKey = `${newKey}_${Date.now()}`;

    const words = ar.split(/\s+/).filter(Boolean);
    const procAr = PROCESS_AR_MAP[pType] || "";

    const newVerse = {
      surah: surahNum,
      verse: verseNum,
      ref,
      sourceRef: "Input Mandiri Pengguna (Tersimpan Lokal)",
      arabic: ar,
      translit: tr,
      translation: idTr,
      processCategory: pType,
      processCategoryAr: procAr,
      speechCategory: sFunc,
      themeCategory: tTheme,
      clauses: [
        {
          clauseId: `${newKey}:c1`,
          arabicText: ar,
          transitivity: {
            process: { typeEn: pType, typeAr: procAr, lexicalVerb: words[0] || ar },
            participants: [{ roleEn: "Core Participant", roleAr: "المشارك الرئيس", text: words.slice(1).join(" ") || ar }],
            circumstances: circ ? [{ typeEn: circ, typeAr: "محددة الظرف", text: circ }] : []
          },
          interpersonal: { speechFunction: sFunc, mood: sFunc },
          textual: { theme: words[0] || ar, rheme: words.slice(1).join(" ") || ar, themeType: tTheme }
        }
      ],
      diagramSegments: words.map((w, idx) => ({
        ar: w,
        ide: idx === 0 ? `Proses ${pType}` : "Partisipan / Sirkumstansi",
        ideAr: idx === 0 ? procAr : "مشارك / ظرف",
        int: idx === 0 ? `Mood (${sFunc})` : "Residu",
        intAr: idx === 0 ? "المزاج" : "البقية",
        tex: idx === 0 ? `Tema (${tTheme})` : "Rema",
        texAr: idx === 0 ? "الموضوع" : "الخبر",
        flex: "1"
      })),
      tokens: words.map((w, idx) => ({
        ar: w,
        tr: "-",
        root: "-",
        pos: "Elemen Klausa",
        role: idx === 0 ? `Proses ${pType}` : "Partisipan / Pelengkap",
        roleAr: idx === 0 ? procAr : "مشارك"
      })),
      ideational: {
        processType: `${pType} (${procAr})`,
        processTypeAr: procAr,
        rows: [
          { seg: ar, comp: `Proses ${pType}`, compAr: procAr, role: "Klausa Utama", desc: summaryText },
          ...(circ ? [{ seg: circ, comp: "Sirkumstansi", compAr: "محددة الظرف", role: "Konteks Tambahan", desc: circ }] : [])
        ],
        summary: summaryText
      },
      interpersonal: {
        speechFunc: sFunc,
        modality: "Analisis Mandiri",
        rows: [{ seg: ar, block: "Mood & Residu", role: `Tindak Tutur ${sFunc}`, desc: `Relasi komunikatif bertipe ${sFunc}.` }],
        summary: `Fungsi tutur ${sFunc} membentuk interaksi antara penutur dan penerima pesan.`
      },
      textual: {
        themeType: `${tTheme} Theme`,
        themeContent: words[0] || ar,
        themeDesc: `Titik tolak awal klausa (${tTheme}).`,
        rhemeContent: words.slice(1).join(" ") || "-",
        rhemeDesc: "Pengembangan informasi utama ayat.",
        summary: `Struktur Tema (${tTheme}) mengarahkan fokus pembaca pada awal ayat.`
      },
      nahwuBalaghahBridge: {
        nahwu: nahwuInput || "Struktur gramatikal klausa Arab dapat dipetakan lebih lanjut pada bagian I'rab.",
        balaghah: "Pemilihan pola urutan kata memengaruhi penekanan makna (Ilmu Ma'ani).",
        sflSynthesis: summaryText
      },
      pedagogicalNote: {
        targetLevel: "Kustom / Mandiri",
        learningObjective: `Mengidentifikasi Proses ${pType} dan Pola Tema ${tTheme}.`,
        qiraahActivity: "Diskusikan peran partisipan dan sirkumstansi ayat bersama pembelajar."
      },
      tafsirComparison: tafsirNote
        ? {
            kemenagSummary: tafsirNote,
            klasikMatsur: tafsirNote,
            lughawiBalaghi: nahwuInput || tafsirNote,
            kontemporerAdabi: tafsirNote,
            kontemporerMaqashidi: tafsirNote,
            lsfVsTafsirSynthesis: summaryText
          }
        : undefined
    };

    dataset.verses[newKey] = newVerse;
    saveCustomVerse(newKey, newVerse);

    el.formAddVerse.reset();
    el.addVerseModal.classList.add("hidden");
    showToast(`Ayat ${ref} berhasil ditambahkan ke korpus!`);
    applyFilters();
    renderVerse(newKey);
    renderAnalytics();
  });

  // Corpus Keys Sync (Korpus penuh kini dinavigasi melalui Akses Cepat 114 Surat & 6.236 Ayat)
  function applyFilters() {
    filteredKeys = Object.keys(dataset.verses || {});
  }

  // 5-Tab Switching in LSF Analyzer
  function setTab(tabName) {
    currentMetaTab = tabName;
    const tabs = [
      { name: "ideational", btn: el.tabIdeational, panel: el.panelIdeational, colorClass: "text-emerald-700", borderClass: "border-emerald-600" },
      { name: "interpersonal", btn: el.tabInterpersonal, panel: el.panelInterpersonal, colorClass: "text-indigo-700", borderClass: "border-indigo-600" },
      { name: "textual", btn: el.tabTextual, panel: el.panelTextual, colorClass: "text-amber-700", borderClass: "border-amber-600" },
      { name: "bridge", btn: el.tabBridge, panel: el.panelBridge, colorClass: "text-teal-800", borderClass: "border-teal-600" },
      { name: "verse-tafsir", btn: el.tabVerseTafsir, panel: el.panelVerseTafsir, colorClass: "text-purple-800", borderClass: "border-purple-600" }
    ];

    tabs.forEach((t) => {
      const active = t.name === tabName;
      t.btn.className = `tab-btn px-4 py-2.5 text-sm ${active ? `font-semibold ${t.colorClass} border-b-2 ${t.borderClass}` : "font-medium text-slate-500 hover:text-slate-800 border-b-2 border-transparent"} flex items-center gap-2 whitespace-nowrap`;
      t.panel.classList.toggle("hidden", !active);
    });
  }

  el.tabIdeational.addEventListener("click", () => setTab("ideational"));
  el.tabInterpersonal.addEventListener("click", () => setTab("interpersonal"));
  el.tabTextual.addEventListener("click", () => setTab("textual"));
  el.tabBridge.addEventListener("click", () => setTab("bridge"));
  el.tabVerseTafsir.addEventListener("click", () => setTab("verse-tafsir"));

  // Render Curated Verse
  function renderVerse(key) {
    if (!key || !dataset.verses[key]) return;
    renderVerseObject(key, dataset.verses[key]);
  }

  async function renderVerseObject(key, data) {
    currentVerseKey = key;
    activeVerseObj = data;

    // Sync Quick Jump Dropdowns
    if (data.surah && data.verse && el.quickSurahSelect.options.length > 0) {
      el.quickSurahSelect.value = String(data.surah);
      populateQuickAyahSelect(data.surah);
      el.quickAyahSelect.value = String(data.verse);
    }

    el.badgeVerseRef.textContent = data.ref;
    el.sourceRefLabel.textContent = `Sumber analisis: ${data.sourceRef || "Korpus LSF"}`;
    el.badgeHeuristicMode.classList.toggle("hidden", !data.isDraftHeuristic);
    el.btnSaveHeuristicVerse.classList.toggle("hidden", !data.isDraftHeuristic);

    const procArText = showArabicTerms && data.processCategoryAr ? ` • ${data.processCategoryAr}` : "";
    el.badgeProcessPill.textContent = `Proses: ${data.processCategory}${procArText}`;
    el.badgeSpeechPill.textContent = `Tutur: ${data.speechCategory || "Deklaratif"}`;
    el.badgeThemePill.textContent = `Tema: ${data.themeCategory}`;
    if (el.kpiActiveRef) el.kpiActiveRef.textContent = data.ref;
    if (el.kpiActiveProcess) el.kpiActiveProcess.textContent = `Proses: ${data.processCategory} • ${data.themeCategory}`;

    // Ukuran huruf Arab ringkas & proporsional agar nyaman dibaca tanpa menumpuk
    const arLen = (data.arabic || "").length;
    el.arabicText.className =
      arLen > 200
        ? "font-arabic text-[15px] sm:text-base text-emerald-950 leading-[2.3] font-normal pt-1"
        : "font-arabic text-base sm:text-lg text-emerald-950 leading-[2.35] font-normal pt-1";
    el.arabicText.innerHTML = formatQuranArabicHtml(data.arabic);
    el.translitText.textContent = `"${data.translit}"`;
    el.translationText.textContent = `"${data.translation}"`;
    if (el.translationText) {
      el.translationText.classList.remove("hidden");
    }
    el.tokenInspector.classList.add("hidden");

    // Tokens
    el.tokensContainer.innerHTML = "";
    const baseFreqs = [523.25, 587.33, 659.25, 698.46, 783.99, 880.0];
    (data.tokens || []).forEach((tok, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "group px-3 py-1.5 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-400 rounded-xl transition text-center focus:ring-2 focus:ring-emerald-400";
      btn.innerHTML = `
        <div class="font-arabic text-lg font-normal leading-[2] text-slate-800 group-hover:text-emerald-900">${formatQuranArabicHtml(tok.ar)}</div>
        <div class="text-[10px] text-slate-500">${escapeHtml(tok.tr)}</div>
        <span class="inline-block mt-0.5 px-1.5 py-0.5 text-[9px] font-semibold bg-emerald-100/80 text-emerald-900 rounded">${escapeHtml(tok.role)}</span>
        ${showArabicTerms && tok.roleAr ? `<div class="font-arabic text-[11px] text-teal-800 mt-0.5">${escapeHtml(tok.roleAr)}</div>` : ""}
      `;
      btn.addEventListener("click", () => {
        playHarmonicTone(baseFreqs[idx % baseFreqs.length]);
        el.tokDetailAr.innerHTML = formatQuranArabicHtml(tok.ar);
        el.tokDetailRoot.textContent = tok.root || "-";
        el.tokDetailPos.textContent = tok.pos || "-";
        el.tokDetailRole.textContent = tok.role;
        el.tokDetailRoleAr.textContent = showArabicTerms ? (tok.roleAr || "") : "";
        el.tokDetailRoleAr.classList.toggle("hidden", !showArabicTerms || !tok.roleAr);
        el.tokenInspector.classList.remove("hidden");
      });
      el.tokensContainer.appendChild(btn);
    });

    renderClauseDiagram(data);

    // Panel 1: Ideational
    document.getElementById("ideational-process-type").textContent =
      `Tipe Proses: ${data.ideational.processType}${showArabicTerms && data.ideational.processTypeAr ? ` • ${data.ideational.processTypeAr}` : ""}`;

    const clauses = data.clauses || [];
    if (clauses.length > 0) {
      el.clausesBreakdownContainer.innerHTML = `
        <div class="text-[11px] font-bold text-emerald-900 uppercase tracking-wide mb-1">Segmentasi Klausa Terstruktur (${clauses.length} Klausa):</div>
        <div class="grid grid-cols-1 ${clauses.length > 1 ? "md:grid-cols-2 lg:grid-cols-3" : ""} gap-2.5">
          ${clauses
            .map(
              (c) => `
            <div class="p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl text-xs space-y-1.5">
              <div class="flex justify-between items-center gap-2">
                <span class="font-mono-code text-[10px] font-semibold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200">${escapeHtml(c.clauseId)}</span>
                <span class="text-[10px] font-semibold text-emerald-900">${escapeHtml(c.transitivity.process.typeEn)}${showArabicTerms ? ` (${escapeHtml(c.transitivity.process.typeAr)})` : ""}</span>
              </div>
              <div class="font-arabic text-lg font-normal leading-[2.1] text-slate-900 text-right" dir="rtl">${formatQuranArabicHtml(c.arabicText)}</div>
              <div class="text-[11px] text-slate-600">
                <strong>Partisipan:</strong> ${c.transitivity.participants.map((p) => `${escapeHtml(p.roleEn)} (${escapeHtml(p.text)})`).join(", ") || "-"}
              </div>
              ${
                c.transitivity.circumstances && c.transitivity.circumstances.length > 0
                  ? `<div class="text-[11px] text-teal-800"><strong>Sirkumstansi:</strong> ${c.transitivity.circumstances.map((cm) => `${escapeHtml(cm.typeEn)} (${escapeHtml(cm.text)})`).join(", ")}</div>`
                  : ""
              }
            </div>
          `
            )
            .join("")}
        </div>
      `;
    } else {
      el.clausesBreakdownContainer.innerHTML = "";
    }

    document.getElementById("ideational-table-body").innerHTML = (data.ideational.rows || [])
      .map(
        (r) => `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-2.5 px-3 font-semibold text-slate-800 font-arabic text-base">${escapeHtml(r.seg)}</td>
        <td class="py-2.5 px-3 font-medium text-emerald-800 bg-emerald-50/50">
          ${escapeHtml(r.comp)}
          ${showArabicTerms && r.compAr ? `<div class="font-arabic text-xs text-teal-800">${escapeHtml(r.compAr)}</div>` : ""}
        </td>
        <td class="py-2.5 px-3 text-slate-700">${escapeHtml(r.role)}</td>
        <td class="py-2.5 px-3 text-slate-500 text-xs">${escapeHtml(r.desc)}</td>
      </tr>
    `
      )
      .join("");
    document.getElementById("ideational-summary").innerHTML = `<strong>Sintesis Ideasional:</strong> ${escapeHtml(data.ideational.summary)}`;

    // Panel 2: Interpersonal
    document.getElementById("interpersonal-speech-func").textContent =
      `Fungsi Tutur: ${data.interpersonal.speechFunc}${showArabicTerms && data.interpersonal.speechFuncAr ? ` • ${data.interpersonal.speechFuncAr}` : ""}`;
    document.getElementById("interpersonal-modality").textContent = `Modalitas: ${data.interpersonal.modality || "Kepastian Proposisi"}`;

    document.getElementById("interpersonal-table-body").innerHTML = (data.interpersonal.rows || [])
      .map(
        (r) => `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-2.5 px-3 font-semibold text-slate-800 font-arabic text-base">${escapeHtml(r.seg)}</td>
        <td class="py-2.5 px-3 font-medium text-indigo-800 bg-indigo-50/50">
          ${escapeHtml(r.block)}
          ${showArabicTerms && r.blockAr ? `<div class="font-arabic text-xs text-indigo-700">${escapeHtml(r.blockAr)}</div>` : ""}
        </td>
        <td class="py-2.5 px-3 text-slate-700">${escapeHtml(r.role)}</td>
        <td class="py-2.5 px-3 text-slate-500 text-xs">${escapeHtml(r.desc)}</td>
      </tr>
    `
      )
      .join("");
    document.getElementById("interpersonal-summary").innerHTML = `<strong>Sintesis Interpersonal:</strong> ${escapeHtml(data.interpersonal.summary)}`;

    // Panel 3: Textual
    document.getElementById("textual-theme-type").textContent =
      `Pola: ${data.textual.themeType}${showArabicTerms && data.textual.themeTypeAr ? ` • ${data.textual.themeTypeAr}` : ""}`;
    document.getElementById("textual-theme-content").textContent = data.textual.themeContent;
    document.getElementById("textual-theme-desc").textContent = data.textual.themeDesc;
    document.getElementById("textual-rheme-content").textContent = data.textual.rhemeContent;
    document.getElementById("textual-rheme-desc").textContent = data.textual.rhemeDesc;
    document.getElementById("textual-summary").innerHTML = `<strong>Sintesis Tekstual:</strong> ${escapeHtml(data.textual.summary)}`;

    // Panel 4: Bridge & Pedagogical
    const bridge = data.nahwuBalaghahBridge || {};
    const ped = data.pedagogicalNote || {};
    document.getElementById("bridge-nahwu").textContent = bridge.nahwu || "Analisis I'rab Nahwu klasik untuk ayat ini belum dilengkapi.";
    document.getElementById("bridge-balaghah").textContent = bridge.balaghah || "Kajian Ilmu Ma'ani untuk ayat ini belum dilengkapi.";
    document.getElementById("bridge-sfl").textContent = bridge.sflSynthesis || "Menghubungkan struktur formal Arab dengan makna fungsional LSF.";
    document.getElementById("pedagogical-level").textContent = ped.targetLevel || "Umum";
    document.getElementById("pedagogical-objective").textContent = ped.learningObjective || "Memahami peran fungsional klausa Arab dalam teks Al-Qur'an.";
    document.getElementById("pedagogical-activity").textContent = ped.qiraahActivity || "Memetakan Proses, Partisipan, dan Sirkumstansi ayat.";

    // Panel 5: Kemenag & Ibnu Katsir Tafsir for Active Verse
    el.verseKemenagTafsirBox.textContent = "Memuat Tafsir Tahlili Kemenag RI...";
    el.verseIbnKatsirEnBox.textContent = "Memuat Tafsir Ibnu Katsir...";
    el.verseIbnKatsirArBox.textContent = "جاري التحميل...";
    captureGeminiKnowledgeFromVerse(data, "Pantauan Korpus");
    if (data.surah && data.verse) {
      const [tafText, ikData] = await Promise.all([
        getKemenagTafsirForVerse(data.surah, data.verse),
        getIbnKathirTafsirForVerse(data.surah, data.verse)
      ]);
      if (currentVerseKey === key) {
        el.verseKemenagTafsirBox.textContent = tafText;
        el.verseIbnKatsirEnBox.textContent = getIbnKathirDisplayText(ikData);
        el.verseIbnKatsirArBox.textContent = ikData.ar;
        syncIbnKatsirLangButtons();
      }
    }

    if (isCompareMode) renderComparison();
    if (activePillar === "tafsir") renderTafsirStudio();
  }

  function renderClauseDiagram(data) {
    const segs =
      data.diagramSegments && data.diagramSegments.length > 0
        ? data.diagramSegments
        : [{ ar: data.arabic, ide: data.ideational.processType, int: data.interpersonal.speechFunc, tex: data.textual.themeType, flex: "1" }];

    el.diagRowArabic.innerHTML = segs
      .map(
        (s) => `
      <div style="flex: ${escapeHtml(s.flex || "1")}" class="p-2.5 bg-slate-100 rounded-lg border border-slate-300 font-arabic text-lg font-normal leading-[2.15] text-emerald-950 flex items-center justify-center">
        ${formatQuranArabicHtml(s.ar)}
      </div>
    `
      )
      .join("");

    el.diagRowIdeational.innerHTML = segs
      .map(
        (s) => `
      <div style="flex: ${escapeHtml(s.flex || "1")}" class="p-2 bg-emerald-50 rounded-lg border border-emerald-300 text-[11px] font-semibold text-emerald-900 shadow-sm">
        <span class="block text-[9px] uppercase tracking-wider text-emerald-700 font-bold">Ideasional</span>
        <div>${escapeHtml(s.ide)}</div>
        ${showArabicTerms && s.ideAr ? `<div class="font-arabic text-xs text-teal-800 mt-0.5">${escapeHtml(s.ideAr)}</div>` : ""}
      </div>
    `
      )
      .join("");

    el.diagRowInterpersonal.innerHTML = segs
      .map(
        (s) => `
      <div style="flex: ${escapeHtml(s.flex || "1")}" class="p-2 bg-indigo-50 rounded-lg border border-indigo-300 text-[11px] font-semibold text-indigo-900 shadow-sm">
        <span class="block text-[9px] uppercase tracking-wider text-indigo-700 font-bold">Interpersonal</span>
        <div>${escapeHtml(s.int)}</div>
        ${showArabicTerms && s.intAr ? `<div class="font-arabic text-xs text-indigo-800 mt-0.5">${escapeHtml(s.intAr)}</div>` : ""}
      </div>
    `
      )
      .join("");

    el.diagRowTextual.innerHTML = segs
      .map(
        (s) => `
      <div style="flex: ${escapeHtml(s.flex || "1")}" class="p-2 bg-amber-50 rounded-lg border border-amber-300 text-[11px] font-semibold text-amber-950 shadow-sm">
        <span class="block text-[9px] uppercase tracking-wider text-amber-700 font-bold">Tekstual</span>
        <div>${escapeHtml(s.tex)}</div>
        ${showArabicTerms && s.texAr ? `<div class="font-arabic text-xs text-amber-800 mt-0.5">${escapeHtml(s.texAr)}</div>` : ""}
      </div>
    `
      )
      .join("");
  }

  function stepQuranVerse(delta) {
    const surahs = kemenagCorpus.surahs || [];
    if (surahs.length === 0) return;
    const curS = activeVerseObj ? Number(activeVerseObj.surah) : 1;
    const curA = activeVerseObj ? Number(activeVerseObj.verse) : 1;
    const sObj = surahs.find((x) => x.nomor === curS);
    if (!sObj) return;

    if (delta > 0) {
      if (curA < sObj.jumlahAyat) {
        loadAnyQuranVerse(curS, curA + 1);
      } else {
        const nextS = curS < 114 ? curS + 1 : 1;
        loadAnyQuranVerse(nextS, 1);
      }
    } else {
      if (curA > 1) {
        loadAnyQuranVerse(curS, curA - 1);
      } else {
        const prevS = curS > 1 ? curS - 1 : 114;
        const prevObj = surahs.find((x) => x.nomor === prevS);
        loadAnyQuranVerse(prevS, prevObj ? prevObj.jumlahAyat : 1);
      }
    }
  }

  // =========================================================================
  // GEMINI AI • ASISTEN PENAFSIRAN LSF (SIDEBAR KANAN + AWAN TANYA AI)
  // =========================================================================
  function buildGeminiKeyTerms(v) {
    if (!v) return [];
    const terms = [];
    const seen = new Set();

    // 1. Kata-kata Arab penting dari token ayat (disertai peran fungsional LSF & akar kata)
    (v.tokens || []).slice(0, 5).forEach((tok) => {
      const label = (tok.ar || "").trim();
      if (!label || seen.has(label)) return;
      seen.add(label);
      terms.push({
        label,
        isArabic: true,
        tag: tok.role || tok.pos || "Lafadz",
        detail: `Lafadz "${label}" (${tok.tr || "-"}) berkedudukan sebagai **${tok.role || "Unsur Klausa"}**${tok.roleAr ? ` (${tok.roleAr})` : ""}, kategori Nahwu: ${tok.pos || "-"}${tok.root && tok.root !== "-" ? `, akar kata: ${tok.root}` : ""}.`
      });
    });

    // 2. Konsep kunci LSF & Retorika Arab untuk ayat aktif
    const concepts = [
      {
        label: `Proses ${v.processCategory}`,
        tag: "Ideasional",
        detail: `Pada ${v.ref}, klausa bertumpu pada **Proses ${v.processCategory}** (${PROCESS_AR_MAP[v.processCategory] || "-"}): ${v.ideational ? v.ideational.summary : ""}`
      },
      {
        label: `Mood ${v.speechCategory || "Deklaratif"}`,
        tag: "Interpersonal",
        detail: `Fungsi tutur **${v.speechCategory || "Deklaratif"}** menunjukkan relasi komunikatif ayat: ${v.interpersonal ? v.interpersonal.summary : ""}`
      },
      {
        label: `Tema ${v.themeCategory}`,
        tag: "Tekstual",
        detail: `Titik tolak pesan (**${v.textual ? v.textual.themeType : v.themeCategory}**) berada pada segmen "${v.textual ? v.textual.themeContent : "-"}": ${v.textual ? v.textual.summary : ""}`
      }
    ];
    if (v.nahwuBalaghahBridge) {
      concepts.push({
        label: "I'rab & Ma'ani",
        tag: "Balaghah",
        detail: `Nahwu: ${v.nahwuBalaghahBridge.nahwu} • Balaghah: ${v.nahwuBalaghahBridge.balaghah}`
      });
    }
    concepts.forEach((c) => {
      if (!seen.has(c.label)) {
        seen.add(c.label);
        terms.push({ ...c, isArabic: false });
      }
    });
    return terms;
  }

  if (el.btnSyncKnowledgeNow) {
    el.btnSyncKnowledgeNow.addEventListener("click", () => {
      const v = activeVerseObj || dataset.verses[currentVerseKey];
      const added = captureGeminiKnowledgeFromVerse(v, "Sinkronisasi Berkala");
      showToast(added ? "Pustaka & Kamus diperbarui dari analisis Gemini AI aktif." : "Pustaka & Kamus sudah tersinkron dengan kondisi terbaru.");
    });
  }

  // Pembaruan berkala otomatis (setiap 30 detik) ketika ada perubahan korpus/ayat aktif
  setInterval(() => {
    const v = activeVerseObj || dataset.verses[currentVerseKey];
    if (v) captureGeminiKnowledgeFromVerse(v, "Pembaruan Berkala Gemini AI");
  }, 30000);

  el.btnPrev.addEventListener("click", () => stepQuranVerse(-1));
  el.btnNext.addEventListener("click", () => stepQuranVerse(1));

  initDataset();
})();
