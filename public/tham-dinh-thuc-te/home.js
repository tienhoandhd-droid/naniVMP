(() => {
  "use strict";

  const forms = [
    ["steam", "Hơi tinh khiết", "BM01", "Khí không ngưng", "", "./steam.html?form=bm01"],
    ["steam", "Hơi tinh khiết", "BM02", "Chất lượng nước ngưng", "hóa lý vi sinh", "./steam.html?form=bm02"],
    ["steam", "Hơi tinh khiết", "BM03", "Độ khô", "", "./steam.html?form=bm03"],
    ["steam", "Hơi tinh khiết", "BM04", "Quá nhiệt", "", "./steam.html?form=bm04"],
    ["steam", "Hơi tinh khiết", "BM05", "Tổng hợp", "", "./steam.html?form=bm05"],
    ["air", "Khí nén", "BM01", "Tiểu phân", "", "./gas.html?system=air&form=bm01"],
    ["air", "Khí nén", "BM02", "Điểm sương", "", "./gas.html?system=air&form=bm02"],
    ["air", "Khí nén", "BM03", "Vết dầu", "", "./gas.html?system=air&form=bm03"],
    ["air", "Khí nén", "BM04", "Vi sinh", "", "./gas.html?system=air&form=bm04"],
    ["air", "Khí nén", "BM05", "Tổng hợp", "", "./gas.html?system=air&form=bm05"],
    ["air", "Khí nén", "BM06", "Xu hướng", "", "./gas.html?system=air&form=bm06"],
    ["nitrogen", "Khí nitơ", "BM01", "Tiểu phân", "", "./gas.html?system=nitrogen&form=bm01"],
    ["nitrogen", "Khí nitơ", "BM02", "Điểm sương", "", "./gas.html?system=nitrogen&form=bm02"],
    ["nitrogen", "Khí nitơ", "BM03", "Vết dầu", "", "./gas.html?system=nitrogen&form=bm03"],
    ["nitrogen", "Khí nitơ", "BM04", "Vi sinh", "", "./gas.html?system=nitrogen&form=bm04"],
    ["nitrogen", "Khí nitơ", "BM05", "Độ tinh khiết", "", "./gas.html?system=nitrogen&form=bm05"],
    ["nitrogen", "Khí nitơ", "BM06", "Tổng hợp", "", "./gas.html?system=nitrogen&form=bm06"],
    ["nitrogen", "Khí nitơ", "BM07", "Xu hướng", "", "./gas.html?system=nitrogen&form=bm07"],
  ].map(([systemKey, system, code, title, aliases, href]) => ({ systemKey, system, code, title, aliases, href }));

  const searchInput = document.querySelector("#form-search");
  const results = document.querySelector("#form-results");
  const resultCount = document.querySelector("#form-count");
  const emptyResults = document.querySelector("#empty-results");
  const filterButtons = [...document.querySelectorAll("[data-system-filter]")];
  let activeSystem = "all";
  let authorized = new Set();

  function normalize(value) {
    return value.toLocaleLowerCase("vi").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
  }

  function matchesQuery(form, query) {
    const text = normalize([form.system, form.code, form.title, form.aliases].join(" "));
    return query.split(/\s+/).filter(Boolean).every(token => text.includes(token));
  }

  function renderResults() {
    const query = normalize(searchInput.value).trim();
    const pool = forms.filter(form => authorized.has(form.systemKey) && (activeSystem === "all" || form.systemKey === activeSystem));
    const phrases = query.includes(" ") ? pool.filter(form => normalize([form.title, form.aliases].join(" ")).includes(query)) : [];
    const visibleForms = phrases.length ? phrases : pool.filter(form => matchesQuery(form, query));
    results.replaceChildren();
    visibleForms.forEach((form) => {
      const link = document.createElement("a");
      link.className = "form-result";
      link.href = form.href;
      link.innerHTML = `<span><small>${form.code} · ${form.system}</small><strong>${form.title}</strong></span><span class="form-code" aria-hidden="true">Mở →</span>`;
      results.append(link);
    });
    resultCount.textContent = `${visibleForms.length} biểu mẫu`;
    emptyResults.hidden = visibleForms.length !== 0;
  }

  function selectSystem(system) {
    activeSystem = system;
    filterButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.systemFilter === activeSystem)));
    renderResults();
  }

  async function loadAccess() {
    const backend=window.CPC1Backend;
    if (!backend?.getSession) return renderResults();
    try {
      const session=await backend.getSession();
      if (!session) return;
      authorized=new Set(['steam','air','nitrogen'].filter(system=>backend.permissionsFor(system).can_view_current));
      filterButtons.forEach(button=>{const allowed=button.dataset.systemFilter==='all'||authorized.has(button.dataset.systemFilter);button.hidden=!allowed;button.disabled=!allowed;});
      if (activeSystem!=='all'&&!authorized.has(activeSystem)) activeSystem='all';
      renderResults();
    } catch { authorized.clear();renderResults(); }
  }
  searchInput.addEventListener("input", renderResults);
  filterButtons.forEach((button) => button.addEventListener("click", () => selectSystem(button.dataset.systemFilter)));
  window.addEventListener('DOMContentLoaded',()=>void loadAccess(),{once:true});
  window.addEventListener('cpc1:permissions-refreshed',()=>void loadAccess());
})();
