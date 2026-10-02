/* Presentation only. Entry data, permissions and server requests stay in their existing owners. */
(() => {
  'use strict';
  const tablet = matchMedia('(max-width:1199px)');
  const railMenu = document.querySelector('.rail-menu');
  function resizeRail() { if (railMenu) railMenu.open = !tablet.matches; }
  resizeRail(); tablet.addEventListener('change', resizeRail);
  const toolbar = document.querySelector('.actionbar,.action-bar');
  const body = document.getElementById('form-body');
  if (toolbar && body) {
    body.after(toolbar);
    const revealInput=()=>{
      const input=document.activeElement;
      if(!input?.matches('#form-body input,#form-body textarea,#form-body select'))return;
      const bounds=input.getBoundingClientRect(),bar=toolbar.getBoundingClientRect();
      const visual=window.visualViewport,visibleBottom=(visual?.offsetTop||0)+(visual?.height||innerHeight),bottom=getComputedStyle(toolbar).position==='fixed'?Math.min(bar.top,visibleBottom):visibleBottom;
      if(bounds.bottom>bottom)window.scrollBy(0,bounds.bottom-bottom+24);
    };
    document.addEventListener('focusin',()=>requestAnimationFrame(revealInput));
    const resizeVisual=()=>{const visual=window.visualViewport,zoom=parseFloat(getComputedStyle(document.body).zoom)||1;document.body.dataset.entryKeyboard=String(zoom>1||Boolean(visual&&(visual.height<600||innerHeight-visual.height*visual.scale>150)));requestAnimationFrame(revealInput);};
    window.visualViewport?.addEventListener('resize',resizeVisual);new ResizeObserver(resizeVisual).observe(document.body);resizeVisual();
    new ResizeObserver(()=>document.documentElement.style.setProperty('--entry-toolbar-height',`${toolbar.getBoundingClientRect().height}px`)).observe(toolbar);
    const message=document.getElementById('message');if(message){toolbar.before(message);for(const id of ['record-save','evaluate'])document.getElementById(id)?.addEventListener('click',()=>toolbar.prepend(message),{capture:true});}
    const moveAssistance=()=>{
      for(const node of document.querySelectorAll('#local-draft-panel,.entry-assistance,.entry-paste-launch')) {
        if(node.compareDocumentPosition(body)&Node.DOCUMENT_POSITION_FOLLOWING) toolbar.after(node);
      }
    };
    moveAssistance();new MutationObserver(moveAssistance).observe(body.parentElement,{childList:true});
    const recordState = document.getElementById('record-state');
    if (!toolbar.contains(recordState)) toolbar.prepend(recordState);
    const print = document.getElementById('print');
    toolbar.querySelector('.file-actions-menu')?.append(print);
    const pointNav = document.createElement('div'); pointNav.className = 'point-step-actions';
    for (const [offset,label] of [[-1,'Điểm trước'],[1,'Điểm sau']]) {
      const button = document.createElement('button'); button.type='button'; button.textContent=label;
      button.id=offset<0?'point-previous':'point-next';
      button.addEventListener('click',()=>{
        const list=document.querySelector('#point-list,#location-list');
        const buttons=[...list.querySelectorAll('button')], current=buttons.findIndex(node=>node.getAttribute('aria-current')==='true');
        buttons[current+offset]?.click();
        document.getElementById('form-title')?.scrollIntoView({block:'start'});
      });
      pointNav.append(button);
    }
    toolbar.querySelector('.actions')?.prepend(pointNav);
    const list=document.querySelector('#point-list,#location-list');
    const updateSteps=()=>{
      const buttons=[...list.querySelectorAll('button')], current=buttons.findIndex(node=>node.getAttribute('aria-current')==='true');
      document.getElementById('point-previous').disabled=current<=0;
      document.getElementById('point-next').disabled=current<0||current>=buttons.length-1;
    };
    if(list){new MutationObserver(updateSteps).observe(list,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-current']});updateSteps();}
  }
  const navigation = document.querySelector('.workspace-navigation');
  // Responsive navigation: vertical on desktop, horizontal on smaller screens.
  const forms = document.querySelector('.form-navigation nav');
  function revealCurrentForm() {
    const selected = forms?.querySelector('[aria-current="page"]');
    if (!selected) return;
    const control = selected.getBoundingClientRect(), track = forms.getBoundingClientRect();
    if (matchMedia('(min-width:1200px)').matches) {
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
    if (event.target.closest('button')) setTimeout(() => { if(tablet.matches&&railMenu){railMenu.open=false;railMenu.querySelector('summary').focus({preventScroll:true});}else activateFocus(forms); }, 0);
  }, {capture:true});
  forms?.addEventListener('keydown', event => {
    const buttons = [...forms.querySelectorAll('button')];
    const index = buttons.indexOf(event.target.closest('button'));
    if (index < 0) return;
    const vertical = matchMedia('(min-width:1200px)').matches;
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
