document.addEventListener('DOMContentLoaded', async () => {
  const status = document.querySelector('[data-tactical-status]');
  const indicatorOpacityInput = document.querySelector('[data-indicator-opacity]');
  const gridOpacityInput = document.querySelector('[data-grid-opacity]');
  const indicatorOpacityValue = document.querySelector('[data-indicator-opacity-value]');
  const gridOpacityValue = document.querySelector('[data-grid-opacity-value]');
  const indicatorOpacityKey = 'roll4-tactical-indicator-opacity';
  const gridOpacityKey = 'roll4-tactical-grid-opacity';
  let indicatorOpacity = 25;
  let gridOpacity = 60;
  try {
    const storedOpacity = localStorage.getItem(indicatorOpacityKey);
    const savedOpacity = Number(storedOpacity);
    if (storedOpacity !== null && Number.isInteger(savedOpacity) && savedOpacity >= 0 && savedOpacity <= 100) indicatorOpacity = savedOpacity;
    const storedGridOpacity = localStorage.getItem(gridOpacityKey);
    const savedGridOpacity = Number(storedGridOpacity);
    if (storedGridOpacity !== null && Number.isInteger(savedGridOpacity) && savedGridOpacity >= 0 && savedGridOpacity <= 100) gridOpacity = savedGridOpacity;
  } catch (_) {}
  indicatorOpacityInput.value = String(indicatorOpacity);
  gridOpacityInput.value = String(gridOpacity);
  indicatorOpacityValue.value = `${indicatorOpacity}%`;
  gridOpacityValue.value = `${gridOpacity}%`;
  const canvas = document.querySelector('[data-tactical-canvas]');
  const resetButton = document.querySelector('[data-tactical-reset]');
  const zoomButton = document.querySelector('[data-tactical-zoom]');
  const characterSelect = document.querySelector('[data-tactical-character]');
  const placementForm = document.querySelector('[data-tactical-placement-form]');
  const tooltip = document.querySelector('[data-tactical-tooltip]');

  try {
    const client = TacticalClient.createClient(window.location.origin);
    let map = await client.fetchMap();
    const [tokens, session, playerPlacement] = await Promise.all([
      client.fetchTokens(),
      client.fetchPlayerSession(),
      client.fetchPlayerPlacement()
    ]);
    const viewerId = session.player.id;
    if (placementForm && session.player.isReferee) placementForm.hidden = false;
    let encounterState = session.campaign?.encounterState || 'new';
    const characters = await client.fetchCharacters();
    for (const character of characters) {
      const option = document.createElement('option');
      option.value = character.id;
      option.textContent = character.name;
      characterSelect.appendChild(option);
    }
    const image = new Image();
    image.src = client.imageURL();
    const ownToken = () => tokens.find((token) => token.ownerId === viewerId);
    const updateStatus = () => {
      status.textContent = ownToken()
        ? `${map.grid.eastWestSquareCount} east-west × ${map.grid.northSouthSquareCount} north-south squares`
        : characters.length
          ? 'Select a character, then tap an open square to place its token.'
          : 'No claimed characters are available for placement.';
    };
    const viewport = TacticalRender.render({
      canvas,
      map,
      image,
      status,
      tokens,
      viewerId,
      viewerIsReferee: session.player.isReferee,
      playerPlacement: playerPlacement.bounds,
      hideEnemyTokens: !session.player.isReferee && encounterState === 'new',
      allowPlacementEdit: session.player.isReferee,
      indicatorOpacity: indicatorOpacity / 100,
      gridOpacity: gridOpacity / 100,
      onPlayerPlacementSelect: (bounds) => {
        ['west', 'east', 'south', 'north'].forEach((key) => {
          const field = placementForm?.querySelector(`[data-placement-${key}]`);
          if (field) field.value = bounds[key];
        });
        status.textContent = 'Placement area drawn. Press Apply to save it.';
      },
      tooltip,
      onTokenSelect: (token) => {
        viewport.setSelectedToken(token);
        status.textContent = token.displayName;
      },
      onTap: async (clientX, clientY) => {
        const characterId = characterSelect.value;
        if (!characterId || (encounterState !== 'new' && tokens.some((token) => token.characterId === characterId))) return;
        const rect = canvas.getBoundingClientRect();
        const point = viewport.mapPointAt(clientX - rect.left, clientY - rect.top);
        if (!point) return;
        try {
          status.textContent = `Placing token at ${point.x}, ${point.y}…`;
          const token = await client.placeToken(characterId, point.x, point.y);
          const existingIndex = tokens.findIndex((existing) => existing.id === token.id);
          if (existingIndex >= 0) tokens[existingIndex] = token;
          else tokens.push(token);
          viewport.draw();
          updateStatus();
        } catch (error) {
          status.textContent = error.message;
        }
      }
    });
    indicatorOpacityInput.addEventListener('input', () => {
      indicatorOpacity = Number(indicatorOpacityInput.value);
      indicatorOpacityValue.value = `${indicatorOpacity}%`;
      viewport.setIndicatorOpacity(indicatorOpacity / 100);
      try { localStorage.setItem(indicatorOpacityKey, String(indicatorOpacity)); } catch (_) {}
    });
    gridOpacityInput.addEventListener('input', () => {
      gridOpacity = Number(gridOpacityInput.value);
      gridOpacityValue.value = `${gridOpacity}%`;
      viewport.setGridOpacity(gridOpacity / 100);
      try { localStorage.setItem(gridOpacityKey, String(gridOpacity)); } catch (_) {}
    });
    client.subscribeToEvents((updatedToken) => {
      const index = tokens.findIndex((token) => token.id === updatedToken.id);
      if (index >= 0) {
        tokens[index] = updatedToken;
      } else {
        tokens.push(updatedToken);
      }
      viewport.draw();
      updateStatus();
    });
    const refreshMapAndTokens = async () => {
      const [latestMap, latestTokens, latestPlayerPlacement] = await Promise.all([
        client.fetchMap(),
        client.fetchTokens(),
        client.fetchPlayerPlacement()
      ]);
      map = latestMap;
      tokens.splice(0, tokens.length, ...latestTokens);
      const latestImage = new Image();
      latestImage.src = client.imageURL(Date.now().toString());
      viewport.updateMap(map, latestImage);
      viewport.setPlayerPlacement(latestPlayerPlacement.bounds);
      viewport.draw();
      updateStatus();
    };
    client.subscribeToCampaignEvents(session.campaign.id, (snapshot) => {
      if (snapshot?.campaign?.encounterState) encounterState = snapshot.campaign.encounterState;
      viewport.setHideEnemyTokens(!session.player.isReferee && encounterState === 'new');
      return refreshMapAndTokens();
    });
    updateStatus();
    resetButton.addEventListener('click', viewport.fit);
    if (placementForm) {
      const fields = ['west', 'east', 'south', 'north'].map((key) => placementForm.querySelector(`[data-placement-${key}]`));
      fields.forEach((field, index) => {
        const key = ['west', 'east', 'south', 'north'][index];
        if (field && playerPlacement.bounds?.[key] !== undefined) field.value = playerPlacement.bounds[key];
      });
      placementForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          const bounds = Object.fromEntries(fields.map((field, index) => [
            ['west', 'east', 'south', 'north'][index], Number.parseInt(field.value, 10)
          ]));
          const updated = await client.updatePlayerPlacement(bounds);
          viewport.setPlayerPlacement(updated.bounds);
          status.textContent = 'Player placement area updated.';
        } catch (error) {
          status.textContent = error.message;
        }
      });
      placementForm.querySelector('[data-placement-draw]')?.addEventListener('click', () => {
        viewport.setPlacementDrawMode(true);
        status.textContent = 'Drag across the map to define the player placement area.';
      });
      placementForm.querySelector('[data-placement-default]')?.addEventListener('click', async () => {
        try {
          const updated = await client.updatePlayerPlacement(null, true);
          viewport.setPlayerPlacement(updated.bounds);
          status.textContent = 'Using the map default placement area.';
        } catch (error) {
          status.textContent = error.message;
        }
      });
    }
    zoomButton.addEventListener('click', () => {
      const characterId = characterSelect.value;
      const token = tokens.find((candidate) => candidate.characterId === characterId &&
        (!candidate.isHidden || session.player.isReferee));
      if (!token) {
        status.textContent = 'The selected character does not have a visible token.';
        return;
      }
      viewport.zoomToToken(token);
      status.textContent = `Centered on ${token.displayName}`;
    });
  } catch (error) {
    status.textContent = error.message;
    status.classList.add('tactical-error');
  }
});
