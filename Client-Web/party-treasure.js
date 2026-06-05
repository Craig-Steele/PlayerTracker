(function () {
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
    return normalizeInventoryEntry({
      id: rowData.id || null,
      name: nameInput ? nameInput.value.trim() : '',
      quantity: quantityInput ? Number(quantityInput.value) : 1,
      value: valueInput ? Number(valueInput.value) : 0,
      weight: weightInput ? Number(weightInput.value) : 0,
      url: urlInput ? urlInput.value.trim() : '',
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
    const preset = equipmentLibraryItems.find(
      (item) => (item.name || '').trim().toLowerCase() === itemName.trim().toLowerCase()
    );
    if (!preset) return;
    const valueInput = row.querySelector('input[data-inventory-field="value"]');
    const weightInput = row.querySelector('input[data-inventory-field="weight"]');
    if (valueInput && Number.isFinite(preset.value)) {
      valueInput.value = String(preset.value);
    }
    if (weightInput && Number.isFinite(preset.weight)) {
      weightInput.value = String(preset.weight);
    }
    const urlInput = row.querySelector('input[data-inventory-field="url"]');
    if (urlInput && typeof preset.url === 'string' && preset.url.trim()) {
      urlInput.value = preset.url.trim();
    }
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
    readOnly = true
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
      readOnly = true
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
        readOnly
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

  window.PlayerTrackerPartyTreasure = {
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
    createPartyTreasureRow,
    buildPartyTreasureFields,
    upsertPartyTreasureEntry,
    removePartyTreasureEntry
  };
})();
