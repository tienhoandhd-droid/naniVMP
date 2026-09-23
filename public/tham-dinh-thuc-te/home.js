(() => {
  "use strict";

  const forms = [
    {
      system: "Hơi tinh khiết",
      code: "BM01",
      title: "Khí không ngưng",
      href: "./steam.html?form=bm01",
    },
    {
      system: "Hơi tinh khiết",
      code: "BM02",
      title: "Chất lượng nước ngưng",
      aliases: "hóa lý vi sinh",
      href: "./steam.html?form=bm02",
    },
    {
      system: "Hơi tinh khiết",
      code: "BM03",
      title: "Độ khô",
      href: "./steam.html?form=bm03",
    },
    {
      system: "Hơi tinh khiết",
      code: "BM04",
      title: "Quá nhiệt",
      href: "./steam.html?form=bm04",
    },
    {
      system: "Hơi tinh khiết",
      code: "BM05",
      title: "Tổng hợp",
      href: "./steam.html?form=bm05",
    },
    {
      system: "Khí nén",
      code: "BM01",
      title: "Tiểu phân",
      href: "./gas.html?system=air&form=bm01",
    },
    {
      system: "Khí nén",
      code: "BM02",
      title: "Điểm sương",
      href: "./gas.html?system=air&form=bm02",
    },
    {
      system: "Khí nén",
      code: "BM03",
      title: "Vết dầu",
      href: "./gas.html?system=air&form=bm03",
    },
    {
      system: "Khí nén",
      code: "BM04",
      title: "Vi sinh",
      href: "./gas.html?system=air&form=bm04",
    },
    {
      system: "Khí nén",
      code: "BM05",
      title: "Tổng hợp",
      href: "./gas.html?system=air&form=bm05",
    },
    {
      system: "Khí nén",
      code: "BM06",
      title: "Xu hướng",
      href: "./gas.html?system=air&form=bm06",
    },
    {
      system: "Khí nitơ",
      code: "BM01",
      title: "Tiểu phân",
      href: "./gas.html?system=nitrogen&form=bm01",
    },
    {
      system: "Khí nitơ",
      code: "BM02",
      title: "Điểm sương",
      href: "./gas.html?system=nitrogen&form=bm02",
    },
    {
      system: "Khí nitơ",
      code: "BM03",
      title: "Vết dầu",
      href: "./gas.html?system=nitrogen&form=bm03",
    },
    {
      system: "Khí nitơ",
      code: "BM04",
      title: "Vi sinh",
      href: "./gas.html?system=nitrogen&form=bm04",
    },
    {
      system: "Khí nitơ",
      code: "BM05",
      title: "Độ tinh khiết",
      href: "./gas.html?system=nitrogen&form=bm05",
    },
    {
      system: "Khí nitơ",
      code: "BM06",
      title: "Tổng hợp",
      href: "./gas.html?system=nitrogen&form=bm06",
    },
    {
      system: "Khí nitơ",
      code: "BM07",
      title: "Xu hướng",
      href: "./gas.html?system=nitrogen&form=bm07",
    },
  ];
  const searchInput = document.querySelector("#form-search");
  const results = document.querySelector("#form-results");
  const resultCount = document.querySelector("#form-count");
  const emptyResults = document.querySelector("#empty-results");
  const sectionLinks = [...document.querySelectorAll(".primary-nav a")];

  function normalize(value) {
    return value
      .toLocaleLowerCase("vi")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d");
  }

  function matchesTokens(form, normalizedQuery) {
    const searchText = normalize(
      [form.system, form.code, form.title, form.aliases || ""].join(" "),
    );
    return normalizedQuery
      .split(/\s+/)
      .filter(Boolean)
      .every((token) => searchText.includes(token));
  }

  function renderResults(query = "") {
    const normalizedQuery = normalize(query).trim();
    const phraseMatches = normalizedQuery.includes(" ")
      ? forms.filter((form) =>
          normalize([form.title, form.aliases || ""].join(" ")).includes(
            normalizedQuery,
          ),
        )
      : [];
    const visibleForms = phraseMatches.length
      ? phraseMatches
      : forms.filter((form) => matchesTokens(form, normalizedQuery));
    results.replaceChildren();
    visibleForms.forEach((form) => {
      const link = document.createElement("a");
      link.className = "form-result";
      link.href = form.href;
      link.innerHTML = `<span class="form-code">${form.code}</span><span><small>${form.system}</small><strong>${form.title}</strong></span><span class="result-arrow" aria-hidden="true">→</span>`;
      results.append(link);
    });
    resultCount.textContent = `${visibleForms.length} biểu mẫu`;
    emptyResults.hidden = visibleForms.length !== 0;
  }

  function updateCurrentSection() {
    const currentHash = window.location.hash || "#tong-quan";
    sectionLinks.forEach((link) => {
      if (link.getAttribute("href") === currentHash)
        link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  searchInput.addEventListener("input", () => renderResults(searchInput.value));
  sectionLinks.forEach((link) =>
    link.addEventListener("click", () =>
      window.setTimeout(updateCurrentSection, 0),
    ),
  );
  window.addEventListener("hashchange", updateCurrentSection);
  renderResults();
  updateCurrentSection();
})();
