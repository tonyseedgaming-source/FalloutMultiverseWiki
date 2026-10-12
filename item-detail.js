const ITEM_MANIFEST_URL = "data/json/manifest.json";
const ITEM_SHARD_PATTERN = /^items-\d{5}-[0-9a-f]{64}\.json$/;

const itemForm = document.querySelector("[data-item-search]");
const itemInput = document.querySelector("#item-lookup");
const itemStatus = document.querySelector("[data-item-status]");
const itemResults = document.querySelector("[data-item-results]");

let itemManifestPromise;
const itemShardCache = new Map();

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function setItemStatus(message, isError = false) {
  itemStatus.textContent = message;
  itemStatus.classList.toggle("item-detail-status--error", isError);
}

function displayValue(value) {
  if (Array.isArray(value)) return value.map(displayValue).join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return value === undefined || value === null ? "" : String(value);
}

function appendDefinitionList(parent, values, className = "item-detail-properties") {
  if (!values || typeof values !== "object") return;
  const list = createElement("dl", className);
  for (const [key, value] of Object.entries(values)) {
    const row = createElement("div", "item-detail-property");
    row.append(
      createElement("dt", "", key.replaceAll("_", " ")),
      createElement("dd", "", displayValue(value))
    );
    list.append(row);
  }
  if (list.childElementCount) parent.append(list);
}

function getProperty(properties, ...keys) {
  const actualKey = Object.keys(properties || {}).find(key =>
    keys.some(wanted => key.toLowerCase() === wanted.toLowerCase())
  );
  return actualKey ? properties[actualKey] : undefined;
}

function addStat(grid, value, label, tone = "") {
  if (value === undefined || value === null || value === "") return;
  const card = createElement("div", `item-stat ${tone}`.trim());
  card.append(
    createElement("strong", "", displayValue(value)),
    createElement("span", "", label)
  );
  grid.append(card);
}

function renderGeneral(record) {
  const panel = createElement("section", "item-tab-panel");
  panel.dataset.panel = "general";
  panel.append(createElement("h1", "", record.name || record.folderName || "Unnamed item"));
  if (record.description) panel.append(createElement("p", "item-description", record.description));

  const stats = createElement("div", "item-stats-grid");
  const properties = record.properties || {};
  const sizeX = getProperty(properties, "Size_X");
  const sizeY = getProperty(properties, "Size_Y");
  addStat(stats, sizeX !== undefined && sizeY !== undefined ? `${sizeX} × ${sizeY}` : undefined, "Inventory size");
  addStat(stats, getProperty(properties, "Health"), "Health", "item-stat--red");
  addStat(stats, getProperty(properties, "Rarity"), "Rarity", "item-stat--muted");
  addStat(stats, getProperty(properties, "Build"), "Build material", "item-stat--blue");
  addStat(stats, getProperty(properties, "Repairable"), "Repairable", "item-stat--green");
  addStat(stats, getProperty(properties, "Salvageable"), "Salvageable", "item-stat--green");
  if (record.blueprints?.length) {
    addStat(stats, record.blueprints.length, "Blueprints", "item-stat--green");
  }
  panel.append(stats);

  const shownKeys = new Set([
    "guid", "type", "rarity", "useable", "build", "id", "size_x", "size_y",
    "size_z", "health", "repairable", "salvageable"
  ]);
  const extraProperties = Object.fromEntries(
    Object.entries(properties).filter(([key]) => !shownKeys.has(key.toLowerCase()))
  );
  if (Object.keys(extraProperties).length) {
    panel.append(createElement("h2", "item-section-heading", "Additional details"));
    appendDefinitionList(panel, extraProperties);
  }
  return panel;
}

function getBlueprintValue(blueprint, ...keys) {
  return getProperty(blueprint, ...keys);
}

function renderRecipeItems(value) {
  if (value === undefined || value === null || value === "") return [];
  return (Array.isArray(value) ? value : [value]).map(item => {
    if (typeof item !== "object" || item === null) {
      return { id: String(item), amount: "" };
    }
    return {
      id: getBlueprintValue(item, "ID", "Item", "Guid") || "Unknown item",
      amount: getBlueprintValue(item, "Amount", "Count") || ""
    };
  });
}

function renderBlueprint(blueprint, index) {
  const card = createElement("article", "blueprint-card");
  const category = getBlueprintValue(blueprint, "Name", "CategoryTag", "Type") || `Blueprint ${index + 1}`;
  const heading = createElement("header", "blueprint-card-heading");
  heading.append(createElement("span", "", displayValue(category)));
  const skill = getBlueprintValue(blueprint, "Skill");
  const skillLevel = getBlueprintValue(blueprint, "Skill_Level", "SkillLevel");
  if (skill) {
    heading.append(createElement(
      "span",
      "blueprint-requirement",
      `${displayValue(skill)}${skillLevel ? ` lvl.${displayValue(skillLevel)}` : ""}`
    ));
  }
  card.append(heading);

  const inputItems = renderRecipeItems(getBlueprintValue(blueprint, "InputItems", "Inputs"));
  const outputItems = renderRecipeItems(getBlueprintValue(blueprint, "OutputItems", "Outputs"));
  const recipe = createElement("div", "blueprint-recipe");
  const inputs = createElement("div", "blueprint-items");
  inputItems.forEach(item => {
    const label = `${item.amount && item.amount !== "1" ? `${item.amount} × ` : ""}${item.id}`;
    inputs.append(createElement("span", "blueprint-item", label));
  });
  recipe.append(inputs, createElement("span", "blueprint-equals", "→"));
  const outputs = createElement("div", "blueprint-items");
  outputItems.forEach(item => {
    const label = `${item.amount && item.amount !== "1" ? `${item.amount} × ` : ""}${item.id}`;
    outputs.append(createElement("span", "blueprint-item blueprint-item--output", label));
  });
  if (!inputItems.length && !outputItems.length) {
    recipe.append(createElement("span", "item-empty-state", "Recipe fields are available in the raw datafile."));
  } else {
    recipe.append(outputs);
  }
  card.append(recipe);

  const workstation = getBlueprintValue(blueprint, "Workstation", "Build");
  if (workstation) {
    card.append(createElement("footer", "blueprint-workstation", `Workstation: ${displayValue(workstation)}`));
  }
  const omitted = new Set([
    "name", "categorytag", "type", "skill", "skill_level", "skilllevel",
    "inputitems", "inputs", "outputitems", "outputs", "workstation", "build"
  ]);
  const extra = Object.fromEntries(
    Object.entries(blueprint).filter(([key]) => !omitted.has(key.toLowerCase()))
  );
  appendDefinitionList(card, extra, "item-detail-properties blueprint-properties");
  return card;
}

function renderBlueprints(record) {
  const panel = createElement("section", "item-tab-panel");
  panel.dataset.panel = "blueprints";
  const blueprints = Array.isArray(record.blueprints) ? record.blueprints : [];
  panel.append(createElement("h2", "item-section-heading", `Blueprints (${blueprints.length})`));
  panel.append(createElement(
    "p",
    "item-panel-description",
    "Recipes and crafting requirements parsed from the item's datafile."
  ));
  const search = createElement("input", "blueprint-filter");
  search.type = "search";
  search.placeholder = "Search blueprints...";
  search.setAttribute("aria-label", "Search blueprints");
  panel.append(search);
  const list = createElement("div", "blueprint-list");
  if (blueprints.length) {
    blueprints.forEach((blueprint, index) => list.append(renderBlueprint(blueprint, index)));
  } else {
    list.append(createElement("p", "item-empty-state", "No blueprint entries were found."));
  }
  search.addEventListener("input", () => {
    const query = search.value.trim().toLowerCase();
    Array.from(list.children).forEach(card => {
      card.hidden = Boolean(query) && !card.textContent.toLowerCase().includes(query);
    });
  });
  panel.append(list);
  return panel;
}

function renderRawDatafile(name, content, open = false) {
  if (content === undefined || content === null || content === "") return null;
  const details = createElement("details", "datafile-card");
  details.open = open;
  details.append(createElement("summary", "", name));
  const pre = createElement("pre", "datafile-source");
  const code = createElement("code");
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    const row = createElement("span", "datafile-line");
    row.append(createElement("span", "datafile-line-number", String(index + 1)));
    const commentIndex = line.indexOf("//");
    const source = commentIndex < 0 ? line : line.slice(0, commentIndex);
    const comment = commentIndex < 0 ? "" : line.slice(commentIndex);
    const directive = /^(\s*)([\w.-]+)(.*)$/.exec(source);
    if (directive) {
      row.append(document.createTextNode(directive[1]));
      row.append(createElement("span", "datafile-key", directive[2]));
      row.append(document.createTextNode(directive[3]));
    } else {
      row.append(document.createTextNode(source));
    }
    if (comment) row.append(createElement("span", "datafile-comment", comment));
    code.append(row);
    if (index < lines.length - 1) code.append(document.createTextNode("\n"));
  });
  pre.append(code);
  details.append(pre);
  return details;
}

function renderDatafilePanel(record) {
  const panel = createElement("section", "item-tab-panel");
  panel.dataset.panel = "datafile";
  panel.append(createElement("h2", "item-section-heading", "Datafile"));
  const datafile = record.datafile;
  const rendered = datafile && renderRawDatafile(datafile.name || "Item.dat", datafile.content, true);
  if (rendered) panel.append(rendered);
  else panel.append(createElement("p", "item-empty-state", "No main datafile was exported for this item."));
  return panel;
}

function renderEnglishDatafile(record) {
  const panel = createElement("section", "item-tab-panel");
  panel.dataset.panel = "english";
  panel.append(createElement("h2", "item-section-heading", "English.dat"));
  const details = renderRawDatafile("English.dat", record.englishDatafile, true);
  if (details) panel.append(details);
  else panel.append(createElement("p", "item-empty-state", "No English.dat file was found for this item."));
  return panel;
}

function renderSidebar(record, iconUrl) {
  const aside = createElement("aside", "item-sidebar");
  const card = createElement("section", "item-identity-card");
  if (iconUrl && /^https?:\/\//i.test(iconUrl)) {
    const image = createElement("img", "item-detail-icon");
    image.src = iconUrl;
    image.alt = `${record.name || record.folderName || "Item"} icon`;
    image.loading = "lazy";
    image.onerror = () => image.replaceWith(createElement("div", "item-image-placeholder", "FM"));
    card.append(image);
  } else {
    const image = createElement("div", "item-image-placeholder", "FM");
    image.setAttribute("aria-hidden", "true");
    card.append(image);
  }
  card.append(createElement("h2", "", record.name || record.folderName || "Unnamed item"));
  if (record.description) {
    card.append(createElement("p", "item-sidebar-description", record.description));
  }

  for (const [label, value] of [["ID", record.id], ["GUID", record.guid]]) {
    if (!value) continue;
    const field = createElement("label", "item-id-field");
    field.append(createElement("span", "", label));
    const input = createElement("input");
    input.readOnly = true;
    input.value = value;
    input.setAttribute("aria-label", label);
    field.append(input);
    const copy = createElement("button", "copy-id-button", "Copy");
    copy.type = "button";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(value);
        copy.textContent = "Copied";
        window.setTimeout(() => { copy.textContent = "Copy"; }, 1200);
      } catch (error) {
        console.error("Unable to copy item identifier:", error);
      }
    });
    field.append(copy);
    card.append(field);
  }

  const badges = createElement("div", "item-badges");
  [record.category, getProperty(record.properties, "Type"), getProperty(record.properties, "Rarity")]
    .filter(Boolean)
    .forEach((value, index) => badges.append(
      createElement("span", `item-badge item-badge--${index}`, displayValue(value))
    ));
  card.append(badges);
  aside.append(card);
  return aside;
}

function renderItem(record, iconUrl) {
  const layout = createElement("div", "item-detail-layout");
  const main = createElement("div", "item-detail-main");
  const tabs = [
    ["general", "General", renderGeneral(record)],
    ["blueprints", `Blueprints (${record.blueprints?.length || 0})`, renderBlueprints(record)],
    ["datafile", "Datafile", renderDatafilePanel(record)],
    ["english", "English.dat", renderEnglishDatafile(record)]
  ];
  const tabList = createElement("nav", "item-detail-tabs");
  tabList.setAttribute("role", "tablist");
  tabs.forEach(([key, label, panel], index) => {
    const button = createElement("button", "item-detail-tab", label);
    button.type = "button";
    button.id = `item-tab-${key}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `item-panel-${key}`);
    button.setAttribute("aria-selected", String(index === 0));
    if (index === 0) button.classList.add("is-active");
    button.addEventListener("click", () => {
      tabs.forEach(([tabKey, , tabPanel], tabIndex) => {
        const active = tabKey === key;
        const tabButton = tabList.children[tabIndex];
        tabButton.classList.toggle("is-active", active);
        tabButton.setAttribute("aria-selected", String(active));
        tabPanel.hidden = !active;
      });
    });
    panel.id = `item-panel-${key}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", button.id);
    panel.hidden = index !== 0;
    tabList.append(button);
  });
  main.append(tabList, ...tabs.map(([, , panel]) => panel));
  layout.append(main, renderSidebar(record, iconUrl));
  return layout;
}

async function getItemManifest() {
  if (!itemManifestPromise) {
    itemManifestPromise = fetch(ITEM_MANIFEST_URL).then(response => {
      if (!response.ok) throw new Error(`Item manifest request failed: ${response.status}`);
      return response.json();
    });
  }
  return itemManifestPromise;
}

async function getItemShard(shardName) {
  if (!ITEM_SHARD_PATTERN.test(shardName)) {
    throw new Error("The item manifest contains an invalid shard filename.");
  }
  if (!itemShardCache.has(shardName)) {
    itemShardCache.set(shardName, fetch(`data/json/${shardName}`).then(response => {
      if (!response.ok) throw new Error(`Item data request failed: ${response.status}`);
      return response.json();
    }));
  }
  return itemShardCache.get(shardName);
}

async function findItem(manifest, lookup, preferredName) {
  const normalized = lookup.trim();
  const guidReferences = manifest.byGuid?.[normalized.toLowerCase()] || [];
  const references = guidReferences.length
    ? guidReferences
    : (manifest.byId?.[normalized] || []);
  if (!references.length) return [];
  const records = await Promise.all(references.map(async reference => {
    if (!Number.isInteger(reference.index) || reference.index < 0) {
      throw new Error("The item manifest contains an invalid record index.");
    }
    const shard = await getItemShard(reference.shard);
    if (!Array.isArray(shard) || !shard[reference.index]) {
      throw new Error("The item manifest points to a missing item record.");
    }
    return shard[reference.index];
  }));
  if (guidReferences.length || records.length < 2 || !preferredName) return records;
  const namedRecords = records.filter(record =>
    (record.name || "").trim().toLowerCase() === preferredName.trim().toLowerCase()
  );
  return namedRecords.length ? namedRecords : records;
}

async function loadItem(lookup, preferredName, iconUrl) {
  itemResults.replaceChildren();
  setItemStatus("Loading item details...");
  try {
    const manifest = await getItemManifest();
    const records = await findItem(manifest, lookup, preferredName);
    if (!records.length) {
      setItemStatus(`No item matched "${lookup}".`, true);
      return;
    }
    itemResults.replaceChildren(...records.map(record => renderItem(record, iconUrl)));
    setItemStatus(records.length === 1
      ? "Item details loaded."
      : `The ID matches ${records.length} records; showing all matches.`);
    document.title = `${records[0].name || "Item"} | Fallout Multiverse`;
  } catch (error) {
    console.error("Item detail loading error:", error);
    setItemStatus("Unable to load item data. Check that data/json/manifest.json is deployed.", true);
  }
}

itemForm.addEventListener("submit", event => {
  event.preventDefault();
  const lookup = itemInput.value.trim();
  if (lookup) window.location.href = `item.html?id=${encodeURIComponent(lookup)}`;
});

const params = new URLSearchParams(window.location.search);
const initialLookup = params.get("guid") || params.get("id") || params.get("lookup");
if (initialLookup) {
  itemInput.value = initialLookup;
  loadItem(initialLookup, params.get("name") || "", params.get("icon") || "");
}
