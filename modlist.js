/* ========================= */
/* URLs: update gid if your sheets change */
/* ========================= */
const SPREADSHEET_BASE =
  "https://docs.google.com/spreadsheets/d/1vTQ2HqNzLKBHc3mqm_wh2FRLqRwsy4uO2RYPOwjRM0w/gviz/tq?tqx=out:csv";

// existing modlist (mods from the modlist sheet)
const MODLIST_CSV_URL = `${SPREADSHEET_BASE}&gid=1304496736`;

// Items sheet (item rows with Subcategory column). GID seen in screenshots: 618085249
const ITEMS_CSV_URL = `${SPREADSHEET_BASE}&gid=618085249`;

// Item Categories sheet (grid mapping Subcategory -> Category). GID seen in screenshots: 1283763631
const CATEGORIES_CSV_URL = `${SPREADSHEET_BASE}&gid=1283763631`;
const ITEM_SHEET_NAMES = [
  "Supplies",
  "Workshops",
  "Blueprints",
  "Utilities",
  "Entertainment",
  "Structures",
  "Buildables",
  "Clothing",
  "Consumables",
  "Melee Weapons",
  "Guns",
  "Attachments",
  "Ammunitions",
  "Throwables",
  "Skins"
];
const ITEM_CATEGORY_ALIASES = {
  Ammunitions: "Ammunition"
};
const BROWSER_DATASETS = {
  items: {
    name: "Items",
    sheets: ITEM_SHEET_NAMES,
    categoriesUrl: CATEGORIES_CSV_URL,
    category: "Items"
  },
  vehicles: {
    name: "Vehicles",
    sheets: ["Vehicles"],
    categoriesUrl: `${SPREADSHEET_BASE}&sheet=Vehicle%20Categories`,
    category: "Vehicles"
  },
  animals: {
    name: "Animals",
    sheets: ["Animals"],
    categoriesUrl: `${SPREADSHEET_BASE}&sheet=Animals%20Categories`,
    category: "Animals"
  }
};

const modList = document.querySelector("[data-mod-list]");
const modlistStatus = document.querySelector("[data-modlist-status]");
const categoriesContainer = document.querySelector("[data-categories-grid]");
const itemCategoriesSection = document.querySelector("[data-item-categories]");
const itemsStatus = document.querySelector("[data-items-status]");
const itemPreview = document.querySelector("[data-item-preview]");
const itemPreviewStatus = document.querySelector("[data-item-preview-status]");
const itemSearch = document.querySelector("[data-item-search]");
const itemSearchResults = document.querySelector("[data-item-search-results]");
const categoryPage = document.querySelector("[data-category-page]");
const categoryPageTitle = document.querySelector("[data-category-page-title]");
const categoryPageStatus = document.querySelector("[data-category-page-status]");
const subcategoryPage = document.querySelector("[data-subcategory-page]");
const subcategoryPageTitle = document.querySelector("[data-subcategory-page-title]");
const subcategoryPageStatus = document.querySelector("[data-subcategory-page-status]");
const subcategoryResults = document.querySelector("[data-subcategory-results]");
const categoryBack = document.querySelector("[data-category-back]");
let allItems = [];

function normalizeCategoryName(categoryName) {
  const trimmedName = (categoryName || "").trim();
  return ITEM_CATEGORY_ALIASES[trimmedName] || trimmedName;
}

function getDataset() {
  const type = new URLSearchParams(window.location.search).get("type");
  if (type && BROWSER_DATASETS[type]) return BROWSER_DATASETS[type];
  if (document.body.dataset.browserKind && BROWSER_DATASETS[document.body.dataset.browserKind]) {
    return BROWSER_DATASETS[document.body.dataset.browserKind];
  }
  return BROWSER_DATASETS.items;
}


/* ========================= */
/* CSV PARSER (robust enough for Sheets CSV) */
/* ========================= */
function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i++;
      }
      row.push(field);
      if (row.some(cell => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  function renderRecentItems(items) {
    if (!itemPreview) return;
    const recentItems = [...items]
      .sort((a, b) => parseSheetDate(b.lastUpdated) - parseSheetDate(a.lastUpdated))
      .slice(0, 5);
    itemPreview.replaceChildren(...recentItems.map(item => {
      const entry = createItemEntry(item);
      entry.classList.add("item-preview-entry");
      return entry;
    }));
    if (itemPreviewStatus) itemPreviewStatus.hidden = true;
  }

  if (field || row.length) {
    row.push(field);
    if (row.some(cell => cell.trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}


/* ========================= */
/* IMAGE URL extractor (supports =IMAGE() or direct URLs) */
/* ========================= */
function getImageUrl(imageValue) {
  const value = (imageValue || "").trim();
  if (!value) return "";
  const imageFormulaMatch = value.match(/=IMAGE\(\s*["']([^"']+)["']/i);
  if (imageFormulaMatch) return imageFormulaMatch[1];
  if (/^https?:\/\//i.test(value)) return value;
  return "";
}


/* ========================= */
/* --- MODS (existing behavior) --- */
/* normalize/render code preserved from original + unchanged behavior */
/* ========================= */
function normalizeMod(row) {
  return {
    image: getImageUrl(row[0] || ""),
    name: (row[1] || "").trim(),
    id: (row[2] || "").trim(),
    authors: (row[3] || "").trim(),
    description: (row[4] || "").trim()
  };
}

function getMods(csvText) {
  const rows = parseCsv(csvText);

  return rows
    .slice(2)
    .map(normalizeMod)
    .filter(mod => mod.name)
    .sort((a, b) => {
      const aVanilla = a.name.toLowerCase() === "vanilla";
      const bVanilla = b.name.toLowerCase() === "vanilla";
      if (aVanilla && !bVanilla) return -1;
      if (!aVanilla && bVanilla) return 1;
      return a.name.localeCompare(b.name);
    });
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

function renderMod(mod) {
  const article = document.createElement("article");
  article.className = "mod-card";

  const imageWrap = document.createElement("div");
  imageWrap.className = "mod-image";

  if (mod.image) {
    const image = document.createElement("img");
    image.src = mod.image;
    image.alt = `${mod.name} preview`;
    image.loading = "lazy";
    image.onerror = () => {
      imageWrap.classList.add("mod-image-empty");
      image.remove();
    };
    imageWrap.append(image);
  } else {
    imageWrap.classList.add("mod-image-empty");
  }

  const details = document.createElement("div");
  details.className = "mod-details";

  const title = document.createElement("h3");
  title.textContent = mod.id ? `${mod.name} - ${mod.id}` : mod.name;
  details.append(title);

  const description = document.createElement("p");
  description.className = "mod-description";
  description.textContent = mod.description || "No description provided.";
  details.append(description);

  if (mod.authors) {
    const authors = document.createElement("p");
    authors.className = "mod-authors";
    authors.textContent = `Author(s): ${mod.authors}`;
    details.append(authors);
  }

  article.append(imageWrap, details);
  return article;
}

function renderMods(mods) {
  if (!modList) return;
  modList.replaceChildren(...mods.map(renderMod));
  if (modlistStatus) modlistStatus.hidden = true;
}

async function loadMods() {
  try {
    if (!modlistStatus) return;
    modlistStatus.hidden = false;
    modlistStatus.textContent = "Loading mods from the Modlist...";

    const response = await fetch(MODLIST_CSV_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Google Sheets request failed: ${response.status}`);
    const csvText = await response.text();

    const mods = getMods(csvText);
    if (!mods.length) throw new Error("No mods were found.");
    renderMods(mods);
  } catch (error) {
    console.error("Modlist loading error:", error);
    if (modlistStatus) {
      modlistStatus.hidden = false;
      modlistStatus.textContent = "Unable to load mods from the Modlist right now.";
      modlistStatus.classList.add("modlist-status--error");
    }
  }
}


/* ========================= */
/* --- ITEMS / CATEGORIES --- */
/* Fetch Item rows and the Category grid, map subcategory -> category, then render Category -> Subcategory -> items */
/* ========================= */

function buildSubcategoryToCategoryMap(categoriesRows) {
  // The sheet has a title row before the category headers. Find the first
  // row with more than one populated cell so both layouts remain supported.
  const map = {};
  const categories = {};
  if (!categoriesRows || !categoriesRows.length) return { map, categories };

  const headerIndex = categoriesRows.findIndex(row =>
    row.filter(cell => (cell || "").trim()).length > 1
  );
  if (headerIndex < 0) return { map, categories };

  const headerRow = categoriesRows[headerIndex];
  for (let col = 0; col < headerRow.length; col++) {
    const categoryName = (headerRow[col] || "").trim();
    if (!categoryName) continue;
    categories[categoryName] = [];
    for (let r = headerIndex + 1; r < categoriesRows.length; r++) {
      const cell = (categoriesRows[r][col] || "").trim();
      if (!cell) continue;
      map[cell] = categoryName;
      categories[categoryName].push(cell);
    }

  }

  return { map, categories };
}

function buildSingleCategoryMap(categoriesRows, categoryName, headerName) {
  const map = {};
  const categories = { [categoryName]: [] };
  const headerIndex = categoriesRows.findIndex(row =>
    row.some(cell => (cell || "").trim().toLowerCase() === headerName.toLowerCase())
  );
  if (headerIndex < 0) return { map, categories };

  const headerRow = categoriesRows[headerIndex];
  const column = headerRow.findIndex(cell =>
    (cell || "").trim().toLowerCase() === headerName.toLowerCase()
  );
  for (let rowIndex = headerIndex + 1; rowIndex < categoriesRows.length; rowIndex++) {
    const subcategory = (categoriesRows[rowIndex][column] || "").trim();
    if (!subcategory) continue;
    map[subcategory] = categoryName;
    categories[categoryName].push(subcategory);
  }
  return { map, categories };
}

function normalizeItem(row, indices) {
  // indices: mapping header name -> column index
  const icon = getImageUrl(row[indices.icon] || "");
  const id = (row[indices.id] || "").trim();
  const name = (row[indices.name] || "").trim();
  const description = (row[indices.description] || "").trim();
  const source = (row[indices.source] || "").trim();
  const subcategory = (row[indices.subcategory] || "").trim();
  const lastUpdated = (row[indices.lastUpdated] || "").trim();

  return { icon, id, name, description, source, subcategory, lastUpdated };
}

function indexHeaders(headerRow) {
  const indices = {
    name: -1,
    id: -1,
    subcategory: -1,
    icon: -1,
    description: -1,
    source: -1,
    lastUpdated: -1
  };
  for (let i = 0; i < headerRow.length; i++) {
    const h = (headerRow[i] || "").toLowerCase().trim();
    if (h === "name") indices.name = i;
    else if (h === "id") indices.id = i;
    else if (h === "subcategory") indices.subcategory = i;
    else if (h === "icon" || h === "image") indices.icon = i;
    else if (h === "description") indices.description = i;
    else if (h === "source") indices.source = i;
    else if (h === "last updated") indices.lastUpdated = i;
  }

  return indices;
}

function parseSheetDate(value) {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return 0;
  const [, month, day, year, hour, minute] = match;
  return new Date(
    2000 + Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute)
  ).getTime();
}

function getItemsFromCsv(csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) return [];
  const header = rows[0].map(c => (c || "").trim());
  const indices = indexHeaders(header);
  const hasExpectedHeaders = indices.name >= 0 && indices.id >= 0;
  if (!hasExpectedHeaders) {
    Object.assign(indices, {
      icon: 0,
      id: 1,
      name: 2,
      description: 3,
      source: 4,
      subcategory: 6,
      lastUpdated: 7
    });
  }
  const dataRows = rows.slice(1);
  const items = dataRows.map(r => normalizeItem(r, indices)).filter(i => i.name);
  return items;
}

function groupItemsByCategory(items, subcatToCat, categoryLayout) {
  // result: { categoryName: { subcategoryName: [items...] } }
  const groups = {};
  for (const [categoryName, subcategories] of Object.entries(categoryLayout)) {
    groups[categoryName] = {};
    for (const subcategory of subcategories) {
      groups[categoryName][subcategory] = [];
    }
  }

  for (const item of items) {
    const sub = item.subcategory.trim() || "Unsorted";
    const cat = subcatToCat[sub] || normalizeCategoryName(item.category) || "Uncategorized";
    if (!groups[cat]) groups[cat] = {};
    if (!groups[cat][sub]) groups[cat][sub] = [];
    groups[cat][sub].push(item);
  }
  return groups;
}

async function fetchAllCategoryItems() {
  const dataset = getDataset();
  const categorySheetUrls = dataset.sheets.map(sheetName =>
    `${SPREADSHEET_BASE}&sheet=${encodeURIComponent(sheetName)}`
  );
  const responses = await Promise.all(
    categorySheetUrls.map(url => fetch(url, { cache: "no-store" }))
  );
  const failedResponse = responses.find(response => !response.ok);
  if (failedResponse) {
    throw new Error(`An item category sheet request failed: ${failedResponse.status}`);
  }

  const csvTexts = await Promise.all(responses.map(response => response.text()));
  return csvTexts
    .flatMap((csvText, index) =>
      getItemsFromCsv(csvText).map(item => ({
        ...item,
        category: dataset.sheets[index]
      }))
    )
    .filter((item, index, allItems) =>
      allItems.findIndex(candidate =>
        candidate.id === item.id && candidate.name === item.name
      ) === index
    );
}

function createItemEntry(item) {
  const entry = document.createElement("li");
  entry.className = "subcategory-item";
  entry.title = item.description || item.name;

  if (item.icon) {
    const image = document.createElement("img");
    image.src = item.icon;
    image.alt = "";
    image.loading = "lazy";
    image.className = "item-icon";
    entry.append(image);
  } else {
    const fallback = document.createElement("span");
    fallback.className = "item-icon item-icon--fallback";
    fallback.textContent = item.name.charAt(0).toUpperCase();
    fallback.setAttribute("aria-hidden", "true");
    entry.append(fallback);
  }

  const details = document.createElement("span");
  details.className = "item-details";
  const name = document.createElement("span");
  name.className = "item-name";
  name.textContent = item.name;
  details.append(name);

  if (item.id) {
    const id = document.createElement("span");
    id.className = "item-id";
    id.textContent = `ID ${item.id}`;
    details.append(id);
  }

  entry.append(details);
  return entry;
}

function renderCategoriesGrid(groups, includeItems = false) {
  if (!categoriesContainer) return;
  categoriesContainer.innerHTML = "";

  const categoryNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));
  for (const catName of categoryNames) {
    const subNames = Object.keys(groups[catName]).sort((a, b) => a.localeCompare(b));
    const catBox = document.createElement("section");
    catBox.className = "category-box";

    const catHeader = document.createElement("div");
    catHeader.className = "category-header";
    const categoryCount = Object.values(groups[catName])
      .reduce((total, categoryItems) => total + categoryItems.length, 0);
    catHeader.append(
      createTextElement("h2", "category-title", catName),
      createTextElement("span", "category-count", `${categoryCount} items`)
    );
    catBox.append(catHeader);

    const subGrid = document.createElement("div");
    subGrid.className = "subcategory-grid";
    for (const subName of subNames) {
      const subBox = document.createElement(includeItems ? "div" : "a");
      subBox.className = includeItems
        ? "subcategory-box"
        : "subcategory-box subcategory-link";
      if (!includeItems) {
        subBox.href = `subcategory.html?type=${encodeURIComponent(getDatasetKey())}&category=${encodeURIComponent(catName)}&subcategory=${encodeURIComponent(subName)}`;
      }

      const subHeader = document.createElement("div");
      subHeader.className = "subcategory-header";
      subHeader.append(
        createTextElement("h3", "subcategory-title", subName),
        createTextElement("span", "subcategory-count", `${groups[catName][subName].length}`)
      );
      subBox.append(subHeader);

      if (includeItems) {
        const list = document.createElement("ul");
        list.className = "subcategory-list";
        const subcategoryItems = groups[catName][subName];
        if (subcategoryItems.length) {
          list.append(...subcategoryItems.map(createItemEntry));
        } else {
          const emptyState = document.createElement("li");
          emptyState.className = "subcategory-empty";
          emptyState.textContent = "No items documented yet";
          list.append(emptyState);
        }

        subBox.append(list);
      }
      subGrid.append(subBox);
    }

    catBox.append(subGrid);
    categoriesContainer.append(catBox);
  }

  if (itemCategoriesSection) itemCategoriesSection.hidden = false;
}

function getDatasetKey() {
  const paramsType = new URLSearchParams(window.location.search).get("type");
  if (paramsType && BROWSER_DATASETS[paramsType]) return paramsType;
  return document.body.dataset.browserKind || "items";
}

function renderCategoryPage(groups) {
  if (!categoryPage) return;
  const requestedCategory = new URLSearchParams(window.location.search).get("category") || "";
  const categoryName = Object.keys(groups).find(name =>
    name.toLowerCase() === requestedCategory.toLowerCase()
  );

  if (!categoryName) {
    if (categoryPageStatus) {
      categoryPageStatus.hidden = false;
      categoryPageStatus.textContent = "Category not found.";
    }
    return;
  }

  if (categoryPageTitle) categoryPageTitle.textContent = categoryName;
  const categoryGroups = { [categoryName]: groups[categoryName] };
  renderCategoriesGrid(categoryGroups);
  categoryPage.hidden = false;
  if (categoryPageStatus) categoryPageStatus.hidden = true;
}

function renderSubcategoryPage(groups) {
  if (!subcategoryPage) return;
  const params = new URLSearchParams(window.location.search);
  const requestedCategory = params.get("category") || "";
  const requestedSubcategory = params.get("subcategory") || "";
  const categoryName = Object.keys(groups).find(name =>
    name.toLowerCase() === requestedCategory.toLowerCase()
  );
  const subcategoryName = categoryName
    ? Object.keys(groups[categoryName]).find(name =>
      name.toLowerCase() === requestedSubcategory.toLowerCase()
    )
    : "";

  if (!categoryName || !subcategoryName) {
    if (subcategoryPageStatus) {
      subcategoryPageStatus.hidden = false;
      subcategoryPageStatus.textContent = "Subcategory not found.";
    }
    return;
  }

  const items = groups[categoryName][subcategoryName];
  subcategoryPageTitle.textContent = `${subcategoryName} (${items.length})`;
  categoryBack.href = `category.html?category=${encodeURIComponent(categoryName)}`;
  categoryBack.textContent = `← ${categoryName}`;
  subcategoryResults.replaceChildren(...items.map(createResultRow));
  subcategoryPage.hidden = false;
  subcategoryPageStatus.hidden = true;
}

function createResultRow(item) {
  const row = document.createElement("article");
  row.className = "item-result-row";
  row.append(createItemEntry(item));
  const source = createTextElement("span", "item-result-source", item.source || "Unknown source");
  row.append(source);
  return row;
}

function renderSearchResults(items) {
  if (!itemSearchResults) return;
  itemSearchResults.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "subcategory-empty";
    empty.textContent = "No matching items found.";
    itemSearchResults.append(empty);
    return;
  }
  itemSearchResults.append(...items.slice(0, 100).map(createResultRow));
}

function setupItemSearch(items) {
  if (!itemSearch) return;
  const updateResults = () => {
    const query = itemSearch.value.trim().toLowerCase();
    if (!query) {
      itemSearchResults.replaceChildren();
      return;
    }
    renderSearchResults(items.filter(item =>
      [item.name, item.id, item.subcategory, item.source]
        .some(value => value.toLowerCase().includes(query))
    ));
  };
  itemSearch.addEventListener("input", updateResults);
}

async function loadItemsAndCategories() {
  try {
    if (itemsStatus) {
      itemsStatus.hidden = false;
      itemsStatus.textContent = "Loading items from the documentation sheet...";
    }

    async function loadRecentItems() {
      try {
        renderRecentItems(await fetchAllCategoryItems());
      } catch (error) {
        console.error("Recent items loading error:", error);
        if (itemPreviewStatus) {
          itemPreviewStatus.textContent = "Recent items are unavailable right now.";
          itemPreviewStatus.classList.add("modlist-status--error");
        }
      }
    }
    // Fetch categories grid first (map subcategory -> category)
    const dataset = getDataset();
    const [catResp, items] = await Promise.all([
      fetch(dataset.categoriesUrl, { cache: "no-store" }),
      fetchAllCategoryItems()
    ]);

    if (!catResp.ok) throw new Error(`Categories sheet request failed: ${catResp.status}`);

    const catCsv = await catResp.text();

    const catRows = parseCsv(catCsv);
    const categoryLayout = dataset === BROWSER_DATASETS.items
      ? buildSubcategoryToCategoryMap(catRows)
      : buildSingleCategoryMap(
        catRows,
        dataset.category,
        dataset === BROWSER_DATASETS.vehicles ? "Vehicle Types" : "Animals Types"
      );

    const groups = groupItemsByCategory(items, categoryLayout.map, categoryLayout.categories);
    allItems = items;

    if (subcategoryPage) {
      renderSubcategoryPage(groups);
    } else if (categoryPage) {
      renderCategoryPage(groups);
    } else {
      renderCategoriesGrid(groups);
        setupItemSearch(items);
    }
    if (itemsStatus) itemsStatus.hidden = true;
  } catch (error) {
    console.error("Items/categories loading error:", error);
    if (itemCategoriesSection) {
      itemCategoriesSection.hidden = false;
      itemCategoriesSection.innerHTML = "<p class=\"modlist-status--error\">Unable to load Item categories from Sheets right now.</p>";
    }
  }
}


/* ========================= */
/* START */
/* ========================= */

if (modList && modlistStatus) {
  loadMods();
}

// Load categorized items if container is present
if (categoriesContainer || categoryPage || subcategoryPage) {
  // Hide until ready
  if (itemCategoriesSection) itemCategoriesSection.hidden = true;
  loadItemsAndCategories();
} else {
  console.log("No categories container found; skipping Items/categories load.");
}

if (itemPreview) {
  loadRecentItems();
}
