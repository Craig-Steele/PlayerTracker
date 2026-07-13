const TacticalClient = (() => {
  function createClient(host) {
    return {
      host,
      connect() {
        return Promise.resolve();
      }
    };
  }

  return { createClient };
})();
