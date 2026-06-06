(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PlayerTrackerInventoryView = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createInventorySectionTable(firstColumnLabel = '🧳', secondColumnLabel = 'Item') {
    const wrap = document.createElement('div');
    wrap.className = 'inventory-table-wrap';
    const table = document.createElement('table');
    table.className = 'inventory-table';
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    [firstColumnLabel, secondColumnLabel, 'Qty', 'Value', 'Weight'].forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    wrap.appendChild(table);
    return { wrap, tbody };
  }

  function buildInventoryContainerDisplayLabels(containerEntries = [], fallbackLabel = 'Container') {
    const nameCounts = new Map();
    containerEntries.forEach((entry) => {
      const baseName = (entry?.name || fallbackLabel).trim() || fallbackLabel;
      nameCounts.set(baseName, (nameCounts.get(baseName) || 0) + 1);
    });
    const seenCounts = new Map();
    return new Map(
      containerEntries.map((entry) => {
        const baseName = (entry?.name || fallbackLabel).trim() || fallbackLabel;
        const totalCount = nameCounts.get(baseName) || 0;
        const seen = (seenCounts.get(baseName) || 0) + 1;
        seenCounts.set(baseName, seen);
        const label = totalCount > 1 ? `${baseName} (${seen})` : baseName;
        return [entry.id, label];
      })
    );
  }

  function calculateInventoryTotalWeight(items = []) {
    return Array.isArray(items)
      ? items.reduce((sum, entry) => {
          if (!entry || entry.containerId) {
            return sum;
          }
          const quantity = Number(entry.quantity);
          const weight = Number(entry.weight);
          if (!Number.isFinite(quantity) || !Number.isFinite(weight)) {
            return sum;
          }
          return sum + (quantity * weight);
        }, 0)
      : 0;
  }

  function formatInventoryNumber(value) {
    return Number.isInteger(value)
      ? String(value)
      : String(Math.round(value * 1000) / 1000);
  }

  function createInventoryDisplayRow(entry = {}, options = {}) {
    const normalized = entry || {};
    const row = document.createElement('tr');
    row.className = 'inventory-entry';
    if (options.rowClassName) {
      String(options.rowClassName)
        .split(/\s+/)
        .filter(Boolean)
        .forEach((className) => row.classList.add(className));
    }
    if (normalized.isContainer) {
      row.classList.add('inventory-container-row');
    }
    row.dataset.inventoryEntryId = typeof normalized.id === 'string' ? normalized.id : '';
    row.dataset.inventoryContainerId = typeof normalized.containerId === 'string' && normalized.containerId.trim()
      ? normalized.containerId.trim()
      : '';
    row.dataset.inventoryIsContainer = normalized.isContainer ? 'true' : 'false';
    row.dataset.inventoryEntry = typeof options.datasetEntry === 'string'
      ? options.datasetEntry
      : JSON.stringify(normalized);
    if (typeof options.onRowClick === 'function') {
      row.addEventListener('click', () => {
        options.onRowClick(row);
      });
    }

    const menuCell = document.createElement('td');
    menuCell.className = 'inventory-entry-menu-cell';
    const firstColumnRenderer = typeof options.firstColumnRenderer === 'function'
      ? options.firstColumnRenderer
      : null;
    const firstColumnContent = firstColumnRenderer
      ? firstColumnRenderer({ row, entry: normalized, options })
      : null;
    if (typeof firstColumnContent === 'string') {
      menuCell.textContent = firstColumnContent;
    } else if (firstColumnContent) {
      menuCell.appendChild(firstColumnContent);
    } else {
      const icon = document.createElement('span');
      icon.className = 'inventory-display-value inventory-display-icon';
      icon.textContent = normalized.isContainer ? '🧳' : '🗡';
      menuCell.appendChild(icon);
    }
    row.appendChild(menuCell);

    const fields = [
      { key: 'name', value: normalized.name || '', isLink: false },
      { key: 'quantity', value: String(normalized.quantity ?? 1), isLink: false },
      { key: 'value', value: String(normalized.value ?? 0), isLink: false },
      { key: 'weight', value: String(normalized.weight ?? 0), isLink: false }
    ];

    fields.forEach((field) => {
      const cell = document.createElement('td');
      cell.dataset.inventoryFieldCell = field.key;
      if (field.key === 'name') {
        const url = typeof normalized.url === 'string' ? normalized.url.trim() : '';
        if (url) {
          const link = document.createElement('a');
          link.className = 'inventory-display-value inventory-display-name inventory-display-link';
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = field.value || 'Item';
          link.addEventListener('click', (event) => {
            event.stopPropagation();
          });
          cell.appendChild(link);
        } else {
          const display = document.createElement('span');
          display.className = 'inventory-display-value inventory-display-name';
          display.textContent = field.value || 'Item';
          cell.appendChild(display);
        }
      } else {
        const display = document.createElement('span');
        display.className = `inventory-display-value inventory-display-${field.key}`;
        display.textContent = field.value;
        cell.appendChild(display);
      }
      row.appendChild(cell);
    });

    return row;
  }

  function appendInventoryDisplayRow(targetBody, entry = {}, options = {}) {
    if (!targetBody) return null;
    const row = createInventoryDisplayRow(entry, options);
    targetBody.appendChild(row);
    return row;
  }

  function buildInventoryContainerSection(containerEntry, allEntries, options = {}) {
    if (!options.containerSectionsEl || !containerEntry?.id) return null;
    const section = document.createElement('section');
    section.className = 'inventory-section inventory-container-section';
    section.dataset.containerId = containerEntry.id;
    const displayLabel = options.displayLabel || containerEntry.name || 'Container';
    const { wrap, tbody } = createInventorySectionTable(
      options.containerFirstColumnLabel || '🧳',
      displayLabel
    );
    appendInventoryDisplayRow(tbody, containerEntry, {
      ...options,
      rowClassName: [options.rowClassName, 'inventory-container-row'].filter(Boolean).join(' ')
    });
    (Array.isArray(allEntries) ? allEntries : [])
      .filter((entry) => entry && entry.containerId === containerEntry.id && !entry.isContainer)
      .forEach((entry) => {
        appendInventoryDisplayRow(tbody, entry, options);
      });
    section.appendChild(wrap);
    options.containerSectionsEl.appendChild(section);
    return section;
  }

  function buildCurrencyFields(fieldsEl, character, currencySystem, options = {}) {
    if (!fieldsEl) return;
    fieldsEl.innerHTML = '';
    const units = currencySystem?.units || [];
    const currencyByUnit = new Map(
      Array.isArray(character?.currency)
        ? character.currency
            .filter((entry) => entry && typeof entry.unitId === 'string')
            .map((entry) => [entry.unitId, entry])
        : []
    );
    units.forEach((unit) => {
      const row = document.createElement('label');
      row.className = 'property-row';
      row.setAttribute('for', `${options.inputIdPrefix || 'currency'}-${unit.id}`);

      const label = document.createElement('span');
      label.className = 'property-label';
      label.textContent = `${unit.label}${unit.symbol ? ` (${unit.symbol})` : ''}`;
      row.appendChild(label);

      const control = document.createElement('span');
      control.className = 'property-control';

      if (options.readOnly) {
        const value = document.createElement('span');
        value.className = 'currency-display-value';
        value.textContent = Number.isFinite(currencyByUnit.get(unit.id)?.amount)
          ? String(currencyByUnit.get(unit.id).amount)
          : '0';
        control.appendChild(value);
      } else {
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '1';
        input.id = `${options.inputIdPrefix || 'currency'}-${unit.id}`;
        input.inputMode = 'numeric';
        input.value = Number.isFinite(currencyByUnit.get(unit.id)?.amount)
          ? String(currencyByUnit.get(unit.id).amount)
          : '0';
        input.dataset.currencyUnitId = unit.id;
        if (typeof options.onDirty === 'function') {
          input.addEventListener('input', () => {
            options.onDirty();
          });
        }
        control.appendChild(input);
      }

      row.appendChild(control);
      fieldsEl.appendChild(row);
    });
  }

  function normalizeCurrencySystem(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    const commonCurrencyId =
      typeof entry.commonCurrencyId === 'string' ? entry.commonCurrencyId.trim() : '';
    const units = Array.isArray(entry.units)
      ? entry.units
          .map((unit) => {
            if (!unit || typeof unit.id !== 'string' || typeof unit.label !== 'string') {
              return null;
            }
            const id = unit.id.trim();
            const label = unit.label.trim();
            if (!id || !label) {
              return null;
            }
            const valueInCommonCurrency = Number(unit.valueInCommonCurrency);
            if (!Number.isFinite(valueInCommonCurrency)) {
              return null;
            }
            return {
              id,
              label,
              symbol: typeof unit.symbol === 'string' && unit.symbol.trim() ? unit.symbol.trim() : null,
              valueInCommonCurrency
            };
          })
          .filter(Boolean)
      : [];
    if (!commonCurrencyId || units.length === 0) {
      return null;
    }
    return { commonCurrencyId, units };
  }

  function calculateCurrencyTotal(character, currencySystem) {
    if (!character || !currencySystem || !Array.isArray(character.currency)) {
      return null;
    }
    const unitValueById = new Map(
      currencySystem.units.map((unit) => [unit.id, unit.valueInCommonCurrency])
    );
    let total = 0;
    let hasValue = false;
    character.currency.forEach((amount) => {
      if (!amount || typeof amount.unitId !== 'string') return;
      const unitValue = unitValueById.get(amount.unitId.trim());
      if (!Number.isFinite(unitValue) || !Number.isFinite(amount.amount)) return;
      total += amount.amount * unitValue;
      hasValue = true;
    });
    return hasValue ? total : 0;
  }

  function formatCurrencyTotal(character, currencySystem) {
    const total = calculateCurrencyTotal(character, currencySystem);
    if (!currencySystem || !Array.isArray(currencySystem.units) || currencySystem.units.length === 0) {
      return null;
    }
    const commonUnit =
      currencySystem.units.find((unit) => unit.id === currencySystem.commonCurrencyId) ||
      currencySystem.units[0];
    const unitLabel = commonUnit && typeof commonUnit.label === 'string'
      ? commonUnit.label.trim().toLowerCase()
      : '';
    if (!unitLabel) {
      return null;
    }
    const formattedTotal = Number.isFinite(total) ? total.toFixed(2) : '0.00';
    return `${formattedTotal} ${unitLabel}`;
  }

  return {
    calculateCurrencyTotal,
    buildCurrencyFields,
    buildInventoryContainerDisplayLabels,
    buildInventoryContainerSection,
    calculateInventoryTotalWeight,
    createInventoryDisplayRow,
    createInventorySectionTable,
    appendInventoryDisplayRow,
    formatCurrencyTotal,
    normalizeCurrencySystem
  };
});
