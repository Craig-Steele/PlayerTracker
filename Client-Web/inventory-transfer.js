(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PlayerTrackerInventoryTransfer = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeTransferEntry(entry = {}) {
    return {
      id: typeof entry.id === 'string' ? entry.id.trim() : '',
      name: typeof entry.name === 'string' ? entry.name : '',
      quantity: Number.isFinite(entry.quantity) ? entry.quantity : 1,
      value: Number.isFinite(entry.value) ? entry.value : 0,
      weight: Number.isFinite(entry.weight) ? entry.weight : 0,
      url: typeof entry.url === 'string' && entry.url.trim() ? entry.url.trim() : null,
      category: typeof entry.category === 'string' && entry.category.trim() ? entry.category.trim() : null,
      containerId: typeof entry.containerId === 'string' && entry.containerId.trim()
        ? entry.containerId.trim()
        : null,
      isContainer: Boolean(entry.isContainer)
    };
  }

  function upsertTransferEntry(items = [], entry = {}) {
    const normalizedEntry = normalizeTransferEntry(entry);
    const normalizedItems = Array.isArray(items)
      ? items.map((item) => normalizeTransferEntry(item))
      : [];
    const index = normalizedItems.findIndex((item) => item.id === normalizedEntry.id);
    if (index >= 0) {
      normalizedItems[index] = normalizedEntry;
    } else {
      normalizedItems.push(normalizedEntry);
    }
    return normalizedItems;
  }

  function removeTransferEntry(items = [], entryId) {
    const normalizedId = typeof entryId === 'string' ? entryId.trim() : '';
    if (!normalizedId) {
      return Array.isArray(items) ? items.map((item) => normalizeTransferEntry(item)) : [];
    }
    return Array.isArray(items)
      ? items
          .map((item) => normalizeTransferEntry(item))
          .filter((item) => item.id !== normalizedId)
      : [];
  }

  function normalizedText(value) {
    return typeof value === 'string' ? value.trim() || null : null;
  }

  function itemsStackTogether(lhs = {}, rhs = {}) {
    const normalizedLhs = normalizeTransferEntry(lhs);
    const normalizedRhs = normalizeTransferEntry(rhs);
    if (normalizedLhs.isContainer || normalizedRhs.isContainer) return false;
    if (normalizedLhs.containerId !== normalizedRhs.containerId) return false;
    return normalizedText(normalizedLhs.name) === normalizedText(normalizedRhs.name)
      && normalizedText(normalizedLhs.category) === normalizedText(normalizedRhs.category)
      && normalizedText(normalizedLhs.url) === normalizedText(normalizedRhs.url)
      && normalizedLhs.value === normalizedRhs.value
      && normalizedLhs.weight === normalizedRhs.weight;
  }

  function stackTransferEntry(items = [], entry = {}) {
    const normalizedItems = Array.isArray(items)
      ? items.map((item) => normalizeTransferEntry(item))
      : [];
    const normalizedEntry = normalizeTransferEntry(entry);
    const index = normalizedItems.findIndex((item) => itemsStackTogether(item, normalizedEntry));
    if (index >= 0) {
      const existing = normalizedItems[index];
      normalizedItems[index] = {
        ...existing,
        quantity: existing.quantity + normalizedEntry.quantity,
        isContainer: false
      };
    } else {
      normalizedItems.push(normalizedEntry);
    }
    return normalizedItems;
  }

  function transferEntry({
    sourceItems = [],
    destinationItems = [],
    entryId,
    quantity = null,
    mapTransferredEntry = (entry) => entry,
    removeFromSource = true
  } = {}) {
    const normalizedSourceItems = Array.isArray(sourceItems)
      ? sourceItems.map((item) => normalizeTransferEntry(item))
      : [];
    const normalizedDestinationItems = Array.isArray(destinationItems)
      ? destinationItems.map((item) => normalizeTransferEntry(item))
      : [];
    const normalizedEntryId = typeof entryId === 'string' ? entryId.trim() : '';
    if (!normalizedEntryId) {
      return {
        sourceItems: normalizedSourceItems,
        destinationItems: normalizedDestinationItems,
        transferredEntry: null
      };
    }
    const sourceIndex = normalizedSourceItems.findIndex((item) => item.id === normalizedEntryId);
    if (sourceIndex < 0) {
      return {
        sourceItems: normalizedSourceItems,
        destinationItems: normalizedDestinationItems,
        transferredEntry: null
      };
    }

    const sourceEntry = normalizedSourceItems[sourceIndex];
    const availableQuantity = Math.max(1, sourceEntry.quantity);
    const requestedQuantity = quantity == null ? availableQuantity : Math.max(1, Math.min(availableQuantity, Math.floor(quantity)));
    const transferredEntry = normalizeTransferEntry(
      mapTransferredEntry({
        ...sourceEntry,
        quantity: requestedQuantity
      })
    );
    const nextSourceItems = removeFromSource
      ? (requestedQuantity >= availableQuantity
          ? normalizedSourceItems.filter((item) => item.id !== normalizedEntryId)
          : normalizedSourceItems.map((item) => (
              item.id === normalizedEntryId
                ? {
                    ...item,
                    quantity: availableQuantity - requestedQuantity
                  }
                : item
            )))
      : normalizedSourceItems.map((item) => (
          item.id === normalizedEntryId
            ? (
                requestedQuantity >= availableQuantity
                  ? transferredEntry
                  : {
                      ...item,
                      quantity: availableQuantity - requestedQuantity
                    }
              )
            : item
        ));
    const nextDestinationItems = removeFromSource
      ? stackTransferEntry(normalizedDestinationItems, transferredEntry)
      : (
          requestedQuantity >= availableQuantity
            ? upsertTransferEntry(normalizedDestinationItems, transferredEntry)
            : stackTransferEntry(nextSourceItems, transferredEntry)
        );

    return {
      sourceItems: nextSourceItems,
      destinationItems: nextDestinationItems,
      transferredEntry
    };
  }

  return {
    normalizeTransferEntry,
    upsertTransferEntry,
    removeTransferEntry,
    stackTransferEntry,
    transferEntry
  };
});
