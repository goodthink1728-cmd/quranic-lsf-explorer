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
    btnMushafPlayFull: document.getElementById("btn-mushaf-play-full"),
    mushafFromAyah: document.getElementById("mushaf-from-ayah"),
    mushafToAyah: document.getElementById("mushaf-to-ayah"),
    btnMushafApplyRange: document.getElementById("btn-mushaf-apply-range"),
    chkMushafTranslit: document.getElementById("chk-mushaf-translit"),
    chkMushafTranslation: document.getElementById("chk-mushaf-translation"),
    globalAudioBar: document.getElementById("global-audio-bar"),
    audioTeleprompter: document.getElementById("audio-teleprompter"),
    audioSurahStream: document.getElementById("audio-surah-stream"),
    audioSurahSelect: document.getElementById("audio-surah-select"),
    audioAyahSelect: document.getElementById("audio-ayah-select"),
    audioSurahAr: document.getElementById("audio-surah-ar"),
    audioNowPlaying: document.getElementById("audio-now-playing"),
    btnAudioPrevPreview: document.getElementById("btn-audio-prev-preview"),
    audioPrevRef: document.getElementById("audio-prev-ref"),
    audioPrevAr: document.getElementById("audio-prev-ar"),
    audioNextInfo: document.getElementById("audio-next-info"),
    chkAudioAutocontinue: document.getElementById("chk-audio-autocontinue"),
    chkAudioRepeat: document.getElementById("chk-audio-repeat"),
    btnAudioPlayActive: document.getElementById("btn-audio-play-active"),
    btnAudioPrev: document.getElementById("btn-audio-prev"),
    btnAudioNext: document.getElementById("btn-audio-next"),
    btnAudioClose: document.getElementById("btn-audio-close"),
    btnAudioReopen: document.getElementById("btn-audio-reopen"),
    quranAudioPlayer: document.getElementById("quran-audio-player"),
    btnAudioMiniToggle: document.getElementById("btn-audio-mini-toggle"),
    murottalTimeCurrent: document.getElementById("murottal-time-current"),
    murottalSeekSlider: document.getElementById("murottal-seek-slider"),
    murottalTimeDuration: document.getElementById("murottal-time-duration"),
    btnAudioMute: document.getElementById("btn-audio-mute"),
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
    btnPlayActiveAudio: document.getElementById("btn-play-active-audio"),
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

    el.btnMushafPlayFull.onclick = () => {
      playSurahAudio(s.nomor);
    };

    renderMushafAyahs(s);
    if (shouldScroll && el.mushafSurahDetail) {
      el.mushafSurahDetail.scrollIntoView({ behavior: "smooth", block: "start" });
      showToast(`Membuka QS. ${s.namaLatin} [${s.nomor}]`);
    }
  }

  // =========================================================================
  // CONTINUOUS MUROTTAL PLAYER (AYAT BERSAMBUNG & SURAT PENUH)
  // =========================================================================
  const audioState = {
    mode: "ayah", // "ayah" | "surah"
    surah: 1,
    ayah: 1
  };

  function highlightPlayingAyahCard() {
    el.mushafAyahsList.querySelectorAll("[data-ayah-card]").forEach((card) => {
      const isPlayingThis =
        !el.globalAudioBar.classList.contains("hidden") &&
        audioState.mode === "ayah" &&
        card.getAttribute("data-ayah-card") === `${audioState.surah}:${audioState.ayah}`;
      card.classList.toggle("ring-2", isPlayingThis);
      card.classList.toggle("ring-amber-500", isPlayingThis);
      card.classList.toggle("bg-amber-50/40", isPlayingThis);
    });
  }

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

  function populateAudioSelectors() {
    if (!el.audioSurahSelect || !el.audioAyahSelect) return;
    el.audioSurahSelect.innerHTML = buildSurahOptionsHtml();
    el.audioSurahSelect.value = String(audioState.surah || 1);
    el.audioAyahSelect.innerHTML = buildAyahOptionsHtml(audioState.surah || 1, { includeFullSurah: true });
    el.audioAyahSelect.value = audioState.mode === "surah" ? "full" : String(audioState.ayah || 1);
  }

  function getAdjacentAudioItem(surahNum, ayahNum, delta, isFullSurah = false) {
    const surahs = kemenagCorpus.surahs || [];
    const curS = surahs.find((x) => x.nomor === Number(surahNum));
    if (!curS) return null;

    if (isFullSurah) {
      const targetS = surahs.find((x) => x.nomor === curS.nomor + delta);
      if (!targetS) return null;
      return {
        surah: targetS,
        ayah: (targetS.ayat && targetS.ayat[0]) || null,
        isFullSurah: true,
        label: `QS. ${targetS.namaLatin} [${targetS.nomor}] (${targetS.jumlahAyat} Ayat)`
      };
    }

    const targetAyahNum = Number(ayahNum) + delta;
    if (targetAyahNum >= 1 && targetAyahNum <= curS.jumlahAyat) {
      const aObj = (curS.ayat || []).find((x) => x.n === targetAyahNum);
      return aObj
        ? { surah: curS, ayah: aObj, isFullSurah: false, label: `QS. ${curS.namaLatin} [${curS.nomor}]: ${aObj.n}` }
        : null;
    }

    const adjSurah = surahs.find((x) => x.nomor === curS.nomor + delta);
    if (!adjSurah) return null;
    const adjAyahNum = delta > 0 ? 1 : adjSurah.jumlahAyat;
    const adjAyah = (adjSurah.ayat || []).find((x) => x.n === adjAyahNum);
    return adjAyah
      ? { surah: adjSurah, ayah: adjAyah, isFullSurah: false, label: `QS. ${adjSurah.namaLatin} [${adjSurah.nomor}]: ${adjAyah.n}` }
      : null;
  }

  const murottalStreamState = {
    surah: null,
    activeAyah: null
  };

  function setStreamRowActive(row, isActive) {
    if (!row) return;
    const arEl = row.querySelector(".stream-ar");
    if (isActive) {
      row.classList.add("bg-amber-400/20", "ring-1", "ring-amber-300/60", "opacity-100");
      row.classList.remove("bg-white/5", "opacity-65");
      if (arEl) {
        arEl.classList.add("text-amber-200");
        arEl.classList.remove("text-emerald-50/90");
      }
    } else {
      row.classList.remove("bg-amber-400/20", "ring-1", "ring-amber-300/60", "opacity-100");
      row.classList.add("bg-white/5", "opacity-65");
      if (arEl) {
        arEl.classList.remove("text-amber-200");
        arEl.classList.add("text-emerald-50/90");
      }
    }
  }

  function computeRowScrollTarget(tp, row, progress, maxTp) {
    if (!row) return 0;
    const topMargin = 12;
    const rowTop = Math.max(0, row.offsetTop - topMargin);
    const overflowH = row.offsetHeight + topMargin + 8 - tp.clientHeight;
    // Rentang progres pembacaan efektif qari (0.06..0.94) agar ayat yang dibaca selalu tetap terlihat
    const voiceProgress = Math.min(1, Math.max(0, (progress - 0.06) / 0.88));
    if (overflowH > 0) {
      return Math.min(maxTp, rowTop + overflowH * voiceProgress);
    }
    const tailDrift = progress > 0.78 ? ((progress - 0.78) / 0.22) * 8 : 0;
    return Math.min(maxTp, rowTop + tailDrift);
  }

  function updateMurottalTeleprompter(immediate = false) {
    if (!el.audioTeleprompter || !el.quranAudioPlayer || !el.audioSurahStream) return;
    const dur = el.quranAudioPlayer.duration;
    const cur = el.quranAudioPlayer.currentTime;
    if (!dur || !isFinite(dur) || dur <= 0) return;

    const pct = Math.min(1, Math.max(0, cur / dur));
    const tp = el.audioTeleprompter;
    const maxTp = Math.max(0, tp.scrollHeight - tp.clientHeight);
    const items = el.audioSurahStream.querySelectorAll(".surah-stream-item");
    if (!items.length) return;

    if (audioState.mode === "surah") {
      let matchedIdx = items.length - 1;
      for (let i = 0; i < items.length; i++) {
        const st = parseFloat(items[i].getAttribute("data-wstart") || "0");
        const en = parseFloat(items[i].getAttribute("data-wend") || "1");
        if (pct >= st && pct <= en) {
          matchedIdx = i;
          break;
        }
      }
      items.forEach((node, idx) => setStreamRowActive(node, idx === matchedIdx));
      const activeEl = items[matchedIdx];
      if (activeEl) {
        const st = parseFloat(activeEl.getAttribute("data-wstart") || "0");
        const en = parseFloat(activeEl.getAttribute("data-wend") || "1");
        const localPct = en > st ? Math.min(1, Math.max(0, (pct - st) / (en - st))) : 0;
        const target = computeRowScrollTarget(tp, activeEl, localPct, maxTp);
        if (immediate) {
          tp.scrollTop = target;
        } else if (Math.abs(target - tp.scrollTop) > 0.5) {
          tp.scrollTop = tp.scrollTop + (target - tp.scrollTop) * 0.14;
        }
      }
      return;
    }

    const activeRow = el.audioSurahStream.querySelector(`.surah-stream-item[data-surah-ay="${audioState.ayah}"]`);
    if (!activeRow) return;

    const targetTop = computeRowScrollTarget(tp, activeRow, pct, maxTp);
    if (immediate) {
      tp.scrollTop = targetTop;
    } else if (Math.abs(targetTop - tp.scrollTop) > 0.5) {
      tp.scrollTop = tp.scrollTop + (targetTop - tp.scrollTop) * 0.14;
    }
  }

  function syncAudioPreviewText(s, a, isFullSurah = false) {
    if (el.audioSurahSelect) el.audioSurahSelect.value = String(s.nomor);
    if (el.audioAyahSelect) {
      if (Number(el.audioAyahSelect.getAttribute("data-surah")) !== s.nomor || el.audioAyahSelect.options.length === 0) {
        el.audioAyahSelect.innerHTML = buildAyahOptionsHtml(s.nomor, { includeFullSurah: true });
        el.audioAyahSelect.setAttribute("data-surah", String(s.nomor));
      }
      el.audioAyahSelect.value = isFullSurah ? "full" : String(a ? a.n : 1);
    }
    if (el.audioSurahAr) el.audioSurahAr.textContent = s.nama ? `سُورَةُ ${formatDiwaniArabic(s.nama)}` : "";

    const activeAyNum = a ? a.n : 1;
    const prevItem = getAdjacentAudioItem(s.nomor, activeAyNum, -1, isFullSurah);
    if (el.btnAudioPrevPreview && el.audioPrevRef && el.audioPrevAr) {
      el.btnAudioPrevPreview.disabled = !prevItem;
      el.audioPrevRef.textContent = prevItem ? prevItem.label : "Awal Al-Qur'an";
      el.audioPrevAr.innerHTML = prevItem && prevItem.ayah ? formatQuranArabicHtml(prevItem.ayah.ar, true) : "—";
    }

    if (!el.audioSurahStream || !el.audioTeleprompter) return;

    const ayList = s.ayat || [];
    const surahChanged = murottalStreamState.surah !== s.nomor || el.audioSurahStream.children.length === 0;
    const prevAyNum = murottalStreamState.activeAyah;

    if (surahChanged) {
      const weights = ayList.map((ay) => 18 + String(ay.ar || "").length);
      const totalW = weights.reduce((acc, x) => acc + x, 0) || 1;
      let cum = 0;
      el.audioSurahStream.innerHTML = ayList
        .map((ay, idx) => {
          const st = cum / totalW;
          cum += weights[idx];
          const en = cum / totalW;
          return `
        <div data-surah-ay="${ay.n}" data-wstart="${st.toFixed(4)}" data-wend="${en.toFixed(4)}" class="surah-stream-item rounded-xl px-3 py-1.5 bg-white/5 opacity-65 transition-colors duration-200 cursor-pointer flex items-start justify-between gap-2.5">
          <span class="shrink-0 mt-1 px-2 py-0.5 rounded-lg bg-white/10 text-[10px] font-bold text-amber-200/90 inline-flex items-center gap-1" title="Nomor Ayat ${ay.n}">
            <span>${ay.n}</span>
            <span class="opacity-50">|</span>
            <span class="font-arabic text-xs leading-none">${toArabicIndicDigits(ay.n)}</span>
          </span>
          <p class="stream-ar font-arabic text-base text-emerald-50/90 leading-[2.0] text-right flex-1 min-w-0 transition-colors duration-200" dir="rtl">${formatQuranArabicHtml(ay.ar, true)}</p>
        </div>
      `;
        })
        .join("");
      el.audioSurahStream.querySelectorAll(".surah-stream-item").forEach((card) => {
        card.addEventListener("click", () => {
          const ayNum = parseInt(card.getAttribute("data-surah-ay"), 10);
          if (ayNum) playAyahSequence(s.nomor, ayNum);
        });
      });
      murottalStreamState.surah = s.nomor;
      murottalStreamState.activeAyah = null;
    }

    if (prevAyNum && prevAyNum !== activeAyNum) {
      const oldRow = el.audioSurahStream.querySelector(`.surah-stream-item[data-surah-ay="${prevAyNum}"]`);
      if (oldRow) setStreamRowActive(oldRow, false);
    }

    const newRow = el.audioSurahStream.querySelector(`.surah-stream-item[data-surah-ay="${activeAyNum}"]`);
    if (newRow) setStreamRowActive(newRow, true);
    murottalStreamState.activeAyah = activeAyNum;

    requestAnimationFrame(() => {
      if (!newRow || !el.audioTeleprompter) return;
      const tp = el.audioTeleprompter;
      const targetRowTop = Math.max(0, newRow.offsetTop - 12);
      if (surahChanged || prevAyNum === null) {
        tp.scrollTop = targetRowTop;
      } else {
        tp.scrollTo({ top: targetRowTop, behavior: "smooth" });
      }
    });
  }

  function playAyahSequence(surahId, ayahNum, autoPlay = true) {
    const s = (kemenagCorpus.surahs || []).find((x) => x.nomor === Number(surahId));
    const a = s && (s.ayat || []).find((x) => x.n === Number(ayahNum));
    if (!s || !a || !a.au) {
      showToast("Audio murottal untuk ayat ini tidak tersedia.", true);
      return;
    }

    audioState.mode = "ayah";
    audioState.surah = s.nomor;
    audioState.ayah = a.n;

    el.globalAudioBar.classList.remove("hidden");
    if (el.btnAudioReopen) el.btnAudioReopen.classList.add("hidden");
    syncAudioPreviewText(s, a, false);
    el.audioNowPlaying.textContent = `QS. ${s.namaLatin} [${s.nomor}] • Ayat ${a.n} dari ${s.jumlahAyat}`;
    if (a.n < s.jumlahAyat) {
      el.audioNextInfo.textContent = `(Lanjut otomatis ke Ayat ${a.n + 1}..dst)`;
    } else if (s.nomor < 114) {
      const nextS = (kemenagCorpus.surahs || []).find((x) => x.nomor === s.nomor + 1);
      el.audioNextInfo.textContent = nextS ? `(Bersambung ke QS. ${nextS.namaLatin} [${nextS.nomor}]: 1)` : "";
    } else {
      el.audioNextInfo.textContent = "(Ayat terakhir Mushaf)";
    }

    if (el.quranAudioPlayer.src !== a.au) {
      el.quranAudioPlayer.src = a.au;
    }
    if (autoPlay) el.quranAudioPlayer.play().catch(() => {});
    highlightPlayingAyahCard();
  }

  function playSurahAudio(surahId, autoPlay = true) {
    const s = (kemenagCorpus.surahs || []).find((x) => x.nomor === Number(surahId));
    if (!s || !s.audioFull) {
      showToast("Audio penuh surat tidak tersedia.", true);
      return;
    }
    audioState.mode = "surah";
    audioState.surah = s.nomor;
    audioState.ayah = 1;

    el.globalAudioBar.classList.remove("hidden");
    if (el.btnAudioReopen) el.btnAudioReopen.classList.add("hidden");
    syncAudioPreviewText(s, (s.ayat && s.ayat[0]) || null, true);
    el.audioNowPlaying.textContent = `QS. ${s.namaLatin} [${s.nomor}] • Surat Penuh (${s.jumlahAyat} Ayat)`;
    const nextS = s.nomor < 114 ? (kemenagCorpus.surahs || []).find((x) => x.nomor === s.nomor + 1) : null;
    el.audioNextInfo.textContent = nextS ? `(Bersambung ke QS. ${nextS.namaLatin} [${nextS.nomor}])` : "(Surat terakhir)";

    if (el.quranAudioPlayer.src !== s.audioFull) {
      el.quranAudioPlayer.src = s.audioFull;
    }
    if (autoPlay) el.quranAudioPlayer.play().catch(() => {});
    highlightPlayingAyahCard();
  }

  function stepAudioTrack(delta) {
    if (audioState.mode === "surah") {
      const target = audioState.surah + delta;
      if (target >= 1 && target <= 114) {
        playSurahAudio(target);
      } else {
        showToast("Sudah berada di batas daftar surat.");
      }
      return;
    }

    const curS = (kemenagCorpus.surahs || []).find((x) => x.nomor === audioState.surah);
    if (!curS) return;
    if (delta > 0) {
      if (audioState.ayah < curS.jumlahAyat) {
        playAyahSequence(curS.nomor, audioState.ayah + 1);
      } else if (curS.nomor < 114) {
        playAyahSequence(curS.nomor + 1, 1);
      } else {
        showToast("Khatam 114 surat (6.236 ayat).");
      }
    } else {
      if (audioState.ayah > 1) {
        playAyahSequence(curS.nomor, audioState.ayah - 1);
      } else if (curS.nomor > 1) {
        const prevS = (kemenagCorpus.surahs || []).find((x) => x.nomor === curS.nomor - 1);
        if (prevS) playAyahSequence(prevS.nomor, prevS.jumlahAyat);
      }
    }
  }

  if (el.audioSurahSelect) {
    el.audioSurahSelect.addEventListener("change", () => {
      const sid = parseInt(el.audioSurahSelect.value, 10) || 1;
      el.audioAyahSelect.innerHTML = buildAyahOptionsHtml(sid, { includeFullSurah: true });
      el.audioAyahSelect.setAttribute("data-surah", String(sid));
      playAyahSequence(sid, 1);
    });
  }
  if (el.audioAyahSelect) {
    el.audioAyahSelect.addEventListener("change", () => {
      const sid = parseInt(el.audioSurahSelect.value, 10) || 1;
      const val = el.audioAyahSelect.value;
      if (val === "full") {
        playSurahAudio(sid);
      } else {
        playAyahSequence(sid, parseInt(val, 10) || 1);
      }
    });
  }

  el.quranAudioPlayer.addEventListener("ended", () => {
    if (el.chkAudioRepeat && el.chkAudioRepeat.checked) {
      el.quranAudioPlayer.currentTime = 0;
      el.quranAudioPlayer.play().catch(() => {});
      return;
    }
    if (!el.chkAudioAutocontinue || !el.chkAudioAutocontinue.checked) return;
    stepAudioTrack(1);
  });
  el.btnAudioNext.addEventListener("click", () => stepAudioTrack(1));
  el.btnAudioPrev.addEventListener("click", () => stepAudioTrack(-1));
  if (el.btnAudioPrevPreview) el.btnAudioPrevPreview.addEventListener("click", () => stepAudioTrack(-1));
  const PLAY_ICON_SVG = '<svg class="w-5 h-5 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5.14v14l11-7-11-7z"/></svg>';
  const PAUSE_ICON_SVG = '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 5h3.5v14H7V5zm6.5 0H17v14h-3.5V5z"/></svg>';

  function formatMurottalClock(sec) {
    if (!sec || !isFinite(sec) || sec < 0) return "0:00";
    const whole = Math.floor(sec);
    const m = Math.floor(whole / 60);
    const s = whole % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function syncMurottalCustomPlayerBar() {
    if (!el.quranAudioPlayer) return;
    const dur = el.quranAudioPlayer.duration;
    const cur = el.quranAudioPlayer.currentTime || 0;
    const hasDur = Boolean(dur && isFinite(dur) && dur > 0);
    const pct = hasDur ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;

    if (el.murottalTimeCurrent) el.murottalTimeCurrent.textContent = formatMurottalClock(cur);
    if (el.murottalTimeDuration) el.murottalTimeDuration.textContent = hasDur ? formatMurottalClock(dur) : "0:00";
    if (el.murottalSeekSlider) {
      el.murottalSeekSlider.value = hasDur ? String(Math.round((pct / 100) * 1000)) : "0";
      el.murottalSeekSlider.style.background = `linear-gradient(to right, #fbbf24 0%, #fbbf24 ${pct.toFixed(1)}%, rgba(255,255,255,0.18) ${pct.toFixed(1)}%, rgba(255,255,255,0.18) 100%)`;
    }
    if (el.btnAudioMiniToggle) {
      const miniPlaySvg = `<svg class="w-3 h-3 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5.14v14l11-7-11-7z"/></svg>`;
      const miniPauseSvg = `<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>`;
      el.btnAudioMiniToggle.innerHTML = el.quranAudioPlayer.paused || el.quranAudioPlayer.ended ? miniPlaySvg : miniPauseSvg;
    }
    if (el.btnAudioMute) {
      const muted = Boolean(el.quranAudioPlayer.muted || el.quranAudioPlayer.volume === 0);
      el.btnAudioMute.innerHTML = muted
        ? `<svg class="w-3.5 h-3.5 text-amber-300" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5L6 9H2v6h4l5 4V5zm10 4l-6 6m0-6l6 6"/></svg>`
        : `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5L6 9H2v6h4l5 4V5zm4.54 3.46a5 5 0 010 7.07m2.83-9.9a9 9 0 010 12.73"/></svg>`;
    }
  }

  if (el.btnAudioPlayActive) {
    const toggleAudioPlayback = () => {
      if (!el.quranAudioPlayer.paused && el.quranAudioPlayer.src) {
        el.quranAudioPlayer.pause();
        return;
      }
      const sid = parseInt(el.audioSurahSelect && el.audioSurahSelect.value, 10) || audioState.surah || 1;
      const aval = el.audioAyahSelect ? el.audioAyahSelect.value : String(audioState.ayah || 1);
      if (aval === "full") {
        playSurahAudio(sid);
      } else {
        playAyahSequence(sid, parseInt(aval, 10) || 1);
      }
    };
    el.btnAudioPlayActive.addEventListener("click", toggleAudioPlayback);
    if (el.btnAudioMiniToggle) el.btnAudioMiniToggle.addEventListener("click", toggleAudioPlayback);
    if (el.btnAudioMute) {
      el.btnAudioMute.addEventListener("click", () => {
        el.quranAudioPlayer.muted = !el.quranAudioPlayer.muted;
        syncMurottalCustomPlayerBar();
      });
    }
    if (el.murottalSeekSlider) {
      el.murottalSeekSlider.addEventListener("input", () => {
        const dur = el.quranAudioPlayer.duration;
        if (!dur || !isFinite(dur) || dur <= 0) return;
        const val = parseFloat(el.murottalSeekSlider.value) || 0;
        el.quranAudioPlayer.currentTime = (val / 1000) * dur;
        syncMurottalCustomPlayerBar();
        updateMurottalTeleprompter(true);
      });
    }
    el.quranAudioPlayer.addEventListener("play", () => {
      el.btnAudioPlayActive.innerHTML = PAUSE_ICON_SVG;
      syncMurottalCustomPlayerBar();
      const tick = () => {
        if (!el.quranAudioPlayer || el.quranAudioPlayer.paused || el.quranAudioPlayer.ended) return;
        syncMurottalCustomPlayerBar();
        updateMurottalTeleprompter(false);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    el.quranAudioPlayer.addEventListener("timeupdate", () => {
      syncMurottalCustomPlayerBar();
      updateMurottalTeleprompter(false);
    });
    el.quranAudioPlayer.addEventListener("seeking", () => {
      syncMurottalCustomPlayerBar();
      updateMurottalTeleprompter(true);
    });
    el.quranAudioPlayer.addEventListener("loadedmetadata", () => {
      syncMurottalCustomPlayerBar();
      updateMurottalTeleprompter(true);
    });
    el.quranAudioPlayer.addEventListener("durationchange", syncMurottalCustomPlayerBar);
    el.quranAudioPlayer.addEventListener("volumechange", syncMurottalCustomPlayerBar);
    el.quranAudioPlayer.addEventListener("pause", () => {
      el.btnAudioPlayActive.innerHTML = PLAY_ICON_SVG;
      syncMurottalCustomPlayerBar();
    });
    el.quranAudioPlayer.addEventListener("ended", () => {
      el.btnAudioPlayActive.innerHTML = PLAY_ICON_SVG;
      syncMurottalCustomPlayerBar();
    });
    syncMurottalCustomPlayerBar();
  }
  el.btnAudioClose.addEventListener("click", () => {
    el.quranAudioPlayer.pause();
    el.globalAudioBar.classList.add("hidden");
    if (el.btnAudioReopen) el.btnAudioReopen.classList.remove("hidden");
    highlightPlayingAyahCard();
  });
  if (el.btnAudioReopen) {
    el.btnAudioReopen.addEventListener("click", () => {
      el.globalAudioBar.classList.remove("hidden");
      el.btnAudioReopen.classList.add("hidden");
    });
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
              ${
                a.au
                  ? `<button type="button" data-play-surah="${s.nomor}" data-play-ayah="${a.n}" class="btn-ayah-audio px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg font-semibold transition" title="Putar dari ayat ini &amp; lanjut otomatis">Audio ▸</button>`
                  : ""
              }
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

    el.mushafAyahsList.querySelectorAll(".btn-ayah-audio").forEach((b) => {
      b.addEventListener("click", () => {
        const sid = parseInt(b.getAttribute("data-play-surah"), 10);
        const aid = parseInt(b.getAttribute("data-play-ayah"), 10);
        playAyahSequence(sid, aid);
      });
    });
    highlightPlayingAyahCard();

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
    const sid = parseInt(el.quickSurahSelect.value, 10);
    populateQuickAyahSelect(sid);
    loadAnyQuranVerse(sid, 1);
  });

  el.quickAyahSelect.addEventListener("change", () => {
    const sid = parseInt(el.quickSurahSelect.value, 10);
    const aid = parseInt(el.quickAyahSelect.value, 10);
    loadAnyQuranVerse(sid, aid);
  });

  el.btnQuickLoadAyah.addEventListener("click", () => {
    const sid = parseInt(el.quickSurahSelect.value, 10);
    const aid = parseInt(el.quickAyahSelect.value, 10);
    loadAnyQuranVerse(sid, aid);
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
    populateAudioSelectors();
    populateStudioSelectors();
    populateCompareSelectors();
    renderSurahGrid();
    selectMushafSurah(1);

    const s1 = (kemenagCorpus.surahs || []).find((x) => x.nomor === 1);
    if (s1) syncAudioPreviewText(s1, (s1.ayat && s1.ayat[0]) || null, false);

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

    // Find audio URL from Kemenag full corpus
    const kSurah = (kemenagCorpus.surahs || []).find((s) => s.nomor === data.surah);
    const kAyah = kSurah && (kSurah.ayat || []).find((a) => a.n === data.verse);
    const audioUrl = data.audioUrl || (kAyah && kAyah.au) || "";
    el.btnPlayActiveAudio.classList.toggle("hidden", !audioUrl);
    el.btnPlayActiveAudio.onclick = () => {
      if (!audioUrl) return;
      playAyahSequence(data.surah, data.verse);
    };

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
