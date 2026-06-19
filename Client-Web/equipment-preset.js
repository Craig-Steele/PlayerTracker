(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PlayerTrackerEquipmentPreset = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeItemName(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }

  function findEquipmentPreset(itemName, equipmentLibraryItems = []) {
    const normalizedName = normalizeItemName(itemName);
    if (!normalizedName || !Array.isArray(equipmentLibraryItems)) {
      return null;
    }
    return equipmentLibraryItems.find(
      (item) => normalizeItemName(item?.name) === normalizedName
    ) || null;
  }

  function applyEquipmentPresetToInputs(inputs = {}, itemName, equipmentLibraryItems = []) {
    const preset = findEquipmentPreset(itemName, equipmentLibraryItems);
    if (!preset) {
      return false;
    }
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
    return true;
  }

  return {
    normalizeItemName,
    findEquipmentPreset,
    applyEquipmentPresetToInputs
  };
});
