/* Presentation only. Entry data, permissions and server requests stay in their existing owners. */
(() => {
  'use strict';
  const tablet = matchMedia('(max-width:1199px)');
  const railMenu = document.querySelector('.rail-menu');
  function resizeRail() { if (railMenu) railMenu.open = !tablet.matches; }
  resizeRail(); tablet.addEventListener('change', resizeRail);
  const toolbar = document.querySelector('.actionbar,.action-bar');
  const body = document.getElementById('form-body');
  // Điểm trước/sau bấm nút điểm trong danh sách; khi đó không chuyển con trỏ về tiêu đề như khi chọn tay.
  let stepping=false;
  const editable=node=>!node.readOnly&&!node.disabled&&node.type!=='hidden'&&Boolean(node.offsetParent);
  const entryFields=()=>[...(body?.querySelectorAll('input,select,textarea')||[])].filter(editable);
  const numberFields=()=>[...(body?.querySelectorAll('input[inputmode="decimal"]')||[])].filter(editable);
  if (body) {
    // Bàn phím ảo: Enter = sang ô kế; ô số cuối của điểm = “xong” → Điểm sau. Chỉ nút “Tính và đánh giá” gửi tính.
    const hints=()=>{const numbers=numberFields();for(const node of body.querySelectorAll('input'))node.enterKeyHint=node===numbers.at(-1)?'done':'next';};
    new MutationObserver(hints).observe(body,{childList:true,subtree:true});hints();
    body.addEventListener('keydown',event=>{
      const input=event.target;
      if(event.key!=='Enter'||event.isComposing||!input.matches('input')||['checkbox','radio','button','submit','file'].includes(input.type))return;
      event.preventDefault();
      const fields=entryFields(),index=fields.indexOf(input),next=document.getElementById('point-next');
      if(input.enterKeyHint!=='done'&&index>=0&&index<fields.length-1){fields[index+1].focus();return;}
      if(next&&!next.disabled)next.click();else input.blur();
    });
    // Chạm vào ô đã khoá: đưa người nhập tới khung Tiếp tục / Thay đổi kèm câu giải thích ngắn.
    body.addEventListener('click',event=>{
      const input=event.target.closest?.('input[readonly],textarea[readonly]'),panel=body.querySelector('.entry-mode-panel');
      if(!input||!panel||/-copy$/.test(input.name))return;
      let hint=panel.querySelector('.entry-lock-hint');
      if(!hint){hint=document.createElement('p');hint.className='entry-lock-hint';hint.setAttribute('role','status');panel.append(hint);}
      hint.textContent=panel.querySelector('#entry-continue')?'Ô đã có số nên bị khoá. Chọn “Tiếp tục” để nhập ô trống, hoặc “Thay đổi” để sửa (cần nêu lý do).':'Ô đã lưu bị khoá. Muốn sửa, chọn “Thay đổi” và nêu lý do khi lưu.';
      panel.classList.add('attention');panel.scrollIntoView({block:'center'});
      setTimeout(()=>panel.classList.remove('attention'),4000);
    });
    // Thanh tiêu đề điểm: hiện lần đo của ô đang nhập (hơi có 3 lần đo trên cùng trang).
    body.addEventListener('focusin',event=>{
      const legend=event.target.closest('.trial-group')?.querySelector('legend'),trial=body.querySelector('.point-bar-trial');
      if(legend&&trial)trial.textContent=`${legend.textContent} / ${body.querySelectorAll('.trial-group').length}`;
    });
    // Sau khi lưu, con trỏ quay về ô đang nhập (hoặc ô số trống đầu tiên nếu ô đó vừa bị khoá).
    let lastField='',restoreField='';
    body.addEventListener('focusin',event=>{if(event.target.name)lastField=event.target.name;});
    document.addEventListener('click',event=>{if(event.target.closest?.('#record-save,#record-save-retry'))restoreField=lastField;},{capture:true});
    const saveButton=document.getElementById('record-save');
    if(saveButton)new MutationObserver(()=>{
      if(saveButton.disabled||!restoreField)return;
      const name=restoreField;restoreField='';
      if(document.getElementById('record-state')?.dataset.saveState!=='saved'||document.querySelector('dialog[open]'))return;
      const same=body.querySelector(`[name="${CSS.escape(name)}"]`),target=same&&editable(same)?same:numberFields().find(node=>!node.value);
      target?.focus({preventScroll:true});target?.scrollIntoView({block:'center'});
    }).observe(saveButton,{attributes:true,attributeFilter:['disabled']});
  }
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
    const resizeVisual=()=>{const visual=window.visualViewport,zoom=parseFloat(getComputedStyle(document.body).zoom)||1;document.body.dataset.entryKeyboard=String(zoom>1||Boolean(visual&&(visual.height<600||innerHeight-visual.height*visual.scale>150)));document.body.dataset.entryZoom=String(zoom>1);requestAnimationFrame(revealInput);};
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
        stepping=true;buttons[current+offset]?.click();stepping=false;
        // Sang điểm mới: đặt con trỏ vào ô số đầu tiên còn trống để nhập tiếp ngay.
        const empty=numberFields().find(node=>!node.value);
        if(empty){empty.focus({preventScroll:true});empty.scrollIntoView({block:'center'});}
        else document.getElementById('form-title')?.scrollIntoView({block:'start'});
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
    if (!event.target.closest('nav button') || stepping) return;
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
