window.TacticalControls = {
  selectToken(tokenId) {
    window.TacticalState.selectedTokenId = tokenId;
    if (window.TacticalClientInstance) {
      window.TacticalClientInstance.selectToken(tokenId).catch(() => {});
    }
  },
  moveToken(tokenId, x, y, z = 0) {
    window.TacticalState.selectedTokenId = tokenId;
    if (window.TacticalClientInstance) {
      window.TacticalClientInstance.moveToken(tokenId, x, y, z).catch(() => {});
    }
  }
};
