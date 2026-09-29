(() => {
 'use strict';let config;
 function reflect(){
  if(!config?._run)return;const closed=config._run.status!=='open';document.body.dataset.runClosed=String(closed);
  for(const id of ['record-load']){const n=document.getElementById(id);if(n)n.disabled=true;}
  if(closed){
   for(const n of document.querySelectorAll('#form-body input,#form-body textarea'))n.readOnly=true;
   for(const n of document.querySelectorAll('#form-body select,#record-save,#evaluate,#draft-open,#draft-file'))n.disabled=true;
   document.getElementById('local-draft-panel')?.setAttribute('hidden','');
  }
 }
 function show(c){config=c;if(!c?._run)return;let note=document.getElementById('run-context');
  if(!note){note=document.createElement('aside');note.id='run-context';note.className='message';note.setAttribute('aria-label','Đợt đang mở');document.getElementById('entry-form').before(note);}
  note.replaceChildren();const link=document.createElement('a');link.href='./runs.html';link.textContent='← Đợt thực hiện';
  const label=document.createElement('p'),item=c._run.items.find(x=>x.system===(c.system||'steam'));label.textContent=c._run.title+' · '+({open:'Đang thực hiện',completed:'Hoàn thành phạm vi',closed:'Đã kết thúc'}[c._run.status]||c._run.status)+(item?.pq_codes?.length?((c.system||'steam')==='steam'?' · Biểu mẫu chung — PQ: '+item.pq_codes.join(' hoặc '):' · PQ: '+item.pq_codes.join(', ')):'');
  const detail=document.createElement('p');detail.textContent=c._run.status==='open'?'Chỉ nhập các phép thử và điểm thuộc phạm vi đã chọn.':'Đang xem phiên bản đã chốt. Bản in mới là bản tái tạo; báo cáo nguồn xem tại Xu hướng tháng.';
  note.append(link,label,detail);reflect();
 }
 function openSystem(c,system){const item=c._run.items.find(x=>x.system===system);if(!item)return;
  const u=new URL(system==='steam'?'./steam.html':'./gas.html',location.href);if(system!=='steam')u.searchParams.set('system',system);u.searchParams.set('run',c._run.id);u.searchParams.set('record',item.record_id);if(window.CPC1Embedded)window.CPC1Embedded.navigate(u.href);else location.assign(u.href);
 }
 window.CPC1RunEntry=Object.freeze({show,reflect,openSystem});
})();
