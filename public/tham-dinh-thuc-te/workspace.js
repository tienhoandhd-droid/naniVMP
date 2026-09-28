/* Presentation only. Entry data, permissions and server requests stay in their existing owners. */
(() => {
  'use strict';
  const navigation = document.querySelector('.workspace-navigation');
  // Responsive navigation: vertical on desktop, horizontal on smaller screens.
  const forms = document.querySelector('.form-navigation nav');
  function revealCurrentForm() {
    const selected = forms?.querySelector('[aria-current="page"]');
    if (!selected) return;
    const control = selected.getBoundingClientRect(), track = forms.getBoundingClientRect();
    if (matchMedia('(min-width:1024px)').matches) {
      const rail = forms.closest('.qualification-rail');
      const bounds = rail.getBoundingClientRect();
      if (control.top < bounds.top) rail.scrollTop += control.top - bounds.top - 8;
      if (control.bottom > bounds.bottom) rail.scrollTop += control.bottom - bounds.bottom + 8;
      return;
    }
    if (control.left < track.left) forms.scrollLeft += control.left - track.left - 8;
    if (control.right > track.right) forms.scrollLeft += control.right - track.right + 8;
  }
  function activateFocus(nav) {
    nav?.querySelector('[aria-current="page"], [aria-current="true"]')?.focus({preventScroll:true});
    revealCurrentForm();
  }
  if (forms) {
    new ResizeObserver(revealCurrentForm).observe(forms);
    new MutationObserver(revealCurrentForm).observe(forms, {childList:true});
    document.fonts.ready.then(revealCurrentForm);
  }
  forms?.addEventListener('click', event => {
    if (event.target.closest('button')) setTimeout(() => activateFocus(forms), 0);
  }, {capture:true});
  forms?.addEventListener('keydown', event => {
    const buttons = [...forms.querySelectorAll('button')];
    const index = buttons.indexOf(event.target.closest('button'));
    if (index < 0) return;
    const vertical = matchMedia('(min-width:1024px)').matches;
    const next = event.key === (vertical ? 'ArrowDown' : 'ArrowRight') ? (index + 1) % buttons.length
      : event.key === (vertical ? 'ArrowUp' : 'ArrowLeft') ? (index - 1 + buttons.length) % buttons.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    buttons[next].click();
  });
  navigation?.addEventListener('click', event => {
    if (!event.target.closest('nav button')) return;
    setTimeout(() => {
      navigation.open = false;
      const title = document.getElementById('form-title');
      title?.setAttribute('tabindex', '-1');
      title?.focus({preventScroll:true});
    }, 0);
  }, {capture:true});
  const files = document.querySelector('.file-actions');
  const fileTrigger = files?.querySelector('summary');
  files?.addEventListener('click', event => {
    if (!event.target.closest('button')) return;
    files.open = false;
    if (!document.querySelector('dialog[open]')) fileTrigger.focus({preventScroll:true});
  });
  document.getElementById('records-dialog')?.addEventListener('close', () => {
    fileTrigger?.focus({preventScroll:true});
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && files?.open) {
      files.open = false;
      files.querySelector('summary').focus();
    }
  });
  document.addEventListener('click', event => {
    if (files?.open && !files.contains(event.target)) files.open = false;
  });
  const sessionMenu = document.querySelector('.session-info');
  document.addEventListener('click', event => {
    if (sessionMenu?.open && !sessionMenu.contains(event.target)) sessionMenu.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && sessionMenu?.open) {
      sessionMenu.open = false;
      sessionMenu.querySelector('summary').focus();
    }
  });
  // Keep supplementary sections open across calculation renders, without persisting data.
  const expandedMetadata = new Set();
  const sectionKey = section => `${document.getElementById('form-title').textContent}|${section.querySelector('summary').textContent}`;
  document.addEventListener('toggle', event => {
    const section = event.target;
    if (!section.matches?.('.metadata-section') || !section.isConnected) return;
    if (section.open) expandedMetadata.add(sectionKey(section));
    else expandedMetadata.delete(sectionKey(section));
  }, true);
  const formBody = document.getElementById('form-body');
  if (formBody) new MutationObserver(() => {
    for (const section of formBody.querySelectorAll('.metadata-section')) {
      if (expandedMetadata.has(sectionKey(section)) || section.querySelector('[aria-invalid="true"]')) section.open = true;
    }
  }).observe(formBody, {childList:true, subtree:true, attributes:true, attributeFilter:['aria-invalid']});
  // Mirror in-flight state only after an enabled action is activated. Disabled permission
  // controls never acquire a misleading loading label.
  for (const [id, text] of Object.entries({evaluate:'Đang tính…', 'record-save':'Đang lưu…', print:'Đang tạo PDF…'})) {
    const button = document.getElementById(id);
    if (!button) continue;
    const label = button.textContent;
    let activated = false;
    button.addEventListener('click', () => { activated = true; }, {capture:true});
    new MutationObserver(() => {
      if (activated && button.disabled) {
        button.setAttribute('aria-busy','true');
        button.textContent = text;
      } else if (!button.disabled) {
        activated = false;
        button.removeAttribute('aria-busy');
        button.textContent = label;
      }
    }).observe(button, {attributes:true, attributeFilter:['disabled']});
  }
})();
