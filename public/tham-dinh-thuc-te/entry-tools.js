(() => {
  'use strict';
  let adapter, url, request=0, frame, printing=false;
  const $=id=>document.getElementById(id);
  const canEnter=()=>!window.CPC1_SESSION_ENDED && window.CPC1Backend?.permissions?.can_enter===true && Boolean(adapter?.get().userId);
  const key=s=>JSON.stringify([s.userId,s.system,s.form,s.generation,s.recordId,s.version,s.dirty]);
  function clearPdf(){request++;if(url)URL.revokeObjectURL(url);url=null;for(const id of ['print-review-open','print-review-download']){const a=$(id);if(a){a.hidden=true;a.removeAttribute('href');}}}
  function update() {
    if(!adapter)return;
    const s=adapter.get(), offline=!navigator.onLine;
    for(const id of ['evaluate','record-save','print']){const b=$(id);if(!b)continue;if(offline){if(!b.hasAttribute('data-offline-disabled'))b.dataset.offlineDisabled=String(b.disabled);b.disabled=true;}else if(b.hasAttribute('data-offline-disabled')){if(b.dataset.offlineDisabled==='false'&&canEnter())b.disabled=false;delete b.dataset.offlineDisabled;}}
    window.CPC1RunEntry?.reflect();
    if($('entry-network'))$('entry-network').textContent=offline?'Mất mạng · Có thể nhập tiếp; tính, lưu và tạo PDF cần kết nối.':'Trực tuyến · Hồ sơ chỉ được lưu lên hệ thống khi bạn bấm Lưu.';
    if($('entry-progress')){
      const fields=[...document.querySelectorAll('#form-body input:not([readonly]),#form-body textarea,#form-body select')].filter(x=>!x.disabled);
      const filled=fields.filter(x=>x.value.trim()).length;
      $('entry-progress').textContent=`${filled}/${fields.length} ô có dữ liệu trong biểu mẫu đang mở · không phải kết luận đủ hồ sơ`;
    }
    if($('print-review')?.open) {
      $('print-review-title').textContent=s.title || 'Biểu mẫu';
      $('print-review-state').textContent=s.dirty||!s.recordId?'Lưu hồ sơ trước khi tạo PDF để bản in khớp dữ liệu đang nhập.':`Hồ sơ ${s.recordId} · phiên bản ${s.version}`;
      $('print-review-save').hidden=Boolean(s.recordId&&!s.dirty);
      $('print-review-save').disabled=offline||!canEnter();
      $('print-review-generate').disabled=offline||s.dirty||!s.recordId||!canEnter()||printing;
    }
  }
  function changed(){clearPdf();update();}
  function attach(options) {
    adapter=options;
    if($('print-review')){update();return;}
    const status=document.createElement('div');status.className='entry-assistance';
    status.innerHTML='<p id="entry-network" role="status"></p><p id="entry-progress"></p>';
    document.querySelector('.action-bar,.actionbar').after(status);
    const dialog=document.createElement('dialog');dialog.id='print-review';dialog.className='print-review';dialog.setAttribute('aria-labelledby','print-review-heading');
    dialog.innerHTML='<div class="print-review-body"><div class="dialog-head"><h2 id="print-review-heading">Kiểm tra trước khi in</h2><button id="print-review-close" type="button" aria-label="Đóng kiểm tra in">Đóng</button></div><h3 id="print-review-title"></h3><p id="print-review-state"></p><ol><li>Kiểm tra số liệu, điểm lấy mẫu và thông tin người thực hiện.</li><li>PDF sử dụng mẫu gốc và dữ liệu của phiên bản đã lưu.</li><li>Khi in, chọn <strong>Kích thước thực / 100%</strong>; kiểm tra khổ giấy trong PDF.</li></ol><p class="muted">Bản PDF là báo cáo nháp theo mẫu; không thay phê duyệt QA.</p><p id="print-review-message" role="status"></p><div class="print-review-actions"><button id="print-review-save" type="button">Lưu hồ sơ trước</button><button id="print-review-generate" class="primary" type="button">Tạo PDF theo mẫu gốc</button><a id="print-review-open" class="button primary" target="_blank" rel="noopener" hidden>Mở PDF để in</a><a id="print-review-download" class="button" hidden>Tải PDF</a></div></div>';
    document.body.append(dialog);
    $('print-review-close').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{$('print')?.focus({preventScroll:true});});
    $('print-review-save').onclick=async()=>{
      $('print-review-save').disabled=true;$('print-review-message').textContent='Đang lưu hồ sơ…';
      try{await adapter.save();const s=adapter.get();$('print-review-message').textContent=s.recordId&&!s.dirty?'Đã lưu. Bạn có thể tạo PDF.':'Chưa lưu được dữ liệu hiện tại. Kiểm tra thông báo trên biểu mẫu.';}catch(e){$('print-review-message').textContent=e.message;}finally{update();}
    };
    $('print-review-generate').onclick=async()=>{
      const s=adapter.get();if(printing||s.dirty||!s.recordId||!canEnter()||!navigator.onLine)return;printing=true;
      clearPdf();const token=request, expected=key(s);
      $('print-review-generate').disabled=true;$('print-review-generate').setAttribute('aria-busy','true');$('print-review-message').textContent='Đang tải mẫu và tạo PDF…';
      try{
        const blob=await adapter.report();
        if(token!==request||key(adapter.get())!==expected||!canEnter()){if($('print-review-message'))$('print-review-message').textContent='Dữ liệu hoặc biểu mẫu đã đổi. Lưu lại trước khi tạo PDF mới.';return;}
        if(!blob.type.includes('pdf'))throw Error('Không nhận được PDF hợp lệ.');
        url=URL.createObjectURL(blob);
        for(const id of ['print-review-open','print-review-download']){$(id).href=url;$(id).hidden=false;}
        $('print-review-download').download=`CPC1-${s.system}-${s.form}-v${s.version}.pdf`;
        $('print-review-message').textContent='PDF sẵn sàng. Mở để kiểm tra và in, hoặc tải về máy.';
      }catch(e){if($('print-review-message'))$('print-review-message').textContent='Không tạo được PDF: '+e.message;}finally{printing=false;$('print-review-generate')?.removeAttribute('aria-busy');update();}
    };
    document.addEventListener('input',event=>{if(event.target.closest('#form-body')){cancelAnimationFrame(frame);frame=requestAnimationFrame(update);}});
    window.addEventListener('cpc1:entry-change',changed);
    window.addEventListener('offline',update);window.addEventListener('online',update);
    window.addEventListener('pagehide',clearPdf);
    window.CPC1Backend?.onSessionChange?.((event,session)=>{if(event==='SIGNED_OUT'||(event==='SIGNED_IN'&&session?.user?.id!==adapter.get().userId)){clearPdf();dialog.close();}});
    update();
  }
  function end(){clearPdf();$('print-review')?.close();}
  function show(){if(!adapter||!canEnter())return;clearPdf();$('print-review-message').textContent='';$('print-review').showModal();update();}
  window.CPC1EntryTools=Object.freeze({attach,show,changed,update,end,isDirty:()=>Boolean(adapter?.get().dirty)});
})();
