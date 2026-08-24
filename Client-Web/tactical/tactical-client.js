const TacticalClient = (() => {
  function createClient(host) {
    const baseURL = host || window.location.origin;

    async function request(path) {
      const response = await fetch(new URL(path, baseURL), {
        credentials: 'include',
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Tactical request failed (${response.status})`);
      }

      return response.json();
    }

    return {
      host: baseURL,
      connect() {
        return Promise.resolve();
      },
      fetchMap() {
        return request('/tactical/map');
      },
      imageURL() {
        return new URL('/tactical/map/image', baseURL).toString();
      }
    };
  }

  return { createClient };
})();
