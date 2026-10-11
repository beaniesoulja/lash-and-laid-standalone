(() => {
  const form = document.querySelector('#bookingForm');
  const input = document.querySelector('#phoneNational');
  const toggle = document.querySelector('#countryToggle');
  const panel = document.querySelector('#countryPanel');
  const search = document.querySelector('#countrySearch');
  const list = document.querySelector('#countryList');
  const results = document.querySelector('#countryResults');
  const lib = window.libphonenumber;
  if (!form || !input) return;
  if (!lib) {
    input.setCustomValidity('The country-code tool could not load. Please reload the page.');
    return;
  }
  let selected = 'EG';
  let highlighted = -1;
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const flag = code => String.fromCodePoint(...[...code].map(c => 127397 + c.charCodeAt(0)));
  const countries = lib.getCountries().map(code => ({ code, name: names.of(code), dial: '+' + lib.getCountryCallingCode(code), flag: flag(code) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  let visible = countries;
  function closePicker() {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    search.setAttribute('aria-expanded', 'false');
    search.removeAttribute('aria-activedescendant');
  }
  function selectCountry(code) {
    selected = code;
    const country = countries.find(c => c.code === code);
    toggle.querySelector('[data-country-flag]').textContent = country.flag;
    toggle.querySelector('[data-country-code]').textContent = country.dial;
    toggle.setAttribute('aria-label', `Country code: ${country.name} ${country.dial}`);
  }
  function render() {
    const query = search.value.trim().toLowerCase().replace(/^00/, '+');
    visible = countries.filter(c => `${c.name} ${c.code} ${c.dial}`.toLowerCase().includes(query));
    highlighted = -1;
    search.removeAttribute('aria-activedescendant');
    list.replaceChildren(...visible.map(c => {
      const option = document.createElement('li');
      option.id = `country-${c.code}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(c.code === selected));
      option.textContent = `${c.flag} ${c.name} (${c.dial})`;
      option.addEventListener('click', () => { selectCountry(c.code); closePicker(); validate(); input.focus({ preventScroll: true }); });
      return option;
    }));
    results.textContent = visible.length ? `${visible.length} ${visible.length === 1 ? 'country' : 'countries'} found. Tap to select, or use arrow keys and Enter.` : 'No matching country. Try the country name or calling code.';
  }
  toggle.addEventListener('click', () => {
    if (!panel.hidden) { closePicker(); return; }
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    search.setAttribute('aria-expanded', 'true');
    search.value = '';
    render();
    search.focus({ preventScroll: true });
  });
  search.addEventListener('input', render);
  // Keep combobox focus until click selects the option; otherwise focusout can
  // hide the list before the browser delivers that click.
  list.addEventListener('mousedown', event => event.preventDefault());
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePicker(); toggle.focus({ preventScroll: true }); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!visible.length) return;
      highlighted = (highlighted + (event.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length;
      [...list.children].forEach((node, i) => node.classList.toggle('is-highlighted', i === highlighted));
      const active = list.children[highlighted];
      search.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const country = visible[highlighted < 0 && visible.length === 1 ? 0 : highlighted];
      if (country) { selectCountry(country.code); closePicker(); validate(); input.focus({ preventScroll: true }); }
    }
  });
  document.addEventListener('click', event => { if (!event.target.closest('.country-picker')) closePicker(); });
  document.addEventListener('focusin', event => { if (!event.target.closest('.country-picker')) closePicker(); });
  function validate() {
    const raw = input.value.trim().replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776));
    input.setCustomValidity('');
    form.elements.phone.value = '';
    if (!raw) return false;
    const value = raw.startsWith('00') ? '+' + raw.slice(2) : raw;
    const parsed = lib.parsePhoneNumberFromString(value, { defaultCountry: selected, extract: false });
    if (!parsed || parsed.ext || !parsed.isValid() || !parsed.country || (!value.startsWith('+') && parsed.country !== selected)) {
      input.setCustomValidity('Please enter a valid number for the selected country, or paste the full number starting with +.');
      return false;
    }
    if (value.startsWith('+')) selectCountry(parsed.country);
    form.elements.phone.value = parsed.number;
    return true;
  }
  input.addEventListener('input', validate);
  input.addEventListener('change', validate);
  input.addEventListener('blur', validate);
  // Capture runs before app.js; only a normalized complete number is submitted.
  form.addEventListener('submit', event => {
    if (!validate()) { event.preventDefault(); event.stopImmediatePropagation(); input.reportValidity(); }
  }, true);
  form.addEventListener('formdata', event => event.formData.delete('phoneNational'));
  form.addEventListener('reset', () => { selectCountry('EG'); closePicker(); input.setCustomValidity(''); });
  document.querySelector('#bookingDialog').addEventListener('close', closePicker);
})();
