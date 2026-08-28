document.addEventListener('DOMContentLoaded', async () => {
  const status = document.querySelector('[data-tactical-status]');
  const canvas = document.querySelector('[data-tactical-canvas]');
  const resetButton = document.querySelector('[data-tactical-reset]');
  const zoomButton = document.querySelector('[data-tactical-zoom]');
  const characterSelect = document.querySelector('[data-tactical-character]');
  const tooltip = document.querySelector('[data-tactical-tooltip]');

  try {
    const client = TacticalClient.createClient(window.location.origin);
    let map = await client.fetchMap();
    const [tokens, session] = await Promise.all([
      client.fetchTokens(),
      client.fetchPlayerSession()
    ]);
    const viewerId = session.player.id;
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
      const [latestMap, latestTokens] = await Promise.all([
        client.fetchMap(),
        client.fetchTokens()
      ]);
      map = latestMap;
      tokens.splice(0, tokens.length, ...latestTokens);
      const latestImage = new Image();
      latestImage.src = client.imageURL(Date.now().toString());
      viewport.updateMap(map, latestImage);
      viewport.draw();
      updateStatus();
    };
    client.subscribeToCampaignEvents(session.campaign.id, (snapshot) => {
      if (snapshot?.campaign?.encounterState) encounterState = snapshot.campaign.encounterState;
      return refreshMapAndTokens();
    });
    updateStatus();
    resetButton.addEventListener('click', viewport.fit);
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
