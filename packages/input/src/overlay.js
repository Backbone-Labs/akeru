import {
  GAMEPAD_AXES,
  GAMEPAD_BUTTONS,
  LOGICAL_AXES,
  LOGICAL_BUTTONS,
} from './normalize.js';

const touchButtons = [
  ['dpadUp', 'Up'],
  ['dpadLeft', 'Left'],
  ['dpadDown', 'Down'],
  ['dpadRight', 'Right'],
  ['east', 'Cancel'],
  ['south', 'Confirm'],
  ['start', 'Menu'],
];

function element(document, tag, attributes = {}, text = '') {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'className') node.className = value;
    else if (name === 'type' || name === 'value') node[name] = value;
    else node.setAttribute(name, value);
  }
  if (text) node.textContent = text;
  return node;
}

export function createInputUi({
  document,
  touchRoot,
  controlsRoot,
  preferences,
  onTouch,
  onDeadzone,
  onController,
  onGamepadMapping,
  onReset,
}) {
  if (!document?.createElement || !touchRoot?.appendChild)
    throw new TypeError('A touch root is required');
  const removers = [];
  const listen = (target, type, listener) => {
    target.addEventListener(type, listener);
    removers.push(() => target.removeEventListener(type, listener));
  };
  const touch = element(document, 'div', {
    className: 'akeru-touch-controls',
    role: 'group',
    'aria-label': 'Game controls',
  });
  if (touch.style) touch.style.touchAction = 'none';
  for (const [control, label] of touchButtons) {
    const button = element(
      document,
      'button',
      {
        className: `akeru-touch-${control}`,
        type: 'button',
        'data-control': control,
        'aria-label': label,
      },
      label,
    );
    if (button.style) button.style.touchAction = 'none';
    const begin = (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      onTouch('start', control, event.pointerId);
    };
    const end = (event) => {
      event.preventDefault();
      onTouch('end', control, event.pointerId);
    };
    listen(button, 'pointerdown', begin);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      listen(button, type, end);
    touch.appendChild(button);
  }
  touchRoot.appendChild(touch);

  let overlay = null;
  let controllerSelect = null;
  let deadzoneInput = null;
  const mappingSelects = [];
  if (controlsRoot?.appendChild) {
    overlay = element(document, 'section', {
      className: 'akeru-control-settings',
      role: 'dialog',
      'aria-label': 'Control settings',
      'aria-modal': 'false',
    });
    overlay.hidden = true;
    const heading = element(document, 'h2', {}, 'Control settings');
    overlay.appendChild(heading);
    const controllerLabel = element(document, 'label', {}, 'Controller ');
    controllerSelect = element(document, 'select', {
      'aria-label': 'Controller',
    });
    controllerLabel.appendChild(controllerSelect);
    overlay.appendChild(controllerLabel);
    listen(controllerSelect, 'change', () =>
      onController(
        controllerSelect.value === 'auto'
          ? null
          : Number(controllerSelect.value),
      ),
    );
    const deadzoneLabel = element(document, 'label', {}, 'Stick deadzone ');
    deadzoneInput = element(document, 'input', {
      type: 'range',
      min: '0',
      max: '0.5',
      step: '0.01',
      value: String(preferences.deadzone),
      'aria-label': 'Stick deadzone',
    });
    deadzoneLabel.appendChild(deadzoneInput);
    overlay.appendChild(deadzoneLabel);
    listen(deadzoneInput, 'input', () =>
      onDeadzone(Number(deadzoneInput.value)),
    );

    const mappingGroup = element(document, 'fieldset');
    mappingGroup.appendChild(
      element(document, 'legend', {}, 'Controller mapping'),
    );
    const addMapping = (kind, action, sourceNames) => {
      const label = element(document, 'label', {}, `${action} `);
      const select = element(document, 'select', {
        'aria-label': `${action} control`,
        'data-kind': kind,
        'data-action': action,
      });
      select.appendChild(
        element(document, 'option', { value: '' }, 'Unassigned'),
      );
      for (const source of sourceNames)
        select.appendChild(
          element(document, 'option', { value: source }, source),
        );
      label.appendChild(select);
      mappingGroup.appendChild(label);
      mappingSelects.push(select);
      listen(select, 'change', () => {
        if (select.value)
          for (const other of mappingSelects)
            if (
              other !== select &&
              other.dataset.kind === kind &&
              other.value === select.value
            )
              other.value = '';
        const mapping = { buttons: {}, axes: {} };
        for (const kindName of ['buttons', 'axes'])
          for (const [source, target] of Object.entries(
            preferences.mappings.gamepad[kindName],
          )) {
            const baseline =
              kindName === 'buttons' ? LOGICAL_BUTTONS : LOGICAL_AXES;
            if (!baseline.includes(target)) mapping[kindName][source] = target;
          }
        for (const item of mappingSelects)
          if (item.value)
            mapping[item.dataset.kind][item.value] = item.dataset.action;
        onGamepadMapping(mapping);
      });
    };
    for (const action of LOGICAL_BUTTONS)
      addMapping('buttons', action, GAMEPAD_BUTTONS);
    for (const action of LOGICAL_AXES) addMapping('axes', action, GAMEPAD_AXES);
    overlay.appendChild(mappingGroup);
    const reset = element(
      document,
      'button',
      { type: 'button' },
      'Reset controls',
    );
    listen(reset, 'click', onReset);
    overlay.appendChild(reset);
    controlsRoot.appendChild(overlay);
  }

  const update = (nextPreferences, controllers) => {
    preferences = nextPreferences;
    if (deadzoneInput) deadzoneInput.value = String(preferences.deadzone);
    if (controllerSelect) {
      controllerSelect.replaceChildren(
        element(document, 'option', { value: 'auto' }, 'Automatic'),
      );
      for (const controller of controllers)
        controllerSelect.appendChild(
          element(
            document,
            'option',
            { value: String(controller.index) },
            `Controller ${controller.index + 1}`,
          ),
        );
      if (
        preferences.selectedController !== null &&
        !controllers.some(
          (controller) => controller.index === preferences.selectedController,
        )
      )
        controllerSelect.appendChild(
          element(
            document,
            'option',
            { value: String(preferences.selectedController) },
            `Controller ${preferences.selectedController + 1} (disconnected)`,
          ),
        );
      controllerSelect.value =
        preferences.selectedController === null
          ? 'auto'
          : String(preferences.selectedController);
    }
    for (const select of mappingSelects) {
      const entries = Object.entries(
        preferences.mappings.gamepad[select.dataset.kind],
      );
      select.value =
        entries.find(([, action]) => action === select.dataset.action)?.[0] ??
        '';
    }
  };
  update(preferences, []);

  return Object.freeze({
    show() {
      if (overlay) overlay.hidden = false;
    },
    hide() {
      if (overlay) overlay.hidden = true;
    },
    update,
    unmount() {
      for (const remove of removers.splice(0)) remove();
      touch.remove();
      overlay?.remove();
    },
  });
}
