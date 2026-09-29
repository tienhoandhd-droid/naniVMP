(() => {
  'use strict';
  const clone=value=>value==null?value:structuredClone(value);
  const empty=value=>value==null||value==='';
  const at=(value,path)=>path.reduce((current,key)=>current&&typeof current==='object'?current[key]:undefined,value);
  const pointData=(data,system,form,point)=>system==='steam'?data?.[form]?.[point]:data?.forms?.[form]?.[point];
  const pointHasData=(data,system,form,point)=>{
    const visit=value=>value&&typeof value==='object'?Object.values(value).some(visit):!empty(value);
    return visit(pointData(data,system,form,point));
  };
  const leaves=(value,path=[],out=[])=>{
    if(value&&typeof value==='object'){
      const entries=Object.entries(value);
      if(entries.length)entries.forEach(([key,item])=>leaves(item,[...path,Array.isArray(value)?Number(key):key],out));
      return out;
    }
    out.push({path,value});return out;
  };
  const corrections=(before={},after={})=>{
    const paths=new Map();
    for(const item of [...leaves(before),...leaves(after)])paths.set(JSON.stringify(item.path),item.path);
    return [...paths.values()].flatMap(path=>{
      const oldValue=at(before,path),newValue=at(after,path);
      if(empty(oldValue)||String(oldValue)===String(newValue))return [];
      return [{path,before:String(oldValue),after:empty(newValue)?'':String(newValue)}];
    });
  };
  const correctionFingerprint=(before,after)=>JSON.stringify(corrections(before,after));
  const canEdit=({mode,baseline,path})=>mode==='change'||mode==='new'||(mode==='continue'&&empty(at(baseline,path)));
  const sameToken=(left={},right={})=>['generation','session','record'].every(key=>(left[key]??null)===(right[key]??null));
  const createSession=()=>{
    let accepted={},token={};
    return Object.freeze({
      accept(data,nextToken={}){accepted=clone(data)||{};token={...nextToken};},
      acceptIfCurrent(data,response,current){if(!sameToken(response,current))return false;accepted=clone(data)||{};token={...current};return true;},
      baseline(){return clone(accepted)||{};},
      token(){return {...token};}
    });
  };
  const measurementDates=(data,system,form,point)=>{
    const found=[];
    const visit=value=>{
      if(!value||typeof value!=='object')return;
      for(const [key,item] of Object.entries(value)){
        if(['date','execution_date','result_date','measured_on'].includes(key)&&typeof item==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item))found.push(item);
        else if(item&&typeof item==='object')visit(item);
      }
    };
    visit(pointData(data,system,form,point));return [...new Set(found)].sort();
  };
  const calibrationWarnings=(config,data,system,form,point)=>{
    const run=config?._run,dates=measurementDates(data,system,form,point);if(!run||!dates.length)return [];
    return (run.calibration_requirements||[]).filter(item=>item.system===system&&item.form===form).flatMap(item=>{
      const calibration=run.calibration?.[item.key],due=calibration?.due_on;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(due||''))return [];
      return dates.filter(date=>date>due).map(measured_on=>({key:item.key,name:calibration.name||item.name||item.key,due_on:due,measured_on}));
    });
  };
  const syncCalibration=(data,config)=>{
    const run=config?._run;if(run?.status!=='open'||!data||typeof data!=='object')return [];
    return (run.calibration_requirements||[]).flatMap(item=>{
      const path=item.payload_path,value=run.calibration?.[item.key]?.due_on;
      if(!Array.isArray(path)||!path.length||!/^\d{4}-\d{2}-\d{2}$/.test(value||'')||path.some(key=>['__proto__','prototype','constructor'].includes(String(key))))return [];
      const before=at(data,path);if(String(before??'')===value)return [];
      let target=data;for(const part of path.slice(0,-1)){if(!target[part]||typeof target[part]!=='object'||Array.isArray(target[part]))target[part]={};target=target[part];}
      target[path.at(-1)]=value;return [{path:[...path],before:empty(before)?'':String(before),after:value}];
    });
  };
  const historyRows=events=>(events||[]).flatMap(event=>{const dateChange=(event.changes||[]).find(change=>['date','execution_date','result_date','measured_on'].includes(change.path?.at(-1))),measured_on=Array.isArray(event.measurement_dates)&&event.measurement_dates.length?event.measurement_dates.join(', '):dateChange?(dateChange.after||dateChange.before||'Không ghi nhận'):'Không ghi nhận';return (event.changes||[]).map(change=>({
    version:event.version,saved_at:String(event.created_at||''),actor:String(event.actor_name||'Không xác định'),
    reason:String(event.reason||'Không ghi nhận'),measured_on:String(measured_on),path:(change.path||[]).join('.'),
    before:empty(change.before)?'':String(change.before),after:empty(change.after)?'':String(change.after)
  }));});
  const node=(name,attributes={},children=[])=>{const item=document.createElement(name);for(const [key,value] of Object.entries(attributes)){if(key==='text')item.textContent=String(value);else if(key.startsWith('on'))item.addEventListener(key.slice(2).toLowerCase(),value);else item.setAttribute(key,String(value));}item.append(...children);return item;};
  function createWorkspace(backend){
    const accepted=createSession(),modes=new Map();let pendingReason='',pendingReasonKey='',historyToken=0,activeIdentity='';
    const key=(system,form,point)=>`${system}:${form}:${point}`;
    const mode=({system,form,point,data})=>!pointHasData(accepted.baseline(),system,form,point)?'new':modes.get(key(system,form,point))||'warning';
    const tokenFor=context=>({generation:context.generation,session:context.session?.user?.id||context.session||null,record:context.recordId||null});
    const ensureHistoryDialog=()=>{let dialog=document.getElementById('entry-history-dialog');if(dialog)return dialog;dialog=node('dialog',{id:'entry-history-dialog','aria-labelledby':'entry-history-title'});const heading=node('div',{class:'dialog-heading'},[node('h2',{id:'entry-history-title',text:'Lịch sử điểm lấy mẫu'}),node('button',{type:'button','aria-label':'Đóng',text:'Đóng',onclick:()=>dialog.close()})]),status=node('p',{id:'entry-history-status',role:'status','aria-live':'polite'}),scroll=node('div',{class:'table-scroll'},[node('table',{},[node('caption',{text:'Các thay đổi đã lưu tại điểm'}),node('thead',{},[node('tr',{},['Phiên bản','Đường dẫn','Trước','Sau','Người lưu','Ngày đo','Thời gian lưu','Lý do'].map(text=>node('th',{scope:'col',text})))]),node('tbody',{id:'entry-history-rows'})])]);dialog.append(heading,status,scroll);dialog.addEventListener('close',()=>{historyToken++;});document.body.append(dialog);return dialog;};
    const showHistory=async context=>{const dialog=ensureHistoryDialog(),token=++historyToken,identity=key(context.system,context.form,context.point)+':'+context.recordId;document.getElementById('entry-history-title').textContent=`Lịch sử · ${context.form.toUpperCase()} · ${context.point}`;document.getElementById('entry-history-status').textContent='Đang tải lịch sử…';document.getElementById('entry-history-rows').replaceChildren();dialog.showModal();try{if(typeof backend?.pointHistory!=='function')throw Error('Dịch vụ lịch sử chưa sẵn sàng.');const events=await backend.pointHistory(context.form,context.point);if(token!==historyToken||identity!==activeIdentity||window.CPC1_SESSION_ENDED||!dialog.isConnected||!dialog.open)return;const rows=historyRows(events),body=document.getElementById('entry-history-rows');if(!body?.isConnected)return;body.replaceChildren(...rows.map(row=>node('tr',{},[row.version,row.path,row.before||'Trống',row.after||'Trống',row.actor,row.measured_on,row.saved_at,row.reason].map(value=>node('td',{text:value})))));document.getElementById('entry-history-status').textContent=rows.length?`${rows.length} thay đổi đã ghi nhận.`:'Chưa có lịch sử thay đổi cho điểm này.';}catch(error){const status=document.getElementById('entry-history-status');if(token===historyToken&&identity===activeIdentity&&!window.CPC1_SESSION_ENDED&&dialog.open&&status?.isConnected)status.textContent=error?.message||'Không tải được lịch sử.';}};
    const ensureReasonDialog=()=>{let dialog=document.getElementById('correction-reason-dialog');if(dialog)return dialog;dialog=node('dialog',{id:'correction-reason-dialog','aria-labelledby':'correction-reason-title'});const preview=node('div',{class:'table-scroll'},[node('table',{},[node('caption',{text:'Các giá trị sẽ được đính chính'}),node('thead',{},[node('tr',{},['Đường dẫn','Giá trị đã lưu','Giá trị mới'].map(text=>node('th',{scope:'col',text})))]),node('tbody',{id:'correction-preview'})])]);const form=node('form',{method:'dialog'},[node('h2',{id:'correction-reason-title',text:'Lý do đính chính'}),node('p',{text:'Kiểm tra giá trị cũ và mới, sau đó nhập lý do trước khi lưu.'}),preview,node('label',{for:'correction-reason',text:'Lý do đính chính'}),node('textarea',{id:'correction-reason',maxlength:'1000',required:'required'}),node('p',{id:'correction-reason-error',class:'field-error',role:'alert'}),node('div',{class:'dialog-actions'},[node('button',{type:'button',value:'cancel',text:'Hủy'}),node('button',{type:'submit',value:'confirm',class:'primary',text:'Tiếp tục lưu'})])]);dialog.append(form);document.body.append(dialog);return dialog;};
    const askReason=(initial,changes)=>new Promise(resolve=>{const dialog=ensureReasonDialog(),textarea=document.getElementById('correction-reason'),error=document.getElementById('correction-reason-error'),cancel=dialog.querySelector('button[value="cancel"]'),preview=document.getElementById('correction-preview');preview.replaceChildren(...changes.map(change=>node('tr',{},[change.path.join('.'),change.before||'Trống',change.after||'Trống'].map(value=>node('td',{text:value})))));textarea.value=initial||'';error.textContent='';let settled=false;const finish=value=>{if(settled)return;settled=true;cleanup();if(dialog.open)dialog.close();resolve(value);};const cleanup=()=>{form.removeEventListener('submit',submit);cancel.removeEventListener('click',cancelled);dialog.removeEventListener('cancel',cancelled);dialog.removeEventListener('close',closed);};const cancelled=event=>{event?.preventDefault();finish(null);};const closed=()=>finish(null);const form=dialog.querySelector('form');const submit=event=>{event.preventDefault();const value=textarea.value.trim();if(!value){error.textContent='Nhập lý do đính chính.';textarea.focus();return;}finish(value);};form.addEventListener('submit',submit);cancel.addEventListener('click',cancelled);dialog.addEventListener('cancel',cancelled);dialog.addEventListener('close',closed);dialog.showModal();textarea.focus();});
    return Object.freeze({
      accept(data,context={}){accepted.accept(data,tokenFor(context));modes.clear();pendingReason='';pendingReasonKey='';},
      acceptIfCurrent(data,response,current){const ok=accepted.acceptIfCurrent(data,tokenFor(response),tokenFor(current));if(ok){modes.clear();pendingReason='';pendingReasonKey='';}return ok;},
      acceptServerBaseline(data,response,current){const responseToken=tokenFor(response),currentToken=tokenFor(current);if(responseToken.session!==currentToken.session||responseToken.record!==currentToken.record)return false;accepted.accept(data,currentToken);modes.clear();pendingReason='';pendingReasonKey='';return true;},
      baseline:accepted.baseline,
      syncCalibration,
      currentMode:mode,
      canEdit(context){return canEdit({mode:mode(context),baseline:accepted.baseline(),path:context.path});},
      isCalibrationPath(config,path){return (config?._run?.calibration_requirements||[]).some(item=>item.payload_path?.length&&JSON.stringify(item.payload_path)===JSON.stringify(path));},
      controls(context){activeIdentity=key(context.system,context.form,context.point)+':'+context.recordId;const warnings=calibrationWarnings(context.config,context.data,context.system,context.form,context.point),current=mode(context),host=node('aside',{class:'entry-mode-panel'});warnings.forEach(warning=>host.append(node('p',{class:'calibration-warning',role:'alert',text:`${warning.name} hết hạn ${warning.due_on} trước ngày đo ${warning.measured_on}.`})));if(current==='new'&&!warnings.length)return null;const existing=current!=='new';if(existing){host.id='entry-mode-warning';host.append(node('p',{text:current==='warning'?'Điểm này đã có số liệu. Chọn cách tiếp tục trước khi sửa.':current==='continue'?'Chế độ bổ sung: chỉ các ô đang trống được nhập.':'Chế độ đính chính: có thể thay đổi số đã lưu; khi lưu phải nêu lý do.'}));const actions=node('div',{class:'entry-mode-actions'});if(current!=='continue'&&context.config?._run?.status==='open')actions.append(node('button',{id:'entry-continue',type:'button',text:'Tiếp tục',onclick:()=>{modes.set(key(context.system,context.form,context.point),'continue');context.onChange();}}));if(current!=='change'&&context.config?._run?.status==='open')actions.append(node('button',{id:'entry-change',type:'button',text:'Thay đổi',onclick:()=>{modes.set(key(context.system,context.form,context.point),'change');context.onChange();}}));actions.append(node('button',{id:'entry-view-history',type:'button',text:'Xem lịch sử',onclick:()=>void showHistory(context)}));host.append(actions);}return host;},
      async reasonForSave(data){const changes=corrections(accepted.baseline(),data),fingerprint=JSON.stringify(changes);if(!changes.length)return null;if(pendingReason&&pendingReasonKey===fingerprint)return pendingReason;const reason=await askReason('',changes);if(reason){pendingReason=reason;pendingReasonKey=fingerprint;}return reason;},
      correctionCount(data){return corrections(accepted.baseline(),data).length;}
    });
  }
  window.CPC1EntryHistory = Object.freeze({pointHasData,canEdit,corrections,correctionFingerprint,createSession,measurementDates,calibrationWarnings,syncCalibration,historyRows,createWorkspace});
})();
