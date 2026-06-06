(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PlayerTrackerInventoryTarget = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeContainerId(value) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  function resolveInventoryDraftContainerId({
    selectedRowData = null,
    chosenContainerId = null,
    isContainer = false
  } = {}) {
    if (isContainer) {
      return null;
    }

    const chosen = normalizeContainerId(chosenContainerId);
    if (chosen) {
      return chosen;
    }

    if (selectedRowData && selectedRowData.isContainer) {
      return normalizeContainerId(selectedRowData.id);
    }

    return normalizeContainerId(selectedRowData?.containerId);
  }

  return {
    normalizeContainerId,
    resolveInventoryDraftContainerId
  };
});
