/**
 * posit-listing-filters.js
 *
 * A reusable control layer for Quarto listing pages, styled after
 * opensource.posit.co/blog's card layout and checkbox topic filters.
 * Originally built for blog.qmd; generalized so any current or future
 * listing page (research.qmd, seminars.qmd, ...) gets the same design
 * for free just by using the same HTML shell (see includes/posit-listing-*).
 *
 * Fully self-scoped per shell: everything is looked up relative to each
 * `.posit-listing-shell` element found on the page (via querySelector /
 * closest), not via document-wide getElementById. That means this module
 * works correctly even if a page ever had more than one listing shell on
 * it, and — just as importantly — a page can freely reuse the same
 * control markup/IDs as every other listing page without them colliding,
 * since IDs only need to be unique within a single rendered document.
 *
 * Intentionally does NOT touch Quarto's own filter-ui / sort-ui /
 * category-sidebar systems — those are turned off in each listing page's
 * `listing:` config (filter-ui: false, sort-ui: false) specifically so
 * this script is the only thing manipulating card visibility and order.
 * Running two independent visibility-control systems on the same cards
 * at once is a recipe for state bugs (one shows a card the other just
 * hid), so this file owns that responsibility completely.
 *
 * Works entirely off data attributes Quarto already puts on each
 * `.quarto-post` card when a listing's `fields:` includes `categories`
 * (data-categories, base64-encoded + URL-encoded, comma separated) and
 * the sort attributes Quarto already computes (data-listing-date-sort).
 * No separate data file or build step — reads the real rendered DOM, so
 * it can never drift out of sync with the actual content.
 *
 * Multi-select topic filtering is OR-based: checking two topics shows
 * content matching *either*, not only content matching both.
 */
(function () {
  "use strict";

  function decodeCategoryList(raw) {
    if (!raw) return [];
    let decoded;
    try {
      // Quarto encodes this as: URI-encode the comma-joined category list,
      // then base64-encode that. So the correct inverse is base64-decode
      // first, then a single decodeURIComponent over the whole string —
      // NOT per-segment, and no `escape()` wrapper (that would actually
      // double-encode the literal "%" characters already present after
      // atob() and break decoding).
      decoded = decodeURIComponent(atob(raw));
    } catch (e) {
      return [];
    }
    return decoded.split(",").filter(Boolean);
  }

  function initShell(shell) {
    const listingResults = shell.querySelector(".quarto-listing");
    if (!listingResults) return;

    const cards = Array.from(listingResults.querySelectorAll(".quarto-post"));
    if (cards.length === 0) return;

    cards.forEach((card) => {
      card._categories = decodeCategoryList(card.getAttribute("data-categories"));
      const titleEl = card.querySelector(".listing-title");
      const descEl = card.querySelector(".listing-description");
      card._searchText = (
        (titleEl ? titleEl.textContent : "") +
        " " +
        (descEl ? descEl.textContent : "")
      ).toLowerCase();
      card._dateSort = Number(card.getAttribute("data-listing-date-sort")) || 0;
      card._titleText = titleEl ? titleEl.textContent.trim() : "";
    });

    // ---- Build the Topics checkbox list from real card data ----
    const topicCounts = new Map();
    cards.forEach((card) => {
      card._categories.forEach((cat) => {
        topicCounts.set(cat, (topicCounts.get(cat) || 0) + 1);
      });
    });

    const topicsList = shell.querySelector(".posit-topics-list");
    const sortedTopics = Array.from(topicCounts.keys()).sort((a, b) =>
      a.localeCompare(b)
    );

    if (topicsList) {
      sortedTopics.forEach((topic) => {
        const id =
          "topic-" +
          Math.random().toString(36).slice(2, 7) +
          "-" +
          topic.replace(/[^a-z0-9-]/gi, "-");
        const row = document.createElement("label");
        row.className = "posit-checkbox-row";
        row.setAttribute("for", id);
        row.innerHTML =
          '<input type="checkbox" id="' +
          id +
          '" value="' +
          topic.replace(/"/g, "&quot;") +
          '"> ' +
          '<span class="posit-checkbox-label">' +
          topic +
          "</span>" +
          '<span class="posit-checkbox-count">' +
          topicCounts.get(topic) +
          "</span>";
        topicsList.appendChild(row);
      });
    }

    const checkboxes = topicsList
      ? Array.from(topicsList.querySelectorAll('input[type="checkbox"]'))
      : [];
    const searchInput = shell.querySelector(".posit-search-input");
    const sortSelect = shell.querySelector(".posit-sort-select");
    const clearBtn = shell.querySelector(".posit-clear-filters");
    const clearBtn2 = shell.querySelector(".posit-no-results-clear");
    const resultsCount = shell.querySelector(".posit-results-count");
    const noResultsEl = shell.querySelector(".posit-no-results");
    const listContainer = listingResults.querySelector(".list");

    function activeTopics() {
      return checkboxes.filter((c) => c.checked).map((c) => c.value);
    }

    function applyFiltersAndSort() {
      const query = searchInput ? (searchInput.value || "").trim().toLowerCase() : "";
      const topics = activeTopics();

      let visibleCount = 0;
      cards.forEach((card) => {
        const matchesTopic =
          topics.length === 0 ||
          card._categories.some((c) => topics.includes(c));
        const matchesSearch = !query || card._searchText.includes(query);
        const visible = matchesTopic && matchesSearch;
        card.style.display = visible ? "" : "none";
        if (visible) visibleCount++;
      });

      // Sort: reorder the actual DOM nodes among the currently-visible set.
      // (Sorting all nodes, visible or not, keeps this simple and cheap —
      // there are at most a few dozen items on any listing on this site.)
      const sortMode = sortSelect ? sortSelect.value : "date-desc";
      const sorted = cards.slice().sort((a, b) => {
        switch (sortMode) {
          case "date-asc":
            return a._dateSort - b._dateSort;
          case "title-asc":
            return a._titleText.localeCompare(b._titleText);
          case "title-desc":
            return b._titleText.localeCompare(a._titleText);
          case "date-desc":
          default:
            return b._dateSort - a._dateSort;
        }
      });
      if (listContainer) {
        sorted.forEach((card) => listContainer.appendChild(card));
      }

      if (resultsCount) {
        resultsCount.textContent =
          visibleCount === 1 ? "1 item" : visibleCount + " items";
      }
      if (noResultsEl) {
        noResultsEl.style.display = visibleCount === 0 ? "" : "none";
      }
    }

    checkboxes.forEach((cb) => cb.addEventListener("change", applyFiltersAndSort));
    if (searchInput) searchInput.addEventListener("input", applyFiltersAndSort);
    if (sortSelect) sortSelect.addEventListener("change", applyFiltersAndSort);

    function clearAll() {
      checkboxes.forEach((cb) => (cb.checked = false));
      if (searchInput) searchInput.value = "";
      if (sortSelect) sortSelect.value = "date-desc";
      applyFiltersAndSort();
    }
    if (clearBtn) clearBtn.addEventListener("click", clearAll);
    if (clearBtn2) clearBtn2.addEventListener("click", clearAll);

    applyFiltersAndSort();
  }

  function init() {
    document.querySelectorAll(".posit-listing-shell").forEach(initShell);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
