(function () {
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

  function normalizeMoneyValue(value) {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.round(value * 100) / 100;
  }

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

  function normalizeEquipmentItems(items) {
    return Array.isArray(items) ? items.map((item) => normalizeEquipmentItem(item)).filter(Boolean) : [];
  }

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

  function getPartyTreasureRows(fieldsEl) {
    if (!fieldsEl) return [];
    return Array.from(fieldsEl.querySelectorAll('tr.inventory-entry'));
  }

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

  function createPartyTreasureRow({
    entry = {},
    itemOptionsId = 'party-treasure-item-options',
    onDirty = null,
    onSelect = null,
    applyPreset = null,
    displayMode = false
  } = {}) {
    const normalized = normalizeInventoryEntry(entry, null, false);
    const row = document.createElement('tr');
    row.className = 'inventory-entry';
    if (displayMode) {
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

    const fields = displayMode
      ? [
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
        ]
      : [
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
          },
          {
            key: 'weight',
            type: 'number',
            value: String(normalized.weight),
            step: 'any'
          },
          {
            key: 'url',
            type: 'url',
            value: normalized.url || ''
          }
        ];

    let nameCell = null;
    fields.forEach((field) => {
      const cell = document.createElement('td');
      cell.dataset.inventoryFieldCell = field.key;
      const input = document.createElement('input');
      input.type = displayMode ? 'hidden' : field.type;
      input.value = field.value;
      if (field.placeholder && !displayMode) {
        input.placeholder = field.placeholder;
      }
      if (field.list && !displayMode) {
        input.setAttribute('list', field.list);
      }
      if (field.step && !displayMode) {
        input.step = field.step;
      }
      input.dataset.inventoryField = field.key;
      if (!displayMode) {
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
      } else {
        const display = document.createElement(field.key === 'url' ? 'a' : 'div');
        display.className = `inventory-display-value inventory-display-${field.key}`;
        if (field.key === 'url') {
          if (field.value) {
            display.href = field.value;
            display.target = '_blank';
            display.rel = 'noopener';
            display.textContent = 'Open';
          } else {
            display.textContent = '—';
          }
        } else {
          display.textContent = field.key === 'name'
            ? (field.value || '—')
            : (field.value || (field.key === 'quantity' ? '1' : '0'));
        }
        cell.appendChild(display);
        cell.appendChild(input);
        if (field.key === 'name' && displayMode) {
          cell.classList.add('inventory-display-name-cell');
          nameCell = cell;
        }
      }
      row.appendChild(cell);
    });

    if (displayMode && nameCell) {
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

      if (normalized.url) {
        const display = document.createElement('div');
        display.className = 'inventory-display-link inventory-display-url';
        const anchor = document.createElement('a');
        anchor.href = normalized.url;
        anchor.target = '_blank';
        anchor.rel = 'noopener';
        anchor.textContent = 'Link';
        display.appendChild(anchor);
        nameCell.appendChild(display);
      }
    }

    if (displayMode) {
      while (row.children.length > 3) {
        row.removeChild(row.lastElementChild);
      }
    }

    return row;
  }

  function buildPartyTreasureFields(fieldsEl, items = [], options = {}) {
    if (!fieldsEl) return null;
    const {
      itemOptionsId = 'party-treasure-item-options',
      onDirty = null,
      onSelect = null,
      applyPreset = null,
      displayMode = false
    } = options;
    fieldsEl.innerHTML = '';
    const normalizedEntries = Array.isArray(items)
      ? items.map((entry) => normalizeInventoryEntry(entry))
      : [];
    const rows = normalizedEntries.length > 0
      ? normalizedEntries
      : (displayMode ? [] : [normalizeInventoryEntry({}, null, false)]);
    rows.forEach((entry) => {
      fieldsEl.appendChild(createPartyTreasureRow({
        entry,
        itemOptionsId,
        onDirty,
        onSelect,
        applyPreset,
        displayMode
      }));
    });
    const firstRow = fieldsEl.querySelector('tr.inventory-entry');
    if (typeof onSelect === 'function') {
      onSelect(firstRow);
    }
    return firstRow;
  }

  function collectPartyTreasurePayloadFromEditor(fieldsEl) {
    if (!fieldsEl) return null;
    const payload = [];
    const rows = Array.from(fieldsEl.querySelectorAll('tr.inventory-entry'));
    for (const row of rows) {
      const rowData = getInventoryRowData(row) || {};
      const nameInput = row.querySelector('input[data-inventory-field="name"]');
      const quantityInput = row.querySelector('input[data-inventory-field="quantity"]');
      const valueInput = row.querySelector('input[data-inventory-field="value"]');
      const weightInput = row.querySelector('input[data-inventory-field="weight"]');
      const urlInput = row.querySelector('input[data-inventory-field="url"]');
      const rawName = nameInput ? nameInput.value.trim() : '';
      const rawQuantity = quantityInput ? quantityInput.value.trim() : '';
      const rawValue = valueInput ? valueInput.value.trim() : '';
      const rawWeight = weightInput ? weightInput.value.trim() : '';
      const rawUrl = urlInput ? urlInput.value.trim() : '';
      const isUntouchedDefaultRow =
        !rawName &&
        (rawQuantity === '' || rawQuantity === '1') &&
        (rawValue === '' || rawValue === '0') &&
        (rawWeight === '' || rawWeight === '0') &&
        !rawUrl;
      if (isUntouchedDefaultRow) {
        continue;
      }
      if (!rawName) {
        throw new Error('Each party treasure row needs an item name.');
      }
      const quantity = rawQuantity === '' ? 1 : Number(rawQuantity);
      const value = rawValue === '' ? 0 : normalizeMoneyValue(Number(rawValue));
      const weight = rawWeight === '' ? 0 : Number(rawWeight);
      if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 1) {
        throw new Error(`Quantity for ${rawName} must be a whole number of at least 1.`);
      }
      if (!Number.isFinite(value)) {
        throw new Error(`Value for ${rawName} must be a valid number.`);
      }
      if (!Number.isFinite(weight)) {
        throw new Error(`Weight for ${rawName} must be a valid number.`);
      }
      payload.push({
        id: rowData.id || createInventoryEntryId(),
        name: rawName,
        quantity,
        value,
        weight,
        url: rawUrl || null,
        containerId: null,
        isContainer: false
      });
    }
    return payload.length > 0 ? payload : null;
  }

  window.PlayerTrackerPartyTreasure = {
    createInventoryEntryId,
    normalizeInventoryEntry,
    normalizeEquipmentItem,
    normalizeEquipmentItems,
    getInventoryRowData,
    getPartyTreasureRows,
    focusInventoryRow,
    updateEquipmentItemOptions,
    applyPartyTreasurePresetToRow,
    createPartyTreasureRow,
    buildPartyTreasureFields,
    collectPartyTreasurePayloadFromEditor
  };
})();
