/** Control plates inherit each game's tutorial palette and type. */
export function controllerPlate(tone, rows) {
  return `<section class="creator-control-plate" data-tone="${tone}" aria-label="Backbone controller controls">
    <p class="controller-caption">BACKBONE · CONTROLLER</p>
    <dl>${rows.map(([key, action]) => `<div class="controller-row"><dt class="controller-button">${key}</dt><dd class="controller-action">${action}</dd></div>`).join('')}</dl>
  </section>`;
}
