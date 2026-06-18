(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PlayerTrackerAddForm = api;
  }

  if (typeof document !== 'undefined') {
    const renderAll = () => {
      document.querySelectorAll('[data-add-form-type]').forEach((host) => {
        api.renderAddForm(host);
      });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', renderAll, { once: true });
    } else {
      renderAll();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createLabel(text, input) {
    const label = document.createElement('label');
    label.className = 'property-row';
    const labelText = document.createElement('span');
    labelText.className = 'property-label';
    labelText.textContent = text;
    const control = document.createElement('span');
    control.className = 'property-control';
    control.appendChild(input);
    label.appendChild(labelText);
    label.appendChild(control);
    return label;
  }

  function createInputField({ id, type, placeholder, min, step, list, value }) {
    const input = document.createElement('input');
    input.id = id;
    input.type = type;
    if (placeholder) input.placeholder = placeholder;
    if (min != null) input.min = String(min);
    if (step != null) input.step = String(step);
    if (list) input.setAttribute('list', list);
    if (value != null) input.value = value;
    return input;
  }

  function createSelectField(id, options = []) {
    const select = document.createElement('select');
    select.id = id;
    options.forEach((option) => {
      const optionEl = document.createElement('option');
      optionEl.value = option.value;
      optionEl.textContent = option.label;
      if (option.selected) {
        optionEl.selected = true;
      }
      select.appendChild(optionEl);
    });
    return select;
  }

  function buildAddFormConfig(formType) {
    if (formType === 'inventory') {
      return {
        id: 'inventory-add-form',
        titleId: 'inventory-add-form-title',
        title: 'Add Item',
        gridClass: 'inventory-inline-form-grid',
        buttonClass: 'party-treasure-inline-actions',
        saveId: 'inventory-add-form-save',
        cancelId: 'inventory-add-form-cancel',
        fields: [
          {
            kind: 'select',
            id: 'inventory-add-kind-row',
            label: 'Type',
            controlId: 'inventory-add-kind',
            options: [
              { value: 'item', label: 'Add Item', selected: true },
              { value: 'container', label: 'Add Container' }
            ]
          },
          { kind: 'input', id: 'inventory-add-name', label: 'Item', type: 'text', list: 'inventory-item-options', placeholder: 'Item name' },
          { kind: 'select', id: 'inventory-add-container-row', label: 'Container', controlId: 'inventory-add-container-id' },
          { kind: 'input', id: 'inventory-add-quantity', label: 'Qty', type: 'number', min: 1, value: '1' },
          { kind: 'input', id: 'inventory-add-value', label: 'Value', type: 'number', step: '0.01', value: '0' },
          { kind: 'input', id: 'inventory-add-weight', label: 'Weight', type: 'number', step: 'any', value: '0' },
          { kind: 'input', id: 'inventory-add-url', label: 'Link', type: 'url', placeholder: 'Optional link' }
        ],
        cancelText: '✖️ Cancel',
        saveText: '🗡 Add Item'
      };
    }

    return {
      id: 'party-treasure-add-form',
      titleId: 'party-treasure-add-form-title',
      title: 'Add Item',
      gridClass: 'inventory-inline-form-grid',
      buttonClass: 'party-treasure-inline-actions',
      saveId: 'party-treasure-add-form-save',
      cancelId: 'party-treasure-add-form-cancel',
      fields: [
        { kind: 'input', id: 'party-treasure-add-name', label: 'Item', type: 'text', list: 'party-treasure-item-options', placeholder: 'Item name' },
        { kind: 'input', id: 'party-treasure-add-quantity', label: 'Qty', type: 'number', min: 1, value: '1' },
        { kind: 'input', id: 'party-treasure-add-value', label: 'Value', type: 'number', step: '0.01', value: '0' },
        { kind: 'input', id: 'party-treasure-add-weight', label: 'Weight', type: 'number', step: 'any', value: '0' },
        { kind: 'input', id: 'party-treasure-add-url', label: 'Link', type: 'url', placeholder: 'Optional link' }
      ],
      cancelText: '✖️ Cancel',
      saveText: '➕ Add Item'
    };
  }

  function renderAddForm(hostEl) {
    if (!hostEl || hostEl.dataset.addFormRendered === 'true') return hostEl;
    const formType = hostEl.dataset.addFormType || 'party-treasure';
    const config = buildAddFormConfig(formType);
    const form = document.createElement('div');
    form.id = config.id;
    form.className = 'inventory-inline-form hidden';
    form.setAttribute('aria-hidden', 'true');

    const title = document.createElement('div');
    title.id = config.titleId;
    title.className = 'inventory-inline-form-title';
    title.textContent = config.title;
    form.appendChild(title);

    const grid = document.createElement('div');
    grid.className = config.gridClass;
    config.fields.forEach((field) => {
      if (field.kind === 'input') {
        const input = createInputField(field);
        grid.appendChild(createLabel(field.label, input));
        return;
      }
      if (field.kind === 'select') {
        const select = createSelectField(field.controlId, field.options);
        grid.appendChild(createLabel(field.label, select));
      }
    });
    form.appendChild(grid);

    const actions = document.createElement('div');
    actions.className = config.buttonClass;
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.id = config.cancelId;
    cancel.className = 'secondary';
    cancel.textContent = config.cancelText;
    const save = document.createElement('button');
    save.type = 'button';
    save.id = config.saveId;
    save.textContent = config.saveText;
    actions.appendChild(cancel);
    actions.appendChild(save);
    form.appendChild(actions);

    hostEl.replaceChildren(form);
    hostEl.dataset.addFormRendered = 'true';
    return form;
  }

  return {
    buildAddFormConfig,
    renderAddForm
  };
});
