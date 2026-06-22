(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PlayerTrackerPartyTreasure = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CATEGORY_FALLBACK_GLYPH = '❓';
  const CONTAINER_GLYPH = '🧳';

  /**
   * Create a new inventory entry id.
   * @returns {string}
   */
  function createInventoryEntryId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
    return [
      hex.slice(0, 4).join(''),
      hex.slice(4, 6).join(''),
      hex.slice(6, 8).join(''),
      hex.slice(8, 10).join(''),
      hex.slice(10, 16).join('')
    ].join('-');
  }

  /**
   * Normalize a UUID-like string.
   * @param {string} value Raw string value.
   * @returns {string|null}
   */
  function normalizeUuidString(value) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidPattern.test(trimmed) ? trimmed : null;
  }

  /**
   * Normalize a money value to two decimal places.
   * @param {number} value Raw numeric value.
   * @returns {number}
   */
  function normalizeMoneyValue(value) {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.round(value * 100) / 100;
  }

  /**
   * Normalize a party treasure inventory entry.
   * @param {object} entry Raw entry data.
   * @param {string|null} containerId Optional container id fallback.
   * @param {boolean} isContainer Whether the entry should be treated as a container.
   * @returns {object}
   */
  function normalizeInventoryEntry(entry = {}, containerId = null, isContainer = false) {
    const normalizedContainerId =
      normalizeUuidString(entry.containerId) || normalizeUuidString(containerId) || null;
    return {
      id: normalizeUuidString(entry.id) || createInventoryEntryId(),
      name: typeof entry.name === 'string' ? entry.name : '',
      quantity: Number.isFinite(entry.quantity) ? entry.quantity : 1,
      value: normalizeMoneyValue(entry.value),
      weight: Number.isFinite(entry.weight) ? entry.weight : 0,
      url: typeof entry.url === 'string' && entry.url.trim() ? entry.url.trim() : null,
      category: typeof entry.category === 'string' && entry.category.trim() ? entry.category.trim() : null,
      containerId: normalizedContainerId,
      isContainer: typeof entry.isContainer === 'boolean' ? entry.isContainer : isContainer
    };
  }

  /**
   * Normalize a single equipment-library item.
   * @param {object} entry Raw item data.
   * @returns {object|null}
   */
  function normalizeEquipmentItem(entry = {}) {
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (!name) {
      return null;
    }
    return {
      id: typeof entry.id === 'string' && entry.id.trim()
        ? entry.id.trim()
        : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      name,
      category: typeof entry.category === 'string' && entry.category.trim() ? entry.category.trim() : null,
      value: Number.isFinite(entry.value) ? entry.value : null,
      weight: Number.isFinite(entry.weight) ? entry.weight : null,
      url: typeof entry.url === 'string' && entry.url.trim() ? entry.url.trim() : null,
      source: typeof entry.source === 'string' && entry.source.trim() ? entry.source.trim() : null
    };
  }

  /**
   * Normalize an equipment-library item list.
   * @param {Array<object>} items Raw item list.
   * @returns {Array<object>}
   */
  function normalizeEquipmentItems(items) {
    return Array.isArray(items) ? items.map((item) => normalizeEquipmentItem(item)).filter(Boolean) : [];
  }

  function normalizeLookupKey(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }

  function resolveCategoryGlyph(category, categoryIcons = {}, fallbackGlyph = CATEGORY_FALLBACK_GLYPH) {
    const normalizedCategory = normalizeLookupKey(category);
    if (!normalizedCategory || !categoryIcons || typeof categoryIcons !== 'object') {
      return fallbackGlyph;
    }
    const directGlyph = categoryIcons[category];
    if (typeof directGlyph === 'string' && directGlyph.trim()) {
      return directGlyph.trim();
    }
    const matchedKey = Object.keys(categoryIcons).find((key) => normalizeLookupKey(key) === normalizedCategory);
    if (!matchedKey) {
      return fallbackGlyph;
    }
    const glyph = categoryIcons[matchedKey];
    return typeof glyph === 'string' && glyph.trim() ? glyph.trim() : fallbackGlyph;
  }

  /**
   * Read the metadata stored on an inventory row.
   * @param {HTMLTableRowElement|null} row Inventory row element.
   * @returns {object|null}
   */
  function getInventoryRowData(row) {
    if (!row) return null;
    return {
      id: typeof row.dataset.inventoryEntryId === 'string' ? row.dataset.inventoryEntryId : '',
      containerId: typeof row.dataset.inventoryContainerId === 'string' && row.dataset.inventoryContainerId.trim()
        ? row.dataset.inventoryContainerId.trim()
        : null,
      isContainer: row.dataset.inventoryIsContainer === 'true'
    };
  }

  /**
   * Return all party-treasure rows in a table body.
   * @param {HTMLElement|null} fieldsEl Table body element.
   * @returns {HTMLTableRowElement[]}
   */
  function getPartyTreasureRows(fieldsEl) {
    if (!fieldsEl) return [];
    return Array.from(fieldsEl.querySelectorAll('tr.inventory-entry'));
  }

  /**
   * Read a party-treasure row back into normalized entry data.
   * @param {HTMLTableRowElement|null} row Inventory row element.
   * @returns {object|null}
   */
  function getPartyTreasureRowEntry(row) {
    if (!row) return null;
    const rowData = getInventoryRowData(row) || {};
    const nameInput = row.querySelector('input[data-inventory-field="name"]');
    const quantityInput = row.querySelector('input[data-inventory-field="quantity"]');
    const valueInput = row.querySelector('input[data-inventory-field="value"]');
    const weightInput = row.querySelector('input[data-inventory-field="weight"]');
    const urlInput = row.querySelector('input[data-inventory-field="url"]');
    const categoryInput = row.querySelector('input[data-inventory-field="category"]');
    let rawEntry = {};
    try {
      rawEntry = row.dataset.inventoryEntry ? JSON.parse(row.dataset.inventoryEntry) : {};
    } catch {
      rawEntry = {};
    }
    return normalizeInventoryEntry({
      id: rowData.id || null,
      name: nameInput ? nameInput.value.trim() : '',
      quantity: quantityInput ? Number(quantityInput.value) : 1,
      value: valueInput ? Number(valueInput.value) : 0,
      weight: weightInput ? Number(weightInput.value) : 0,
      url: urlInput ? urlInput.value.trim() : '',
      category: categoryInput ? categoryInput.value.trim() : (typeof rawEntry.category === 'string' ? rawEntry.category : null),
      containerId: rowData.containerId,
      isContainer: rowData.isContainer
    });
  }

  /**
   * Focus the first editable field inside an inventory row.
   * @param {HTMLTableRowElement|null} row Inventory row element.
   * @returns {void}
   */
  function focusInventoryRow(row) {
    if (!row) return;
    window.requestAnimationFrame(() => {
      const firstInput = row.querySelector('input');
      if (firstInput) {
        firstInput.focus();
        firstInput.select?.();
      }
    });
  }

  /**
   * Rebuild the equipment suggestion list for a datalist element.
   * @param {HTMLDataListElement|null} datalistEl Target datalist.
   * @param {Array<object>} equipmentLibraryItems Normalized equipment items.
   * @returns {void}
   */
  function updateEquipmentItemOptions(datalistEl, equipmentLibraryItems = []) {
    if (!datalistEl) return;
    datalistEl.innerHTML = '';
    equipmentLibraryItems.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.name;
      option.label = item.source ? `${item.name} - ${item.source}` : item.name;
      datalistEl.appendChild(option);
    });
  }

  /**
   * Apply an equipment preset to a party-treasure row.
   * @param {HTMLTableRowElement|null} row Inventory row element.
   * @param {string} itemName Preset name.
   * @param {Array<object>} equipmentLibraryItems Normalized equipment items.
   * @returns {void}
   */
  function applyPartyTreasurePresetToRow(row, itemName, equipmentLibraryItems = []) {
    if (!row || !itemName) return;
    const preset = findEquipmentPreset(itemName, equipmentLibraryItems);
    if (!preset) return;
    applyEquipmentPresetToInputs(
      {
        valueInput: row.querySelector('input[data-inventory-field="value"]'),
        weightInput: row.querySelector('input[data-inventory-field="weight"]'),
        urlInput: row.querySelector('input[data-inventory-field="url"]'),
        categoryInput: row.querySelector('input[data-inventory-field="category"]')
      },
      preset
    );
  }

  function findEquipmentPreset(itemName, equipmentLibraryItems = [], equipmentPresetApi = null) {
    const normalizedName = typeof itemName === 'string' ? itemName.trim().toLowerCase() : '';
    if (!normalizedName || !Array.isArray(equipmentLibraryItems)) {
      return null;
    }
    if (equipmentPresetApi?.findEquipmentPreset) {
      return equipmentPresetApi.findEquipmentPreset(itemName, equipmentLibraryItems);
    }
    return equipmentLibraryItems.find(
      (item) => typeof item?.name === 'string' && item.name.trim().toLowerCase() === normalizedName
    ) || null;
  }

  function applyEquipmentPresetToInputs(inputs = {}, preset = {}) {
    if (inputs.valueInput && Number.isFinite(preset.value)) {
      inputs.valueInput.value = String(preset.value);
    }
    if (inputs.weightInput && Number.isFinite(preset.weight)) {
      inputs.weightInput.value = String(preset.weight);
    }
    if (inputs.urlInput && typeof preset.url === 'string' && preset.url.trim()) {
      inputs.urlInput.value = preset.url.trim();
    }
    if (inputs.categoryInput && typeof preset.category === 'string' && preset.category.trim()) {
      inputs.categoryInput.value = preset.category.trim();
    }
  }

  /**
   * Populate the party treasure add/edit form from an entry.
   * @param {object} inputs Form input refs.
   * @param {object|null} entry Entry to load.
   * @param {Function} normalizeEntry Normalizer callback.
   * @returns {object}
   */
  function populatePartyTreasureAddForm(inputs = {}, entry = null, normalizeEntry = normalizeInventoryEntry) {
    const normalized = entry
      ? normalizeEntry(entry)
      : normalizeEntry({}, null, false);
    if (inputs.nameInput) inputs.nameInput.value = normalized.name || '';
    if (inputs.categoryInput) inputs.categoryInput.value = normalized.category || '';
    if (inputs.quantityInput) inputs.quantityInput.value = String(normalized.quantity ?? 1);
    if (inputs.valueInput) inputs.valueInput.value = String(normalized.value ?? 0);
    if (inputs.weightInput) inputs.weightInput.value = String(normalized.weight ?? 0);
    if (inputs.urlInput) inputs.urlInput.value = normalized.url || '';
    return normalized;
  }

  /**
   * Apply an equipment preset to the party treasure add/edit form.
   * @param {object} inputs Form input refs.
   * @param {string} itemName Preset item name.
   * @param {Array<object>} equipmentLibraryItems Normalized equipment items.
   * @returns {boolean}
   */
  function applyPartyTreasurePresetToForm(inputs = {}, itemName, equipmentLibraryItems = []) {
    const equipmentPresetApi = typeof window !== 'undefined' ? window.PlayerTrackerEquipmentPreset : null;
    const preset = findEquipmentPreset(itemName, equipmentLibraryItems, equipmentPresetApi);
    if (!preset) return false;
    if (equipmentPresetApi?.applyEquipmentPresetToInputs) {
      equipmentPresetApi.applyEquipmentPresetToInputs(inputs, itemName, equipmentLibraryItems);
      return true;
    }
    applyEquipmentPresetToInputs(inputs, preset);
    return true;
  }

  /**
   * Open or close the party treasure add/edit form.
   * @param {object} options Form state.
   * @returns {string|null} Entry id while editing, otherwise null.
   */
  function setPartyTreasureAddFormOpen({
    open,
    entry = null,
    formEl,
    titleEl,
    saveButtonEl,
    inputs = {},
    equipmentLibraryItems = [],
    normalizeEntry = normalizeInventoryEntry,
    updateActionButtons = null,
    refreshSelectedRowIcon = null
  } = {}) {
    if (!formEl) return null;
    formEl.classList.toggle('hidden', !open);
    formEl.setAttribute('aria-hidden', (!open).toString());
    const editingEntryId = open && entry ? (entry.id || null) : null;
    if (titleEl) {
      titleEl.textContent = open && entry ? 'Edit Item' : 'Add Item';
    }
    if (saveButtonEl) {
      saveButtonEl.textContent = open && entry ? 'Save Changes' : 'Add Item';
    }
    populatePartyTreasureAddForm(inputs, open ? entry : null, normalizeEntry);
    if (open) {
      applyPartyTreasurePresetToForm(inputs, inputs.nameInput?.value || '', equipmentLibraryItems);
      if (typeof refreshSelectedRowIcon === 'function') {
        refreshSelectedRowIcon();
      }
    }
    if (typeof updateActionButtons === 'function') {
      updateActionButtons();
    }
    return editingEntryId;
  }

  /**
   * Read the party treasure add/edit form into a draft item.
   * @param {object} inputs Form input refs.
   * @param {string|null} editingEntryId Current entry id when editing.
   * @param {Function} createEntryIdIdFn Entry id generator.
   * @returns {object}
   */
  function collectPartyTreasureDraftFromForm(inputs = {}, editingEntryId = null, createEntryIdFn = createInventoryEntryId) {
    const name = (inputs.nameInput?.value || '').trim();
    const category = (inputs.categoryInput?.value || '').trim();
    const quantityRaw = (inputs.quantityInput?.value || '').trim();
    const valueRaw = (inputs.valueInput?.value || '').trim();
    const weightRaw = (inputs.weightInput?.value || '').trim();
    const url = (inputs.urlInput?.value || '').trim();
    if (!name) {
      throw new Error('Item name is required.');
    }
    const quantity = quantityRaw === '' ? 1 : Number(quantityRaw);
    const value = valueRaw === '' ? 0 : Math.round(Number(valueRaw) * 100) / 100;
    const weight = weightRaw === '' ? 0 : Number(weightRaw);
    if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 1) {
      throw new Error(`Quantity for ${name} must be a whole number of at least 1.`);
    }
    if (!Number.isFinite(value)) {
      throw new Error(`Value for ${name} must be a valid number.`);
    }
    if (!Number.isFinite(weight)) {
      throw new Error(`Weight for ${name} must be a valid number.`);
    }
    return {
      id: editingEntryId || createEntryIdFn(),
      name,
      quantity,
      value,
      weight,
      url: url || null,
      category: category || null,
      containerId: null,
      isContainer: false
    };
  }

  function calculatePartyTreasureVendorProceeds(entry = {}, percent = 1) {
    const quantity = Number.isFinite(entry.quantity) ? Math.max(1, entry.quantity) : 1;
    const value = Number.isFinite(entry.value) ? entry.value : 0;
    const multiplier = Number.isFinite(percent) ? percent : 0;
    return Math.max(0, normalizeMoneyValue(quantity * value * multiplier));
  }

  function getLowestCurrencyUnit(currencySystem = null) {
    if (!currencySystem || !Array.isArray(currencySystem.units) || currencySystem.units.length === 0) {
      return null;
    }
    return currencySystem.units.reduce((lowest, unit) => {
      if (!lowest) return unit;
      const currentValue = Number(unit?.valueInCommonCurrency);
      const lowestValue = Number(lowest?.valueInCommonCurrency);
      if (!Number.isFinite(currentValue)) return lowest;
      if (!Number.isFinite(lowestValue)) return unit;
      return currentValue < lowestValue ? unit : lowest;
    }, null);
  }

  function getLowestCurrencyUnitLabel(currencySystem = null) {
    const lowestUnit = getLowestCurrencyUnit(currencySystem);
    if (!lowestUnit) {
      return '';
    }
    if (typeof lowestUnit.label === 'string' && lowestUnit.label.trim()) {
      return lowestUnit.label.trim().toLowerCase();
    }
    if (typeof lowestUnit.symbol === 'string' && lowestUnit.symbol.trim()) {
      return lowestUnit.symbol.trim().toLowerCase();
    }
    return typeof lowestUnit.id === 'string' ? lowestUnit.id.trim().toLowerCase() : '';
  }

  function convertCommonCurrencyToLowestUnitAmount(amount, currencySystem = null) {
    const normalizedAmount = normalizeMoneyValue(Number(amount));
    const lowestUnit = getLowestCurrencyUnit(currencySystem);
    const lowestUnitValue = Number(lowestUnit?.valueInCommonCurrency);
    if (!Number.isFinite(lowestUnitValue) || lowestUnitValue <= 0) {
      return Math.round(normalizedAmount);
    }
    return Math.round(normalizedAmount / lowestUnitValue);
  }

  function convertLowestUnitAmountToCurrencyBreakdown(lowestUnitAmount = 0, currencySystem = null) {
    if (!currencySystem || !Array.isArray(currencySystem.units) || currencySystem.units.length === 0) {
      return [];
    }
    const lowestUnit = getLowestCurrencyUnit(currencySystem);
    const lowestUnitValue = Number(lowestUnit?.valueInCommonCurrency);
    if (!Number.isFinite(lowestUnitValue) || lowestUnitValue <= 0) {
      return [];
    }
    let remainingLowestUnits = Math.max(0, Math.round(Number(lowestUnitAmount)));
    if (remainingLowestUnits === 0) {
      return [];
    }
    const units = [...currencySystem.units].sort((left, right) => {
      const leftValue = Number(left?.valueInCommonCurrency);
      const rightValue = Number(right?.valueInCommonCurrency);
      if (!Number.isFinite(leftValue) && !Number.isFinite(rightValue)) return 0;
      if (!Number.isFinite(leftValue)) return 1;
      if (!Number.isFinite(rightValue)) return -1;
      return rightValue - leftValue;
    });
    const breakdown = [];
    units.forEach((unit) => {
      const unitId = typeof unit?.id === 'string' ? unit.id.trim() : '';
      const unitValue = Number(unit?.valueInCommonCurrency);
      if (!unitId || !Number.isFinite(unitValue) || unitValue <= 0) {
        return;
      }
      const unitLowestUnits = Math.max(1, Math.round(unitValue / lowestUnitValue));
      const amount = Math.floor(remainingLowestUnits / unitLowestUnits);
      if (amount > 0) {
        breakdown.push({ unitId, amount });
        remainingLowestUnits -= amount * unitLowestUnits;
      }
    });
    return breakdown;
  }

  function splitCommonCurrencyEvenly(amount = 0, recipientCount = 0, currencySystem = null) {
    const normalizedAmount = Math.max(0, convertCommonCurrencyToLowestUnitAmount(amount, currencySystem));
    const normalizedRecipientCount = Math.max(0, Math.floor(Number(recipientCount)));
    if (normalizedAmount === 0 || normalizedRecipientCount === 0) {
      return {
        totalLowestUnits: normalizedAmount,
        distributableLowestUnits: 0,
        shareLowestUnits: 0,
        remainderLowestUnits: normalizedAmount,
        totalCommonAmount: normalizedAmount > 0 && currencySystem ? normalizedAmount * Number(getLowestCurrencyUnit(currencySystem)?.valueInCommonCurrency || 0) : 0,
        distributableCommonAmount: 0,
        shareCommonAmount: 0,
        remainderCommonAmount: normalizedAmount > 0 && currencySystem ? normalizedAmount * Number(getLowestCurrencyUnit(currencySystem)?.valueInCommonCurrency || 0) : 0
      };
    }
    const distributableLowestUnits = normalizedAmount - (normalizedAmount % normalizedRecipientCount);
    const shareLowestUnits = distributableLowestUnits / normalizedRecipientCount;
    const remainderLowestUnits = normalizedAmount - distributableLowestUnits;
    const lowestUnit = getLowestCurrencyUnit(currencySystem);
    const lowestUnitValue = Number(lowestUnit?.valueInCommonCurrency);
    const lowestUnitValueOrZero = Number.isFinite(lowestUnitValue) && lowestUnitValue > 0 ? lowestUnitValue : 0;
    return {
      totalLowestUnits: normalizedAmount,
      distributableLowestUnits,
      shareLowestUnits,
      remainderLowestUnits,
      totalCommonAmount: normalizeMoneyValue(normalizedAmount * lowestUnitValueOrZero),
      distributableCommonAmount: normalizeMoneyValue(distributableLowestUnits * lowestUnitValueOrZero),
      shareCommonAmount: normalizeMoneyValue(shareLowestUnits * lowestUnitValueOrZero),
      remainderCommonAmount: normalizeMoneyValue(remainderLowestUnits * lowestUnitValueOrZero)
    };
  }

  function applyCurrencyDelta(currencyAmounts = [], currencySystem = null, delta = 0) {
    const normalizedAmounts = Array.isArray(currencyAmounts)
      ? currencyAmounts
          .filter((amount) => amount && typeof amount.unitId === 'string')
          .map((amount) => ({
            unitId: amount.unitId.trim(),
            amount: Number.isFinite(amount.amount) ? amount.amount : 0
          }))
          .filter((amount) => amount.unitId)
      : [];
    if (!currencySystem || !Array.isArray(currencySystem.units) || currencySystem.units.length === 0) {
      return normalizedAmounts;
    }
    const lowestUnit = getLowestCurrencyUnit(currencySystem);
    const lowestUnitValue = Number(lowestUnit?.valueInCommonCurrency);
    if (!Number.isFinite(lowestUnitValue) || lowestUnitValue <= 0) {
      return normalizedAmounts;
    }
    const unitValueById = new Map(
      currencySystem.units
        .map((unit) => {
          const unitId = typeof unit?.id === 'string' ? unit.id.trim() : '';
          const unitValue = Number(unit?.valueInCommonCurrency);
          return unitId && Number.isFinite(unitValue) && unitValue > 0
            ? [unitId, unitValue]
            : null;
        })
        .filter(Boolean)
    );
    let totalLowestUnits = 0;
    normalizedAmounts.forEach((amount) => {
      const unitValue = unitValueById.get(amount.unitId);
      if (!Number.isFinite(unitValue) || unitValue <= 0) {
        return;
      }
      totalLowestUnits += Math.round(amount.amount * (unitValue / lowestUnitValue));
    });
    totalLowestUnits += convertCommonCurrencyToLowestUnitAmount(delta, currencySystem);
    if (totalLowestUnits <= 0) {
      return [];
    }
    return convertLowestUnitAmountToCurrencyBreakdown(totalLowestUnits, currencySystem);
  }

  function getEquipmentItemCategory(itemName, equipmentLibraryItems = []) {
    if (!itemName || !Array.isArray(equipmentLibraryItems)) {
      return null;
    }
    const equipmentPresetApi = typeof window !== 'undefined' ? window.PlayerTrackerEquipmentPreset : null;
    const preset = equipmentPresetApi?.findEquipmentPreset
      ? equipmentPresetApi.findEquipmentPreset(itemName, equipmentLibraryItems)
      : equipmentLibraryItems.find(
          (item) => (item.name || '').trim().toLowerCase() === itemName.trim().toLowerCase()
        );
    if (!preset) {
      return null;
    }
    return typeof preset.category === 'string' && preset.category.trim() ? preset.category.trim() : null;
  }

  function resolveEquipmentOverflowGlyph({
    entry = {},
    equipmentLibraryItems = [],
    categoryIcons = {},
    fallbackGlyph = CATEGORY_FALLBACK_GLYPH
  } = {}) {
    if (entry.isContainer) {
      return CONTAINER_GLYPH;
    }
    const category = typeof entry.category === 'string' && entry.category.trim()
      ? entry.category.trim()
      : null;
    return resolveCategoryGlyph(category, categoryIcons, fallbackGlyph);
  }

  /**
   * Create a party-treasure table row.
   * @param {object} options Row options.
   * @param {object} options.entry Entry to render.
   * @param {string} options.itemOptionsId Datalist id for item suggestions.
   * @param {Function|null} options.onDirty Dirty-state callback.
   * @param {Function|null} options.onSelect Selection callback.
   * @param {Function|null} options.applyPreset Preset callback.
   * @param {boolean} options.readOnly Whether to render the row as a read-only display row.
   * @returns {HTMLTableRowElement}
   */
  function createPartyTreasureRow({
    entry = {},
    itemOptionsId = 'party-treasure-item-options',
    onDirty = null,
    onSelect = null,
    applyPreset = null,
    readOnly = true,
    firstColumnRenderer = null
  } = {}) {
    const normalized = normalizeInventoryEntry(entry, null, false);
    const row = document.createElement('tr');
    row.className = 'inventory-entry';
    if (readOnly) {
      row.classList.add('inventory-entry-display');
    }
    row.dataset.inventoryEntryId = normalized.id;
    row.dataset.inventoryContainerId = '';
    row.dataset.inventoryIsContainer = 'false';
    row.addEventListener('click', () => {
      if (typeof onSelect === 'function') {
        onSelect(row);
      }
    });

    const menuCell = document.createElement('td');
    menuCell.className = 'inventory-entry-menu-cell';
    const firstColumnContent = typeof firstColumnRenderer === 'function'
      ? firstColumnRenderer({ row, entry: normalized, options: { itemOptionsId, onDirty, onSelect, applyPreset, readOnly } })
      : null;
    if (typeof firstColumnContent === 'string') {
      menuCell.textContent = firstColumnContent;
    } else if (firstColumnContent) {
      menuCell.appendChild(firstColumnContent);
    }
    row.appendChild(menuCell);

    const fields = [
      {
        key: 'name',
        type: 'text',
        value: normalized.name,
        placeholder: 'Item name',
        list: itemOptionsId
      },
      {
        key: 'quantity',
        type: 'number',
        value: String(normalized.quantity),
        step: '1'
      },
      {
        key: 'value',
        type: 'number',
        value: String(normalized.value),
        step: '0.01'
      }
    ];

    let nameCell = null;
    fields.forEach((field) => {
      const cell = document.createElement('td');
      cell.dataset.inventoryFieldCell = field.key;
      const input = document.createElement('input');
      input.type = readOnly ? 'hidden' : field.type;
      input.value = field.value;
      if (field.placeholder) {
        input.placeholder = field.placeholder;
      }
      if (field.list) {
        input.setAttribute('list', field.list);
      }
      if (field.step) {
        input.step = field.step;
      }
      input.dataset.inventoryField = field.key;
      if (field.key === 'name') {
        nameCell = cell;
      }
      if (readOnly) {
        const display = field.key === 'name' && normalized.url
          ? document.createElement('a')
          : document.createElement('div');
        display.className = `inventory-display-value inventory-display-${field.key}`;
        if (field.key === 'name' && normalized.url) {
          display.classList.add('inventory-display-link');
          display.href = normalized.url;
          display.target = '_blank';
          display.rel = 'noopener';
          display.addEventListener('click', (event) => {
            event.stopPropagation();
          });
        }
        display.textContent = field.key === 'name'
          ? (field.value || '—')
          : (field.value || (field.key === 'quantity' ? '1' : '0'));
        cell.appendChild(display);
        cell.appendChild(input);
      } else {
        input.addEventListener('input', () => {
          if (typeof onDirty === 'function') {
            onDirty();
          }
          if (field.key === 'name' && typeof applyPreset === 'function') {
            applyPreset(row, input.value);
          }
        });
        input.addEventListener('change', () => {
          if (field.key === 'name' && typeof applyPreset === 'function') {
            applyPreset(row, input.value);
          }
        });
        input.addEventListener('focus', () => {
          if (typeof onSelect === 'function') {
            onSelect(row);
          }
        });
        cell.appendChild(input);
      }
      row.appendChild(cell);
    });

    if (nameCell) {
      const weightHidden = document.createElement('input');
      weightHidden.type = 'hidden';
      weightHidden.value = String(normalized.weight);
      weightHidden.dataset.inventoryField = 'weight';
      nameCell.appendChild(weightHidden);

      const urlHidden = document.createElement('input');
      urlHidden.type = 'hidden';
      urlHidden.value = normalized.url || '';
      urlHidden.dataset.inventoryField = 'url';
      nameCell.appendChild(urlHidden);

      const categoryHidden = document.createElement('input');
      categoryHidden.type = 'hidden';
      categoryHidden.value = normalized.category || '';
      categoryHidden.dataset.inventoryField = 'category';
      nameCell.appendChild(categoryHidden);
    }

    return row;
  }

  /**
   * Build a full party-treasure table body from item data.
   * @param {HTMLElement|null} fieldsEl Table body element.
   * @param {Array<object>} items Item list to render.
   * @param {object} options Render options.
   * @returns {HTMLTableRowElement|null}
   */
  function buildPartyTreasureFields(fieldsEl, items = [], options = {}) {
    if (!fieldsEl) return null;
    const {
      itemOptionsId = 'party-treasure-item-options',
      onDirty = null,
      onSelect = null,
      applyPreset = null,
      readOnly = true,
      firstColumnRenderer = null
    } = options;
    fieldsEl.innerHTML = '';
    const normalizedEntries = Array.isArray(items)
      ? items.map((entry) => normalizeInventoryEntry(entry))
      : [];
    const rows = normalizedEntries.length > 0
      ? normalizedEntries
      : (readOnly ? [] : [normalizeInventoryEntry({}, null, false)]);
    rows.forEach((entry) => {
      fieldsEl.appendChild(createPartyTreasureRow({
        entry,
        itemOptionsId,
        onDirty,
        onSelect,
        applyPreset,
        readOnly,
        firstColumnRenderer
      }));
    });
    const firstRow = fieldsEl.querySelector('tr.inventory-entry');
    if (typeof onSelect === 'function') {
      onSelect(firstRow);
    }
    return firstRow;
  }

  /**
   * Insert or replace a party-treasure entry in a list.
   * @param {Array<object>} items Existing item list.
   * @param {object} entry Entry to upsert.
   * @returns {Array<object>}
   */
  function upsertPartyTreasureEntry(items = [], entry = {}) {
    const normalizedEntry = normalizeInventoryEntry(entry, null, false);
    const normalizedItems = Array.isArray(items)
      ? items.map((item) => normalizeInventoryEntry(item, null, false))
      : [];
    const index = normalizedItems.findIndex((item) => item.id === normalizedEntry.id);
    if (index >= 0) {
      normalizedItems[index] = normalizedEntry;
    } else {
      normalizedItems.push(normalizedEntry);
    }
    return normalizedItems;
  }

  /**
   * Remove a party-treasure entry from a list by id.
   * @param {Array<object>} items Existing item list.
   * @param {string} entryId Entry id to remove.
   * @returns {Array<object>}
   */
  function removePartyTreasureEntry(items = [], entryId) {
    const normalizedId = normalizeUuidString(entryId);
    if (!normalizedId) {
      return Array.isArray(items)
        ? items.map((item) => normalizeInventoryEntry(item, null, false))
        : [];
    }
    return Array.isArray(items)
      ? items
          .map((item) => normalizeInventoryEntry(item, null, false))
          .filter((item) => item.id !== normalizedId)
      : [];
  }

  return {
    CATEGORY_FALLBACK_GLYPH,
    CONTAINER_GLYPH,
    createInventoryEntryId,
    normalizeInventoryEntry,
    normalizeEquipmentItem,
    normalizeEquipmentItems,
    getInventoryRowData,
    getPartyTreasureRows,
    getPartyTreasureRowEntry,
    focusInventoryRow,
    updateEquipmentItemOptions,
    applyPartyTreasurePresetToRow,
    populatePartyTreasureAddForm,
    applyPartyTreasurePresetToForm,
    setPartyTreasureAddFormOpen,
    collectPartyTreasureDraftFromForm,
    calculatePartyTreasureVendorProceeds,
    getLowestCurrencyUnit,
    getLowestCurrencyUnitLabel,
    convertCommonCurrencyToLowestUnitAmount,
    convertLowestUnitAmountToCurrencyBreakdown,
    splitCommonCurrencyEvenly,
    applyCurrencyDelta,
    getEquipmentItemCategory,
    resolveCategoryGlyph,
    resolveEquipmentOverflowGlyph,
    createPartyTreasureRow,
    buildPartyTreasureFields,
    upsertPartyTreasureEntry,
    removePartyTreasureEntry
  };
});
