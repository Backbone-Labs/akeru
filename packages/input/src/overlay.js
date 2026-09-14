import {
  GAMEPAD_AXES,
  GAMEPAD_BUTTONS,
  LOGICAL_AXES,
  LOGICAL_BUTTONS,
} from './normalize.js';

const sourceLabels = {
  south: 'A · South',
  east: 'B · East',
  west: 'X · West',
  north: 'Y · North',
  leftShoulder: 'LB',
  rightShoulder: 'RB',
  leftTrigger: 'LT',
  rightTrigger: 'RT',
  select: 'View',
  start: 'Menu',
  leftStick: 'Left stick press',
  rightStick: 'Right stick press',
  dpadUp: 'D-pad ↑',
  dpadDown: 'D-pad ↓',
  dpadLeft: 'D-pad ←',
  dpadRight: 'D-pad →',
  home: 'Home',
  leftX: 'Left stick ↔',
  leftY: 'Left stick ↕',
  rightX: 'Right stick ↔',
  rightY: 'Right stick ↕',
};
const actionLabels = {
  confirm: 'Primary action',
  cancel: 'Back / secondary',
  menu: 'Pause / menu',
  up: 'Move up',
  down: 'Move down',
  left: 'Move left',
  right: 'Move right',
  moveX: 'Move horizontally',
  moveY: 'Move vertically',
  lookX: 'Look horizontally',
  lookY: 'Look vertically',
};
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
  const liveButtons = [],
    liveAxes = [];
  let inputStatus,
    capture = null,
    neutralSeen = false;
  const stopCapture = () => {
    if (capture) capture.button.textContent = 'Press to assign';
    capture = null;
    neutralSeen = false;
  };
  const applySelection = (select) => {
    if (select.value)
      for (const other of mappingSelects)
        if (
          other !== select &&
          other.dataset.kind === select.dataset.kind &&
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
  };
  if (controlsRoot?.appendChild) {
    overlay = element(document, 'section', {
      className: 'akeru-control-settings',
      role: 'dialog',
      'aria-label': 'Control settings',
      'aria-modal': 'false',
    });
    overlay.hidden = true;
    const top = element(document, 'div', { className: 'control-panel-header' });
    const intro = element(document, 'div');
    intro.appendChild(
      element(document, 'p', { className: 'eyebrow' }, 'PLAY YOUR WAY'),
    );
    intro.appendChild(
      element(document, 'h2', {}, 'Your controller. Your rules.'),
    );
    intro.appendChild(
      element(
        document,
        'p',
        { className: 'control-panel-description' },
        'Test your inputs, then make this game feel right. Changes save automatically for this game.',
      ),
    );
    const close = element(
      document,
      'button',
      {
        type: 'button',
        'aria-label': 'Close control settings',
        className: 'control-close',
      },
      'Done',
    );
    listen(close, 'click', () => {
      stopCapture();
      overlay.hidden = true;
    });
    top.appendChild(intro);
    top.appendChild(close);
    overlay.appendChild(top);
    const tester = element(document, 'section', {
      className: 'controller-tester',
      'aria-label': 'Live controller test',
    });
    inputStatus = element(
      document,
      'p',
      { className: 'controller-test-status', role: 'status' },
      'Press a controller button to check your connection.',
    );
    tester.appendChild(inputStatus);
    tester.appendChild(
      element(
        document,
        'p',
        { className: 'fine' },
        'Pair through your device’s Bluetooth settings first. These indicators show live inputs detected by this browser.',
      ),
    );
    const diagram = element(document, 'div', {
      className: 'controller-button-display',
    });
    for (const source of GAMEPAD_BUTTONS) {
      const button = element(
        document,
        'span',
        { className: 'live-controller-button', 'data-source': source },
        sourceLabels[source],
      );
      diagram.appendChild(button);
      liveButtons.push([source, button]);
    }
    tester.appendChild(diagram);
    const sticks = element(document, 'div', {
      className: 'controller-axis-display',
    });
    for (const source of GAMEPAD_AXES) {
      const label = element(document, 'label', {}, sourceLabels[source]);
      const meter = element(document, 'meter', {
        min: '-1',
        max: '1',
        value: '0',
        'aria-label': sourceLabels[source],
      });
      label.appendChild(meter);
      sticks.appendChild(label);
      liveAxes.push([source, meter]);
    }
    tester.appendChild(sticks);
    overlay.appendChild(tester);
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

    const mappingGroup = element(document, 'fieldset', {
      className: 'controller-mapping-grid',
    });
    mappingGroup.appendChild(
      element(document, 'legend', {}, 'Controller mapping'),
    );
    const addMapping = (kind, action, sourceNames) => {
      const label = element(document, 'label', { className: 'mapping-row' });
      label.appendChild(
        element(
          document,
          'span',
          { className: 'mapping-action' },
          actionLabels[action] ?? action,
        ),
      );
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
          element(
            document,
            'option',
            { value: source },
            sourceLabels[source] ?? source,
          ),
        );
      label.appendChild(select);
      mappingGroup.appendChild(label);
      mappingSelects.push(select);
      listen(select, 'change', () => applySelection(select));
      if (kind === 'buttons') {
        const assign = element(
          document,
          'button',
          {
            type: 'button',
            className: 'assign-control',
            'aria-label': `Assign ${actionLabels[action] ?? action}`,
          },
          'Press to assign',
        );
        listen(assign, 'click', () => {
          const cancel = capture?.select === select;
          stopCapture();
          if (!cancel) {
            capture = { select, button: assign };
            assign.textContent = 'Release buttons, then press…';
          }
        });
        label.appendChild(assign);
      }
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
      stopCapture();
      if (overlay) overlay.hidden = true;
    },
    update,
    updateInput(raw, identity) {
      if (!overlay || overlay.hidden) return;
      const connected = !!raw;
      const message = connected
        ? /backbone/i.test(identity ?? '')
          ? 'Backbone detected · live input'
          : 'Controller detected · live input'
        : 'No controller detected. Pair it, then press a button.';
      if (inputStatus.textContent !== message)
        inputStatus.textContent = message;
      for (const [source, button] of liveButtons)
        button.setAttribute(
          'data-active',
          String((raw?.buttons[source] ?? 0) > 0.5),
        );
      for (const [source, meter] of liveAxes)
        meter.value = raw?.axes[source] ?? 0;
      if (capture && raw) {
        const pressed = GAMEPAD_BUTTONS.filter(
          (source) => (raw.buttons[source] ?? 0) > 0.5,
        );
        if (!pressed.length) neutralSeen = true;
        else if (neutralSeen) {
          const select = capture.select;
          select.value = pressed[0];
          stopCapture();
          applySelection(select);
        }
      }
    },
    unmount() {
      for (const remove of removers.splice(0)) remove();
      touch.remove();
      overlay?.remove();
    },
  });
}
