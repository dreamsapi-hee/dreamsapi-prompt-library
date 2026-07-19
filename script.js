// Google Sheets 설정 영역
// spreadsheetId와 gid만 넣으면 앱이 공개 CSV 주소를 자동으로 만들어 읽습니다.
// 시트가 "링크가 있는 모든 사용자 보기" 또는 "웹에 게시" 상태여야 브라우저에서 읽을 수 있습니다.
const googleSheet = {
  spreadsheetId: "1sg4e7hfv52QhDkkjn8fMLYwuC7HqTpev",
  promptSheet: "App_Prompts",
  structureSheet: "Category_Map",
  courseTitle: "Google Flow 이미지 제작 실전"
};

// 직접 만든 공개 CSV 주소가 있다면 prompts에 넣어 주세요. prompts 값이 있으면 이 주소를 우선 사용합니다.
const dataSources = {
  courses: "",
  prompts: "",
  studentView: ""
};

const state = {
  rows: [],
  sectionMeta: new Map(),
  rawHeaders: [],
  selectedCourse: "",
  selectedSection: "",
  selectedPromptId: "",
  query: "",
  loading: true,
  error: false,
  errorMessage: "",
  sidebarOpen: false
};

const els = {
  body: document.body,
  courseSelect: document.querySelector("#courseSelect"),
  searchInput: document.querySelector("#searchInput"),
  searchButton: document.querySelector("#searchButton"),
  themeToggle: document.querySelector("#themeToggle"),
  sectionList: document.querySelector("#sectionList"),
  sectionSidebar: document.querySelector("#sectionSidebar"),
  openSidebar: document.querySelector("#openSidebar"),
  closeSidebar: document.querySelector("#closeSidebar"),
  mobileBackdrop: document.querySelector("#mobileBackdrop"),
  loadingState: document.querySelector("#loadingState"),
  emptyState: document.querySelector("#emptyState"),
  errorState: document.querySelector("#errorState"),
  errorMessage: document.querySelector("#errorMessage"),
  promptList: document.querySelector("#promptList"),
  courseKicker: document.querySelector("#courseKicker"),
  courseMenuTitle: document.querySelector("#courseMenuTitle"),
  sectionTitle: document.querySelector("#sectionTitle"),
  resultCount: document.querySelector("#resultCount"),
  detailPanel: document.querySelector("#detailPanel"),
  detailEmpty: document.querySelector("#detailEmpty"),
  detailContent: document.querySelector("#detailContent"),
  detailTitle: document.querySelector("#detailTitle"),
  detailDesc: document.querySelector("#detailDesc"),
  detailTags: document.querySelector("#detailTags"),
  detailPrompt: document.querySelector("#detailPrompt"),
  detailRepresentative: document.querySelector("#detailRepresentative"),
  closeDetail: document.querySelector("#closeDetail"),
  copyButton: document.querySelector("#copyButton"),
  toast: document.querySelector("#toast"),
  sidebarResizer: document.querySelector("#sidebarResizer"),
  panelResizer: document.querySelector("#panelResizer")
};

let gvizRequestSequence = 0;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  applyInitialTheme();
  readHashState();
  await loadData();
  state.loading = false;
  hydrateInitialSelection();
  render();
}

function bindEvents() {
  els.courseSelect.addEventListener("change", () => {
    state.selectedCourse = els.courseSelect.value;
    state.selectedSection = getSectionsForCourse(state.selectedCourse)[0]?.name || "";
    state.selectedPromptId = getFilteredPrompts()[0]?.prompt_id || "";
    updateHash();
    render();
  });

  els.searchInput.addEventListener("input", () => {
    state.query = els.searchInput.value.trim();
    state.selectedPromptId = getFilteredPrompts()[0]?.prompt_id || "";
    render();
  });

  els.searchButton?.addEventListener("click", () => {
    els.searchInput.focus();
  });

  els.themeToggle.addEventListener("click", () => {
    const nextTheme = els.body.classList.contains("dark") ? "light" : "dark";
    setTheme(nextTheme);
  });

  els.openSidebar.addEventListener("click", () => setSidebar(true));
  els.closeSidebar.addEventListener("click", () => setSidebar(false));
  els.mobileBackdrop.addEventListener("click", () => {
    setSidebar(false);
    closeDetailPanel();
  });
  els.closeDetail.addEventListener("click", closeDetailPanel);
  els.copyButton.addEventListener("click", copySelectedPrompt);
  bindSidebarResizer();
  bindPanelResizer();

  window.addEventListener("hashchange", () => {
    readHashState();
    hydrateInitialSelection();
    render();
  });
}

async function loadData() {
  state.loading = true;
  state.error = false;
  state.errorMessage = "";
  renderShellStates();

  try {
    const [promptData, structureData] = await Promise.all([
      loadSheetData(googleSheet.promptSheet),
      loadSheetData(googleSheet.structureSheet).catch(() => ({ rows: [], headers: [] }))
    ]);
    state.rawHeaders = promptData.headers;
    state.sectionMeta = buildSectionMeta(structureData.rows);
    state.rows = promptData.rows.map(normalizeRow).filter(isPublicRow);

    if (promptData.rows.length > 0 && state.rows.length === 0) {
      state.error = true;
      state.errorMessage = "CSV는 열렸지만 표시할 행이 없습니다. public 값이 YES인지 확인해 주세요.";
    }
  } catch (error) {
    console.error(error);
    state.rows = [];
    state.error = true;
    state.errorMessage = makeFriendlyError(error);
  }
}

async function loadSheetData(sheetName = googleSheet.promptSheet) {
  if (sheetName) {
    return await loadGvizData(sheetName);
  }

  const csvUrl = getPromptCsvUrl();
  if (!csvUrl) return { rows: [], headers: [] };

  try {
    return await fetchCsv(csvUrl);
  } catch (error) {
    console.warn("CSV fetch failed. Trying Google Visualization fallback.", error);
    if (canUseGvizFallback()) {
      return await loadGvizData();
    }
    throw error;
  }
}

function buildSectionMeta(rows) {
  const meta = new Map();
  rows.forEach((row) => {
    const label = pick(row, ["category", "category_title", "카테고리", "카테고리명", "section_title", "section", "섹션명", "섹션"]);
    const order = pick(row, ["category_order", "section_order", "order", "순서"]);
    const key = getSectionKey(label);
    if (key && !meta.has(key)) {
      meta.set(key, {
        label,
        order: Number.parseFloat(order)
      });
    }
  });
  return meta;
}

function getPromptCsvUrl() {
  if (dataSources.prompts) return dataSources.prompts;
  if (!googleSheet.spreadsheetId) return "";
  const id = encodeURIComponent(googleSheet.spreadsheetId);
  const gid = encodeURIComponent(googleSheet.gid || "0");
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

function canUseGvizFallback() {
  return Boolean(googleSheet.spreadsheetId);
}

function getGvizUrl(callbackName, sheetName = googleSheet.promptSheet) {
  const id = encodeURIComponent(googleSheet.spreadsheetId);
  const tqx = encodeURIComponent(`out:json;responseHandler:${callbackName}`);
  const sheet = encodeURIComponent(sheetName);
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?sheet=${sheet}&headers=1&tqx=${tqx}`;
}

function loadGvizData(sheetName = googleSheet.promptSheet) {
  return new Promise((resolve, reject) => {
    const callbackName = `dreamsapiGviz${Date.now()}_${gvizRequestSequence += 1}`;
    const script = document.createElement("script");
    let timeoutId;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
    };

    window[callbackName] = (response) => {
      cleanup();
      if (response?.status === "error") {
        reject(new Error(response.errors?.[0]?.detailed_message || "GVIZ_ERROR"));
        return;
      }
      resolve(convertGvizResponse(response));
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("GVIZ_SCRIPT_ERROR"));
    };

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error(`GVIZ_TIMEOUT:${sheetName}`));
    }, 12000);

    script.src = getGvizUrl(callbackName, sheetName);
    document.head.append(script);
  });
}

function convertGvizResponse(response) {
  const table = response?.table;
  const headers = (table?.cols || []).map((col, index) => clean(col.label || col.id || `column_${index + 1}`));
  const rows = (table?.rows || []).map((row) => {
    const item = {};
    headers.forEach((header, index) => {
      const cell = row.c?.[index];
      item[header] = clean(cell?.f ?? cell?.v ?? "");
    });
    return item;
  });

  return { headers, rows };
}

async function fetchCsv(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const text = await response.text();
  if (/^\s*</.test(text)) {
    throw new Error("HTML_RESPONSE");
  }

  return parseCsv(text);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);

  const headers = rows.shift()?.map((header) => header.trim()) || [];
  return {
    headers,
    rows: rows.map((cells) => {
      const item = {};
      headers.forEach((header, index) => {
        item[header] = cells[index] || "";
      });
      return item;
    })
  };
}

function normalizeRow(row, options = {}) {
  const courseTitle = pick(row, ["course_title", "course", "코스", "코스명"]) || googleSheet.courseTitle;
  const section = pick(row, ["category", "category_title", "카테고리", "카테고리명", "section", "section_title", "섹션", "섹션명"]);
  const title = pick(row, ["prompt_title", "title", "goal", "프롬프트 제목", "목표"]);
  const desc = pick(row, ["short_desc", "description", "desc", "설명", "짧은 설명"]);
  const inputPlace = pick(row, ["input_place", "inputPlace", "input", "입력 위치", "입력위치"]);
  const promptBody = pick(row, ["copy_text", "copyText", "copy", "복사문구", "복사 텍스트", "prompt_ko", "prompt", "prompt_text", "body", "본문", "프롬프트"]);
  const tool = pick(row, ["tool", "tools", "도구"]);
  const rawPromptId = pick(row, ["prompt_id", "id"]);
  const practiceSet = pick(row, ["set_id", "setId", "practice_set", "practiceSet", "practice", "set", "group", "variant", "button", "실습세트", "세트", "그룹"]);
  const setTitle = pick(row, ["set_title", "setTitle", "세트 제목", "세트제목"]);
  const stepOrder = pick(row, ["step_order", "stepOrder", "step", "순서", "단계 순서", "단계순서"]);
  const stepName = pick(row, ["step_name", "stepName", "단계명", "스텝명"]);

  return {
    course_id: pick(row, ["course_id", "id"]),
    course_title: courseTitle || "이름 없는 코스",
    section: section || "카테고리 없음",
    section_order: pick(row, ["category_order", "section_order", "order", "순서"]),
    prompt_id: rawPromptId || makeStableId(courseTitle, section, title, desc),
    display_id: rawPromptId,
    prompt_title: title || section || "제목 없는 프롬프트",
    short_desc: desc,
    input_place: inputPlace,
    prompt_ko: promptBody || desc || title || "",
    copy_text: promptBody || "",
    practice_set: practiceSet,
    set_title: setTitle,
    step_order: stepOrder,
    step_name: stepName,
    tool,
    ratio: pick(row, ["ratio", "비율"]),
    level: pick(row, ["level", "난이도"]),
    use_type: pick(row, ["use_type", "type", "용도"]),
    is_representative: pick(row, ["is_representative", "representative", "대표 실습", "대표"]),
    status: pick(row, ["status", "상태"]),
    public: pick(row, ["public", "is_public", "visible", "publish", "공개여부", "공개"]),
    public_default: pick(row, ["public_default", "publicDefault", "default_public", "기본공개", "공개기본값"])
  };
}

function pick(row, keys) {
  for (const key of keys) {
    const value = clean(row[key]);
    if (value) return value;
  }

  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeLookupKey(key), value]);
  for (const key of keys) {
    const normalizedKey = normalizeLookupKey(key);
    const found = normalizedEntries.find(([entryKey]) => entryKey === normalizedKey);
    const value = clean(found?.[1]);
    if (value) return value;
  }
  return "";
}

function clean(value) {
  return String(value ?? "").replace(/^\uFEFF/, "").trim();
}

function normalizeLookupKey(value) {
  return clean(value).toLocaleLowerCase("ko").replace(/[\s_-]+/g, "");
}

function isPublicRow(row) {
  const publicValue = clean(row.public);
  if (publicValue) return isYesValue(publicValue);

  const defaultValue = clean(row.public_default);
  if (defaultValue) return isYesValue(defaultValue);

  const status = clean(row.status);
  if (status) return status === "공개" || isYesValue(status);

  return true;
}

function isYesValue(value) {
  const key = normalizeLookupKey(value);
  return ["yes", "y", "true", "1", "ok", "on", "공개", "표시", "게시"].includes(key);
}
function getSectionKey(value) {
  const text = clean(value);
  const match = text.match(/^\s*(\d+\s*부)/);
  return match ? match[1].replace(/\s+/g, "") : text;
}

function getSectionDisplayName(section) {
  const meta = state.sectionMeta.get(getSectionKey(section));
  return meta?.label || section;
}

function isPracticeSetSection(section) {
  const key = getSectionKey(section).toLocaleLowerCase("ko").replace(/[\s-]+/g, "_");
  return key === "practice_set";
}

function makeStableId(...parts) {
  const source = parts.filter(Boolean).join("|") || `${Date.now()}-${Math.random()}`;
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(i);
    hash |= 0;
  }
  return `prompt-${Math.abs(hash)}`;
}

function makeFriendlyError(error) {
  if (String(error.message).includes("HTML_RESPONSE")) {
    return "CSV 대신 구글 로그인/권한 화면이 열렸습니다. 시트 공유 권한 또는 웹에 게시 설정을 확인해 주세요.";
  }
  if (String(error.message).includes("Failed to fetch")) {
    return "브라우저가 구글시트 요청을 막았습니다. 웹에 게시한 CSV 링크를 dataSources.prompts에 넣으면 가장 안정적입니다.";
  }
  return "구글시트 주소, 공유 권한, 탭 gid를 확인해 주세요.";
}

function hydrateInitialSelection() {
  const courses = getCourses();
  if (!courses.length) return;

  if (!courses.includes(state.selectedCourse)) {
    state.selectedCourse = courses[0];
  }

  const sections = getSectionsForCourse(state.selectedCourse);
  if (!sections.some((section) => section.name === state.selectedSection)) {
    state.selectedSection = sections[0]?.name || "";
  }


  const promptIds = getFilteredPrompts().map((prompt) => prompt.prompt_id);
  if (state.selectedPromptId && !promptIds.includes(state.selectedPromptId)) {
    state.selectedPromptId = "";
  }

  if (!state.selectedPromptId && promptIds.length) {
    state.selectedPromptId = promptIds[0];
  }
}

function getCourses() {
  return [...new Set(state.rows.map((row) => row.course_title))].filter(Boolean);
}

function getSectionsForCourse(courseTitle) {
  const sectionMap = new Map();

  state.rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.course_title === courseTitle && !isPracticeSetSection(row.section))
    .forEach(({ row, index }) => {
      const meta = state.sectionMeta.get(getSectionKey(row.section));
      const promptOrder = getPromptOrderNumber(row);
      const fallbackOrder = Number.isFinite(meta?.order) ? meta.order : Number.parseFloat(row.section_order);
      const rowOrder = Number.isFinite(promptOrder) ? promptOrder : fallbackOrder;
      const existing = sectionMap.get(row.section);

      if (!existing) {
        sectionMap.set(row.section, {
          name: row.section,
          label: getSectionDisplayName(row.section),
          order: rowOrder,
          firstIndex: index
        });
        return;
      }

      const existingHasOrder = Number.isFinite(existing.order);
      const rowHasOrder = Number.isFinite(rowOrder);
      if ((rowHasOrder && !existingHasOrder) || (rowHasOrder && rowOrder < existing.order)) {
        existing.order = rowOrder;
        existing.firstIndex = index;
      }
    });

  return [...sectionMap.values()].sort((a, b) => {
    const aPractice = getPracticeCategoryRank(a.name);
    const bPractice = getPracticeCategoryRank(b.name);
    const aIsPractice = Number.isFinite(aPractice);
    const bIsPractice = Number.isFinite(bPractice);
    if (aIsPractice && bIsPractice) return aPractice - bPractice;
    if (aIsPractice) return -1;
    if (bIsPractice) return 1;

    const aHasOrder = Number.isFinite(a.order);
    const bHasOrder = Number.isFinite(b.order);
    if (aHasOrder && bHasOrder) return a.order - b.order || a.firstIndex - b.firstIndex;
    if (aHasOrder) return -1;
    if (bHasOrder) return 1;
    return a.firstIndex - b.firstIndex || a.name.localeCompare(b.name, "ko");
  });
}
function getFilteredPrompts() {
  const query = state.query.toLocaleLowerCase("ko");
  return state.rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      const inCourse = row.course_title === state.selectedCourse;
      const inSection = state.query ? true : row.section === state.selectedSection;
      const matchesQuery = !query || `${row.prompt_title} ${row.short_desc} ${row.input_place}`.toLocaleLowerCase("ko").includes(query);
      return inCourse && inSection && matchesQuery;
    })
    .sort((a, b) => comparePromptOrder(a, b))
    .map(({ row }) => row);
}


function getPracticeCategoryRank(section) {
  const key = normalizeLookupKey(section);
  const match = key.match(/^실습([abcd])/i);
  if (!match) return Number.NaN;
  return { a: 0, b: 1, c: 2, d: 3 }[match[1].toLocaleLowerCase("ko")];
}

function isPracticeCategory(section) {
  return Number.isFinite(getPracticeCategoryRank(section));
}
function comparePromptOrder(a, b) {
  const aNumber = getPromptOrderNumber(a.row);
  const bNumber = getPromptOrderNumber(b.row);
  const aHasNumber = Number.isFinite(aNumber);
  const bHasNumber = Number.isFinite(bNumber);

  if (aHasNumber && bHasNumber) return aNumber - bNumber || a.index - b.index;
  if (aHasNumber) return -1;
  if (bHasNumber) return 1;
  return a.index - b.index;
}
function isPracticePrompt(prompt) {
  return false;
}
function getPromptOrderNumber(prompt) {
  const candidates = [prompt.prompt_id, prompt.id, prompt.prompt_title, prompt.short_desc];
  for (const value of candidates) {
    const match = String(value || "").match(/\d+/);
    if (match) return Number.parseInt(match[0], 10);
  }
  return Number.NaN;
}

function formatPromptTitle(prompt) {
  const id = String(prompt.display_id || "").trim();
  if (!id) return prompt.prompt_title;
  const title = String(prompt.prompt_title || "").trim();
  if (title.startsWith(`${id}.`) || title.startsWith(`${id} `)) return title;
  return `${id}. ${title}`;
}

function getSelectedPrompt() {
  return state.rows.find((row) => row.prompt_id === state.selectedPromptId);
}

function render() {
  renderShellStates();
  renderCourses();
  renderSections();
  renderPrompts();
  renderDetail();
  setSidebar(state.sidebarOpen);
}

function renderShellStates() {
  els.loadingState.classList.toggle("is-hidden", !state.loading);
  els.errorState.classList.toggle("is-hidden", !state.error);
  if (els.errorMessage) {
    els.errorMessage.textContent = state.errorMessage || "구글시트 공유 설정과 탭 주소를 확인해 주세요.";
  }
}

function renderCourses() {
  const courses = getCourses();
  els.courseSelect.innerHTML = "";

  if (!courses.length) {
    els.courseSelect.append(new Option("과정 없음", ""));
    els.courseSelect.title = "과정 없음";
    els.courseSelect.disabled = true;
    return;
  }

  els.courseSelect.disabled = false;
  courses.forEach((course) => {
    const option = new Option(course, course, false, course === state.selectedCourse);
    option.title = course;
    els.courseSelect.append(option);
  });
}

function renderSections() {
  const sections = getSectionsForCourse(state.selectedCourse);
  if (els.courseMenuTitle) {
    els.courseMenuTitle.textContent = state.selectedCourse || "과정 메뉴";
  }
  els.courseSelect.title = state.selectedCourse || "과정명 선택";
  els.sectionList.innerHTML = "";

  sections.forEach((section) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `section-button${isPracticeCategory(section.name) ? " is-practice-category" : ""}${section.name === state.selectedSection ? " is-active" : ""}`;
    button.innerHTML = `<span>${escapeHtml(section.label || section.name)}</span>`;
    button.addEventListener("click", () => {
      state.selectedSection = section.name;
      state.query = "";
      els.searchInput.value = "";
      state.selectedPromptId = getFilteredPrompts()[0]?.prompt_id || "";
      setSidebar(false);
      updateHash();
      render();
    });
    els.sectionList.append(button);
  });
}


function renderPrompts() {
  const prompts = getFilteredPrompts();
  const hasRows = state.rows.length > 0;
  const isEmpty = !state.loading && !state.error && (!hasRows || prompts.length === 0);

  els.promptList.innerHTML = "";
  els.promptList.classList.toggle("is-hidden", state.loading || state.error || isEmpty);
  els.emptyState.classList.toggle("is-hidden", !isEmpty);
  els.courseKicker.textContent = state.selectedCourse || "과정";
  const sectionLabel = getSectionDisplayName(state.selectedSection) || "프롬프트";
  els.sectionTitle.textContent = state.query ? "검색 결과" : sectionLabel;
  els.resultCount.textContent = `${prompts.length}개`;
  els.emptyState.querySelector("p").textContent = hasRows
    ? "검색어를 바꾸거나 다른 카테고리를 선택해 보세요."
    : "표시할 프롬프트가 아직 없습니다.";

  prompts.forEach((prompt) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `prompt-card${prompt.prompt_id === state.selectedPromptId ? " is-active" : ""}`;
    card.innerHTML = `
      <div class="card-top">
        <div>
          <h3>${escapeHtml(prompt.prompt_title || "제목 없는 프롬프트")}</h3>
          ${prompt.short_desc ? `<p>${escapeHtml(prompt.short_desc)}</p>` : ""}
        </div>
        ${isRepresentative(prompt) ? `<span class="badge">대표 실습</span>` : ""}
      </div>
      ${renderTagMarkup([prompt.tool, prompt.ratio, prompt.level])}
    `;
    card.addEventListener("click", () => {
      state.selectedPromptId = prompt.prompt_id;
      updateHash();
      render();
      els.detailPanel.classList.add("is-open");
      els.detailPanel.setAttribute("aria-hidden", "false");
      if (window.matchMedia("(max-width: 760px)").matches) {
        els.mobileBackdrop.classList.add("is-visible");
      }
    });
    els.promptList.append(card);
  });
}

function renderDetail() {
  const prompt = getSelectedPrompt();
  const hasPrompt = Boolean(prompt);

  els.detailEmpty.classList.toggle("is-hidden", hasPrompt);
  els.detailContent.classList.toggle("is-hidden", !hasPrompt);
  els.detailPanel.setAttribute("aria-hidden", String(!hasPrompt));

  if (!prompt) return;

  els.detailTitle.textContent = formatPromptTitle(prompt);
  const promptMeta = [prompt.display_id, prompt.input_place].filter(Boolean);
  els.detailDesc.innerHTML = promptMeta.length
    ? `<div class="detail-meta-values">${promptMeta.map((value) => `<span>${escapeHtml(value)}</span>`).join("")}</div>`
    : escapeHtml(prompt.short_desc || "입력 위치 정보가 없습니다.");
  els.detailTags.innerHTML = "";
  [prompt.tool, prompt.ratio, prompt.level, prompt.use_type].filter(Boolean).forEach((tag) => {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = tag;
    els.detailTags.append(span);
  });
  els.detailRepresentative.classList.toggle("is-hidden", !isRepresentative(prompt));
  const promptBody = prompt.copy_text || prompt.prompt_ko || "복사할 텍스트가 비어 있습니다.";
  els.detailPrompt.textContent = promptBody;
}
function bindSidebarResizer() {
  if (!els.sidebarResizer) return;

  const savedWidth = Number.parseInt(localStorage.getItem("dreamsapi-sidebar-width"), 10);
  if (Number.isFinite(savedWidth)) {
    setSidebarWidth(savedWidth);
  }

  let isDragging = false;

  const stopDrag = () => {
    isDragging = false;
    document.body.classList.remove("is-resizing");
  };

  els.sidebarResizer.addEventListener("pointerdown", (event) => {
    if (window.matchMedia("(max-width: 1100px)").matches) return;
    isDragging = true;
    document.body.classList.add("is-resizing");
    els.sidebarResizer.setPointerCapture(event.pointerId);
  });

  els.sidebarResizer.addEventListener("pointermove", (event) => {
    if (!isDragging) return;
    setSidebarWidth(event.clientX);
  });

  els.sidebarResizer.addEventListener("pointerup", (event) => {
    if (els.sidebarResizer.hasPointerCapture(event.pointerId)) {
      els.sidebarResizer.releasePointerCapture(event.pointerId);
    }
    stopDrag();
  });

  els.sidebarResizer.addEventListener("pointercancel", stopDrag);

  els.sidebarResizer.addEventListener("keydown", (event) => {
    const current = Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width"), 10) || 360;
    if (event.key === "ArrowLeft") {
      setSidebarWidth(current - 24);
      event.preventDefault();
    }
    if (event.key === "ArrowRight") {
      setSidebarWidth(current + 24);
      event.preventDefault();
    }
  });
}

function setSidebarWidth(width) {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1440;
  const maxWidth = Math.min(560, Math.max(360, viewportWidth - 760));
  const clamped = Math.min(Math.max(width, 300), maxWidth);
  document.documentElement.style.setProperty("--sidebar-width", `${clamped}px`);
  localStorage.setItem("dreamsapi-sidebar-width", String(clamped));
}
function bindPanelResizer() {
  if (!els.panelResizer) return;

  const savedWidth = Number.parseInt(localStorage.getItem("dreamsapi-detail-width"), 10);
  if (Number.isFinite(savedWidth)) {
    setDetailWidth(savedWidth);
  }

  let isDragging = false;

  const stopDrag = () => {
    isDragging = false;
    document.body.classList.remove("is-resizing");
  };

  els.panelResizer.addEventListener("pointerdown", (event) => {
    if (window.matchMedia("(max-width: 1100px)").matches) return;
    isDragging = true;
    document.body.classList.add("is-resizing");
    els.panelResizer.setPointerCapture(event.pointerId);
  });

  els.panelResizer.addEventListener("pointermove", (event) => {
    if (!isDragging) return;
    const width = window.innerWidth - event.clientX;
    setDetailWidth(width);
  });

  els.panelResizer.addEventListener("pointerup", (event) => {
    if (els.panelResizer.hasPointerCapture(event.pointerId)) {
      els.panelResizer.releasePointerCapture(event.pointerId);
    }
    stopDrag();
  });

  els.panelResizer.addEventListener("pointercancel", stopDrag);

  els.panelResizer.addEventListener("keydown", (event) => {
    const current = Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("--detail-width"), 10) || 420;
    if (event.key === "ArrowLeft") {
      setDetailWidth(current + 32);
      event.preventDefault();
    }
    if (event.key === "ArrowRight") {
      setDetailWidth(current - 32);
      event.preventDefault();
    }
  });
}

function setDetailWidth(width) {
  const maxWidth = Math.max(320, Math.min(760, window.innerWidth - 720));
  const clamped = Math.min(Math.max(width, 320), maxWidth);
  document.documentElement.style.setProperty("--detail-width", `${clamped}px`);
  localStorage.setItem("dreamsapi-detail-width", String(clamped));
}

function renderTagMarkup(tags) {
  const cleanTags = tags.filter(Boolean);
  if (!cleanTags.length) return "";
  return `<div class="tag-row">${cleanTags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>`;
}

function isRepresentative(prompt) {
  return ["true", "1", "yes", "y", "대표", "대표 실습"].includes(prompt.is_representative.toLocaleLowerCase("ko"));
}

function setSidebar(open) {
  state.sidebarOpen = open;
  els.sectionSidebar.classList.toggle("is-open", open);
  els.mobileBackdrop.classList.toggle("is-visible", open || els.detailPanel.classList.contains("is-open"));
}

function closeDetailPanel() {
  els.detailPanel.classList.remove("is-open");
  els.mobileBackdrop.classList.toggle("is-visible", state.sidebarOpen);
}

async function copySelectedPrompt() {
  const prompt = getSelectedPrompt();
  if (!prompt) return;

  try {
    await navigator.clipboard.writeText(prompt.copy_text || prompt.prompt_ko);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = prompt.copy_text || prompt.prompt_ko;
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  showToast();
}

function showToast() {
  els.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.remove("is-visible");
  }, 2000);
}

function applyInitialTheme() {
  const saved = localStorage.getItem("dreamsapi-theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(saved || (prefersDark ? "dark" : "light"));
}

function setTheme(theme) {
  const isDark = theme === "dark";
  els.body.classList.toggle("dark", isDark);
  els.themeToggle.setAttribute("aria-pressed", String(isDark));
  els.themeToggle.setAttribute("aria-label", isDark ? "다크 모드 끄기" : "다크 모드 켜기");
  localStorage.setItem("dreamsapi-theme", theme);
}

function readHashState() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  state.selectedCourse = params.get("course") || state.selectedCourse;
  state.selectedSection = params.get("category") || params.get("section") || state.selectedSection;
  state.selectedPromptId = params.get("prompt") || state.selectedPromptId;
}

function updateHash() {
  const params = new URLSearchParams();
  if (state.selectedCourse) params.set("course", state.selectedCourse);
  if (state.selectedSection) params.set("category", state.selectedSection);
  if (state.selectedPromptId) params.set("prompt", state.selectedPromptId);
  history.replaceState(null, "", `#${params.toString()}`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}





















































