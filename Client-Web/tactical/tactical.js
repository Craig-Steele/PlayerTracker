document.addEventListener('DOMContentLoaded', async () => {
  const status = document.querySelector('[data-tactical-status]');
  const canvas = document.querySelector('[data-tactical-canvas]');
  const resetButton = document.querySelector('[data-tactical-reset]');
  const characterSelect = document.querySelector('[data-tactical-character]');
  const tooltip = document.querySelector('[data-tactical-tooltip]');

  try {
    const client = TacticalClient.createClient(window.location.origin);
    const [map, tokens, session] = await Promise.all([
      client.fetchMap(),
      client.fetchTokens(),
      client.fetchPlayerSession()
    ]);
    const viewerId = session.player.id;
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
      onTap: async (clientX, clientY) => {
        const characterId = characterSelect.value;
        if (!characterId || tokens.some((token) => token.characterId === characterId)) return;
        const rect = canvas.getBoundingClientRect();
        const point = viewport.mapPointAt(clientX - rect.left, clientY - rect.top);
        if (!point) return;
        try {
          status.textContent = `Placing token at ${point.x}, ${point.y}…`;
          const token = await client.placeToken(characterId, point.x, point.y);
          tokens.push(token);
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
    const refreshTokens = async () => {
      const latestTokens = await client.fetchTokens();
      tokens.splice(0, tokens.length, ...latestTokens);
      viewport.draw();
      updateStatus();
    };
    client.subscribeToCampaignEvents(session.campaign.id, refreshTokens);
    updateStatus();
    resetButton.addEventListener('click', viewport.fit);
  } catch (error) {
    status.textContent = error.message;
    status.classList.add('tactical-error');
  }
});
