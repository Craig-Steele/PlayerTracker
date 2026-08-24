document.addEventListener('DOMContentLoaded', async () => {
  const status = document.querySelector('[data-tactical-status]');
  const canvas = document.querySelector('[data-tactical-canvas]');
  const resetButton = document.querySelector('[data-tactical-reset]');

  try {
    const client = TacticalClient.createClient(window.location.origin);
    const map = await client.fetchMap();
    const image = new Image();
    image.src = client.imageURL();
    const viewport = TacticalRender.render({ canvas, map, image, status });
    resetButton.addEventListener('click', viewport.fit);
  } catch (error) {
    status.textContent = error.message;
    status.classList.add('tactical-error');
  }
});
