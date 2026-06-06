(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PlayerTrackerInventoryRemoval = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeInventoryEntry(entry = {}) {
    return {
      id: typeof entry.id === 'string' ? entry.id.trim() : '',
      name: typeof entry.name === 'string' ? entry.name : '',
      quantity: Number.isFinite(entry.quantity) ? entry.quantity : 1,
      value: Number.isFinite(entry.value) ? entry.value : 0,
      weight: Number.isFinite(entry.weight) ? entry.weight : 0,
      url: typeof entry.url === 'string' && entry.url.trim() ? entry.url.trim() : null,
      containerId: typeof entry.containerId === 'string' && entry.containerId.trim()
        ? entry.containerId.trim()
        : null,
      isContainer: Boolean(entry.isContainer)
    };
  }

  function removeInventoryEntry(items = [], entryId, options = {}) {
    const normalizedId = typeof entryId === 'string' ? entryId.trim() : '';
    const moveContainedItems = Boolean(options.moveContainedItems);
    if (!normalizedId) {
      return Array.isArray(items) ? items.map((item) => normalizeInventoryEntry(item)) : [];
    }

    const normalizedItems = Array.isArray(items)
      ? items.map((item) => normalizeInventoryEntry(item))
      : [];

    const targetExists = normalizedItems.some((item) => item.id === normalizedId);
    if (!targetExists) {
      return normalizedItems;
    }

    if (moveContainedItems) {
      return normalizedItems
        .filter((item) => item.id !== normalizedId)
        .map((item) =>
          item.containerId === normalizedId
            ? { ...item, containerId: null }
            : item
        );
    }

    const removedIds = new Set([normalizedId]);
    let changed = true;
    while (changed) {
      changed = false;
      normalizedItems.forEach((item) => {
        if (item.containerId && removedIds.has(item.containerId) && !removedIds.has(item.id)) {
          removedIds.add(item.id);
          changed = true;
        }
      });
    }

    return normalizedItems.filter((item) => !removedIds.has(item.id));
  }

  return {
    normalizeInventoryEntry,
    removeInventoryEntry
  };
});
