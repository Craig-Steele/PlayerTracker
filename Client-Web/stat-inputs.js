(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PlayerTrackerStatInputs = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeNumber(raw) {
    if (raw === null || raw === undefined) {
      return NaN;
    }
    const trimmed = String(raw).trim();
    if (!trimmed) {
      return NaN;
    }
    return Number(trimmed);
  }

  function collectStatPayloadFromInputs(statEntries, fallbackStats = [], options = {}) {
    const { allowNegativeHealth = false } = options;
    const fallbackByKey = new Map(
      Array.isArray(fallbackStats)
        ? fallbackStats
            .filter((stat) => stat && typeof stat.key === 'string')
            .map((stat) => [stat.key, stat])
        : []
    );
    const payload = [];

    for (const [key, entry] of statEntries || []) {
      const existing = fallbackByKey.get(key) || {};
      const isTempHp = key === 'TempHP';
      const currentRaw = entry?.currentInput?.value ?? '';
      const maxRaw = entry?.maxInput?.value ?? '';

      const maxFallback = isTempHp
        ? 0
        : Number.isFinite(existing.max)
          ? existing.max
          : NaN;
      const currentFallback = Number.isFinite(existing.current)
        ? existing.current
        : (isTempHp ? 0 : maxFallback);

      const maxValue = isTempHp
        ? 0
        : (String(maxRaw).trim() === '' ? maxFallback : normalizeNumber(maxRaw));
      if (!isTempHp && (!Number.isFinite(maxValue) || maxValue <= 0)) {
        throw new Error(`Max ${key} must be greater than 0.`);
      }

      const currentValue = String(currentRaw).trim() === '' ? currentFallback : normalizeNumber(currentRaw);
      if (!Number.isFinite(currentValue)) {
        throw new Error(`${key} current value must be a valid number.`);
      }

      if (isTempHp) {
        if (currentValue < 0) {
          throw new Error('TempHP current must be 0 or greater.');
        }
      } else {
        if (!allowNegativeHealth && currentValue < 0) {
          throw new Error(`${key} current must be between 0 and Max.`);
        }
        if (currentValue > maxValue) {
          throw new Error(`${key} current must be less than or equal to Max.`);
        }
      }

      payload.push({
        key,
        current: currentValue,
        max: isTempHp ? 0 : maxValue
      });
    }

    return payload;
  }

  return {
    collectStatPayloadFromInputs
  };
});
