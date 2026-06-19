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

  function transferEntry({
    sourceItems = [],
    destinationItems = [],
    entryId,
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
    const transferredEntry = normalizeTransferEntry(mapTransferredEntry({ ...sourceEntry }));
    const nextSourceItems = removeFromSource
      ? normalizedSourceItems.filter((item) => item.id !== normalizedEntryId)
      : normalizedSourceItems.map((item) => item.id === normalizedEntryId ? normalizeTransferEntry(mapTransferredEntry({ ...item })) : item);
    const nextDestinationItems = upsertTransferEntry(normalizedDestinationItems, transferredEntry);

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
    transferEntry
  };
});
