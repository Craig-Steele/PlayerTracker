(function () {
  const QR_CODE_SIZE = 96;

  function parseStandardDie(spec) {
    if (typeof spec !== 'string') return null;
    const match = spec.trim().match(/^(\d+)d(\d+)$/i);
    if (!match) return null;
    const count = Number(match[1]);
    const sides = Number(match[2]);
    if (!Number.isInteger(count) || !Number.isInteger(sides) || count <= 0 || sides <= 0) {
      return null;
    }
    return { count, sides };
  }

  function rollStandardDie(spec, bonus) {
    const parsed = parseStandardDie(spec);
    if (!parsed) return null;
    let total = 0;
    for (let index = 0; index < parsed.count; index += 1) {
      total += Math.floor(Math.random() * parsed.sides) + 1;
    }
    return total + (Number.isFinite(bonus) ? bonus : 0);
  }

  function formatInitiative(value) {
    if (!Number.isFinite(value)) return 'X';
    return Number.isInteger(value) ? String(value) : String(value);
  }

  window.PlayerTrackerShared = {
    QR_CODE_SIZE,
    parseStandardDie,
    rollStandardDie,
    formatInitiative
  };
})();
