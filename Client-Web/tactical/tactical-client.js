const TacticalClient = (() => {
  function createClient(host) {
    return {
      host,
      connect() {
        return Promise.resolve();
      },
      async fetchMap() {
        const response = await fetch(new URL('/tactical/map', host), {
          credentials: 'include'
        });
        if (!response.ok) {
          throw new Error(`Failed to load tactical map: ${response.status}`);
        }
        return response.json();
      },
      async fetchEncounter() {
        const response = await fetch(new URL('/tactical/encounter', host), {
          credentials: 'include'
        });
        if (!response.ok) {
          throw new Error(`Failed to load tactical encounter: ${response.status}`);
        }
        return response.json();
      },
      async sendCommand(type, payload) {
        const response = await fetch(new URL('/tactical/command', host), {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            schemaVersion: 1,
            type,
            payload
          })
        });
        if (!response.ok) {
          throw new Error(`Tactical command failed: ${response.status}`);
        }
        return response.json();
      },
      async moveToken(tokenId, squareX, squareY, z = 0) {
        return this.sendCommand('move-token', {
          tokenId,
          squareX: String(squareX),
          squareY: String(squareY),
          z: String(z)
        });
      },
      async selectToken(tokenId) {
        return this.sendCommand('select-token', {
          tokenId
        });
      }
    };
  }

  return { createClient };
})();
