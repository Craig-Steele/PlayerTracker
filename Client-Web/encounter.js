(function () {
  function normalizeConditionEntry(entry) {
    if (!entry || typeof entry.name !== 'string') {
      return null;
    }

    const trimmedName = entry.name.trim();
    if (!trimmedName) {
      return null;
    }

    const explicitLink =
      typeof entry.description === 'string' && entry.description.trim()
        ? entry.description.trim()
        : null;

    return {
      name: trimmedName,
      link: explicitLink
    };
  }

  function createConditionLink(url) {
    if (!url) return null;
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    anchor.classList.add('condition-link');
    anchor.textContent = '↗';
    anchor.title = 'Open rule text in a new tab';
    return anchor;
  }

  function formatEncounterActorLabel(player) {
    if (!player || !player.name) return null;
    const ownerName = typeof player.ownerName === 'string' ? player.ownerName.trim() : '';
    return ownerName ? `${player.name} (${ownerName})` : player.name;
  }

  function formatEncounterStateText(encounterState, round = 1, currentTurnPlayer = null) {
    const currentTurnLabel = formatEncounterActorLabel(currentTurnPlayer);
    if (encounterState === 'active') {
      return currentTurnLabel ? `Round ${round}: ${currentTurnLabel}` : `Round ${round}`;
    }
    if (encounterState === 'suspended') {
      return 'Encounter: Suspended';
    }
    return 'Encounter: New';
  }

  function healthStatusLabel(ratio, isDead) {
    if (isDead) {
      return 'Dead';
    }
    if (ratio === 1) {
      return 'Full';
    } else if (ratio > 0.75) {
      return 'Slight Damage';
    } else if (ratio > 0.5) {
      return 'Some Damage';
    } else if (ratio > 0.25) {
      return 'Bloodied';
    }
    return 'Heavily Bloodied';
  }

  function orderedEncounterStats(stats, statKeys) {
    const sourceStats = Array.isArray(stats) ? stats : [];
    const preferredKeys = Array.isArray(statKeys) ? statKeys : [];
    const ordered = preferredKeys
      .map((key) => sourceStats.find((stat) => stat.key === key))
      .filter(Boolean);
    return ordered.length > 0 ? ordered : sourceStats;
  }

  function encounterStatusInfo(stats, statKeys) {
    const source = orderedEncounterStats(stats, statKeys).filter((stat) => stat.key !== 'TempHP');
    if (source.length === 0) return null;
    const totals = source.reduce(
      (acc, stat) => {
        if (Number.isFinite(stat.current)) acc.current += stat.current;
        if (Number.isFinite(stat.max)) acc.max += stat.max;
        return acc;
      },
      { current: 0, max: 0 }
    );
    if (totals.max <= 0) return null;
    return {
      ratio: totals.current / totals.max,
      isDead: totals.current <= 0
    };
  }

  function applyEncounterHealthClasses(cell, statusInfo) {
    if (!cell || !statusInfo) return;
    cell.classList.add('hp-cell');
    if (statusInfo.isDead) {
      cell.classList.add('hp-dead');
    } else if (statusInfo.ratio === 1) {
      cell.classList.add('hp-blue');
    } else if (statusInfo.ratio > 0.75) {
      cell.classList.add('hp-green');
    } else if (statusInfo.ratio > 0.5) {
      cell.classList.add('hp-yellow');
    } else if (statusInfo.ratio > 0.25) {
      cell.classList.add('hp-orange');
    } else {
      cell.classList.add('hp-red');
    }
  }

  function formatEncounterStatsText(stats, statKeys) {
    const displayStats = orderedEncounterStats(stats, statKeys);
    const visibleStats = displayStats.filter(
      (stat) => stat.key !== 'TempHP' || Number(stat.current) > 0
    );
    const source = visibleStats.length > 0 ? visibleStats : displayStats;
    return source
      .map((stat) =>
        stat.key === 'TempHP'
          ? `${stat.key} ${stat.current}`
          : `${stat.key} ${stat.current}/${stat.max}`
      )
      .join(' • ');
  }

  function buildEncounterConditionsList(conditionNames, conditionLookup) {
    if (!Array.isArray(conditionNames) || conditionNames.length === 0) return null;
    const list = document.createElement('div');
    list.classList.add('player-conditions');
    conditionNames.forEach((conditionName, index) => {
      if (index > 0) {
        list.appendChild(document.createTextNode(', '));
      }
      const entry = conditionLookup instanceof Map ? conditionLookup.get(conditionName) : null;
      const conditionNode = document.createElement(entry && entry.link ? 'a' : 'span');
      conditionNode.textContent = conditionName;
      if (entry && entry.link) {
        conditionNode.href = entry.link;
        conditionNode.target = '_blank';
        conditionNode.rel = 'noopener';
        conditionNode.classList.add('condition-link');
      }
      list.appendChild(conditionNode);
    });
    return list;
  }

  function createEmptyEncounterRow(colSpan, text = '(no players yet)') {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = colSpan;
    td.textContent = text;
    tr.appendChild(td);
    return tr;
  }

  window.PlayerTrackerEncounter = {
    normalizeConditionEntry,
    createConditionLink,
    formatEncounterActorLabel,
    formatEncounterStateText,
    healthStatusLabel,
    orderedEncounterStats,
    encounterStatusInfo,
    applyEncounterHealthClasses,
    formatEncounterStatsText,
    buildEncounterConditionsList,
    createEmptyEncounterRow
  };
})();
