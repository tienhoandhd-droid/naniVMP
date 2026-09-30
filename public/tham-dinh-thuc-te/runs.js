(() => {
  'use strict';
  const systems = { steam: 'Hơi tinh khiết', air: 'Khí nén', nitrogen: 'Khí nitơ' };
  const requestIds = new Map();
  const measurementForms = (system, config) => system === 'steam'
    ? Object.entries({bm01:'Khí không ngưng tụ',bm02:'Nước ngưng',bm03:'Độ khô',bm04:'Quá nhiệt'}).map(([id,title])=>({id,title,locations:config?.locations||[]}))
    : (config?.forms || []).filter(f => f.kind === 'measurement');
  const campaignScope = (selected, steamConfig, gasConfigs) => selected.map(system => ({
    system, forms: Object.fromEntries(measurementForms(system, system === 'steam' ? steamConfig : gasConfigs[system]).map(f => [f.id, f.locations.map(p => p.id)]))
  }));
  const validateSingleScope = (system, forms) => {
    const selected = Object.entries(forms).filter(([, points]) => points.length);
    if (!selected.length) return { valid: false, message: 'Chọn ít nhất một biểu mẫu và điểm lấy mẫu.' };
    if (system === 'steam' && forms.bm04?.length) {
      if (forms.bm04.some(p=>!(forms.bm03||[]).includes(p))) return { valid: false, message: 'BM04 cần chọn BM03 với cùng điểm lấy mẫu.' };
    }
    return { valid: true, message: '' };
  };
  const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&!Number.isNaN(Date.parse(value+'T00:00:00Z'));
  const validateCalibration=(requirements,calibration)=>{
    const keys=new Set(Object.keys(calibration||{}));
    if(keys.size!==(requirements||[]).length||(requirements||[]).some(item=>!keys.has(item.key)))return {valid:false,message:'Nhập tên thiết bị và hạn cho tất cả thiết bị trong phạm vi.'};
    const valid=(requirements||[]).every(item=>{const value=calibration[item.key];return typeof value?.name==='string'&&value.name.trim().length>0&&value.name.trim().length<=160&&validDate(value.due_on);});
    return valid?{valid:true,message:''}:{valid:false,message:'Nhập tên thiết bị và hạn cho tất cả thiết bị trong phạm vi.'};
  };
  const trendRoute=search=>{const params=new URLSearchParams(search),system=params.get('system');return params.get('view')==='trend'&&Object.hasOwn(systems,system)?{dedicated:true,system}:{dedicated:false,system:null};};
  const closedTrendHistory=(history,runs,system)=>{const closed=new Set((runs||[]).filter(run=>run.status!=='open').map(run=>run.id));return (history||[]).filter(item=>item.system===system&&closed.has(item.run_id));};
  const monthRange = (months) => { if (!months.length) return []; const out = [], d = new Date(`${months[0]}T00:00:00Z`), end = months.at(-1); while (d.toISOString().slice(0, 10) <= end) { out.push(d.toISOString().slice(0, 8) + '01'); d.setUTCMonth(d.getUTCMonth() + 1); } return out; };
  const trendSeries = (history, system, form, point, metric, unit) => {
    const allMonths = history.map(h => h.period).filter(Boolean).sort();
    const candidates = history.filter(h => h.system === system)
      .flatMap(h => (h.trend || []).map(row => ({ ...row, period: h.period, record_id:h.record_id, version:h.version })))
      .filter(r => r.form === form && (!point || r.point_id === point) && r.metric === metric);
    const selectedUnit = unit ?? candidates[0]?.unit ?? '';
    const rows = candidates.filter(r => (r.unit || '') === selectedUnit);
    const valid = rows.filter(r => Number.isFinite(r.value) && !r.uncertain);
    const points = [...new Set(rows.map(r => r.point_id))].sort();
    const months = monthRange(allMonths);
    const series = points.flatMap(point_id => {
      const pointRows = valid.filter(r => r.point_id === point_id);
      const trials = [...new Set(pointRows.map(r => r.trial ?? 1))].sort((a,b) => a-b);
      return trials.flatMap(trial => {
        const buckets = months.map(month => pointRows.filter(r => r.period === month && (r.trial ?? 1) === trial));
        const count = Math.max(0,...buckets.map(b => b.length));
        return Array.from({length:count},(_,occurrence) => ({point_id,trial,occurrence,values:buckets.map(b => b[occurrence]?.value ?? null)}));
      });
    });
    return { months, points, series, values: series[0]?.values || months.map(() => null), excluded: rows.length-valid.length,
      unit:selectedUnit, label:rows[0]?.label || metric, rows };
  };
  window.CPC1RunsUI = { campaignScope, validateSingleScope, validateCalibration, trendRoute, closedTrendHistory, trendSeries };
  if (typeof document === 'undefined') return;
  const route=trendRoute(location.search);
  const $ = id => document.getElementById(id);
  const el = (name, props = {}, children = []) => { const node = ['text','line','path','circle','rect','title','g'].includes(name)?document.createElementNS('http://www.w3.org/2000/svg',name):document.createElement(name); Object.entries(props).forEach(([key, value]) => { if (key === 'text') node.textContent = value; else if (key === 'className') node.setAttribute('class',value); else if (key.startsWith('on')) node.addEventListener(key.slice(2), value); else node.setAttribute(key, value); }); node.append(...children); return node; };
  const state = { configs: {}, runs: [], history: [], requirements: [], requirementToken: 0, activeSystem: 'steam', trendKey: '', trendView:'points', hiddenPoints: new Set(), snapshots: new Map(), snapshotErrors: new Map(), pendingSnapshots: new Map(), accessRevision:0, loadToken:0 };
  const message = text => { $('runs-status').textContent = text; };
  const errorText = error => error?.message || 'Không thể tải dữ liệu. Thử lại sau.';
  const payloadKey = payload => JSON.stringify(payload);
  const requestId = payload => { const key = payloadKey(payload); if (!requestIds.has(key)) requestIds.set(key, crypto.randomUUID()); return requestIds.get(key); };
  const currentMode = () => document.querySelector('input[name="mode"]:checked').value;
  const formTitle = form => `${form.id.toUpperCase()} · ${form.title || 'Biểu mẫu đo'}`;
  const availableSystems = (backend, entering=false) => Object.keys(systems).filter(system => backend.permissionsFor(system).can_view_current && (!entering || backend.permissionsFor(system).can_enter));
  function renderCampaignSystems() { const host = $('campaign-systems'), allowed=new Set(availableSystems(window.CPC1Backend,true)); host.replaceChildren(...Object.entries(systems).filter(([id])=>allowed.has(id)).map(([id, title]) => { const input = el('input', { type: 'checkbox', value: id, checked: 'checked' }); input.checked = true; return el('label', { className: 'scope-row' }, [input, document.createTextNode(title)]); })); }
  function renderScopePicker() { const system = $('single-system').value; const host = $('scope-picker'); host.replaceChildren(...measurementForms(system, state.configs[system]).map(form => { const checked = el('input', { type: 'checkbox', value: form.id }); const points = el('div', { className: 'point-choices' }); form.locations.forEach(point => { const box = el('input', { type: 'checkbox', value: point.id }); points.append(el('label', {}, [box, document.createTextNode(window.CPC1PointLabels?.label(point)||point.id)])); }); return el('div', { className: 'scope-form' }, [el('label',{},[checked, document.createTextNode(formTitle(form))]), points]); })); }
  function toggleMode() { const single = currentMode() === 'single'; $('single-system-wrap').hidden = !single; $('scope-picker').hidden = !single; $('campaign-systems').hidden = single; $('scope-help').textContent = single ? 'Chỉ chọn một hệ thống. BM04 hơi yêu cầu BM03 cùng các điểm đã chọn.' : 'Đợt đầy đủ gồm toàn bộ biểu mẫu đo và điểm của từng hệ thống được chọn.'; if (single) renderScopePicker(); void loadRequirements(); }
  function selectedSingleScope() { const forms = {}; [...$('scope-picker').querySelectorAll('.scope-form')].forEach(row => { const form = row.querySelector(':scope > label > input').value; if (row.querySelector(':scope > label > input').checked) forms[form] = [...row.querySelectorAll('.point-choices input:checked')].map(i => i.value); }); return forms; }
  function selectedScope() { const mode=currentMode();if(mode==='campaign'){const selected=[...$('campaign-systems').querySelectorAll('input:checked')].map(input=>input.value);if(!selected.length)throw Error('Chọn ít nhất một hệ thống.');return campaignScope(selected,state.configs.steam,state.configs);}const system=$('single-system').value,forms=selectedSingleScope(),valid=validateSingleScope(system,forms);if(!valid.valid)throw Error(valid.message);return [{system,forms}]; }
  function calibrationValue(host=$('calibration-fields')) { return Object.fromEntries([...host.querySelectorAll('[data-calibration-key]')].map(row=>[row.dataset.calibrationKey,{name:row.querySelector('input[type="text"]').value.trim(),due_on:row.querySelector('input[type="date"]').value}])); }
  function renderRequirements(requirements,values={}) { const host=$('calibration-fields');host.replaceChildren();requirements.forEach((item,index)=>{const current=values[item.key]||{},nameId=`calibration-name-${index}`,dateId=`calibration-date-${index}`;host.append(el('fieldset',{className:'calibration-field','data-calibration-key':item.key},[el('legend',{text:item.name||item.key}),el('p',{className:'help',text:item.kind==='expiry'?'Hạn dùng':'Hạn hiệu chuẩn'}),el('label',{for:nameId},[document.createTextNode('Tên thiết bị'),el('input',{id:nameId,type:'text',maxlength:'160',required:'required',value:current.name||''})]),el('label',{for:dateId},[document.createTextNode(item.label||'Ngày hết hạn'),el('input',{id:dateId,type:'date',required:'required',value:current.due_on||''})]) ]));});$('calibration-status').textContent=requirements.length?`${requirements.length} thiết bị cần khai báo theo phạm vi đã chọn.`:'Chọn đủ biểu mẫu và điểm để tải yêu cầu thiết bị.'; }
  async function loadRequirements(){const token=++state.requirementToken,previous=calibrationValue();$('create-submit').disabled=true;$('calibration-status').textContent='Đang tải yêu cầu thiết bị từ máy chủ…';try{const scope=selectedScope();if(typeof window.CPC1Backend.runRequirements!=='function')throw Error('Dịch vụ yêu cầu thiết bị chưa sẵn sàng.');const requirements=await window.CPC1Backend.runRequirements(scope);if(token!==state.requirementToken)return;state.requirements=Array.isArray(requirements)?requirements:[];renderRequirements(state.requirements,previous);}catch(error){if(token!==state.requirementToken)return;state.requirements=[];$('calibration-fields').replaceChildren();$('calibration-status').textContent=errorText(error);}finally{if(token===state.requirementToken)$('create-submit').disabled=false;}}
  function definition() { const mode = currentMode(), title = $('run-title').value.trim(), started_on = $('run-started').value; if (!title || !started_on) throw new Error('Nhập tên đợt và ngày bắt đầu.');const scope=selectedScope(),calibration=calibrationValue(),valid=validateCalibration(state.requirements,calibration);if(!valid.valid)throw Error(valid.message);return { title, mode, started_on, scope, calibration }; }
  function statusLabel(run) { return run.status === 'completed' ? 'Hoàn thành' : run.status === 'closed' ? 'Kết thúc có lý do' : 'Đang mở'; }
  function recordHref(item) { return item.system === 'steam' ? `./steam.html?run=${encodeURIComponent(item.run_id || '')}&record=${encodeURIComponent(item.record_id)}` : `./gas.html?system=${encodeURIComponent(item.system)}&run=${encodeURIComponent(item.run_id || '')}&record=${encodeURIComponent(item.record_id)}`; }
  function calibrationSummary(run){const list=el('dl',{className:'calibration-summary'});(run.calibration_requirements||[]).forEach(item=>{const value=run.calibration?.[item.key]||{};list.append(el('dt',{text:item.name||item.key}),el('dd',{text:`${value.name||'Chưa nhập tên'} · ${item.kind==='expiry'?'Hạn dùng':'Hạn hiệu chuẩn'} ${value.due_on||'chưa có'}`}));});return list;}
  function calibrationEditor(run){const form=el('form',{className:'calibration-editor',hidden:'hidden'}),fields=el('div',{className:'calibration-edit-fields'});(run.calibration_requirements||[]).forEach((item,index)=>{const value=run.calibration?.[item.key]||{},name=el('input',{type:'text',maxlength:'160',required:'required',value:value.name||''}),date=el('input',{type:'date',required:'required',value:value.due_on||''}),row=el('fieldset',{'data-calibration-key':item.key},[el('legend',{text:item.name||item.key}),el('label',{},[document.createTextNode('Tên thiết bị'),name]),el('label',{},[document.createTextNode(item.label||'Ngày hết hạn'),date])]);fields.append(row);});const reason=el('textarea',{maxlength:'1000',placeholder:'Lý do khi thay tên hoặc hạn đã lưu'}),error=el('p',{className:'form-error',role:'alert'});form.append(fields,el('label',{},[document.createTextNode('Lý do thay đổi'),reason]),error,el('button',{type:'submit',text:'Lưu thông tin thiết bị'}));form.addEventListener('submit',async event=>{event.preventDefault();error.textContent='';const calibration=calibrationValue(fields),valid=validateCalibration(run.calibration_requirements||[],calibration);try{if(!valid.valid)throw Error(valid.message);const changedExisting=(run.calibration_requirements||[]).some(item=>{const before=run.calibration?.[item.key]||{},after=calibration[item.key];return (before.name||before.due_on)&&(before.name!==after.name||before.due_on!==after.due_on);});if(changedExisting&&!reason.value.trim())throw Error('Nhập lý do khi thay tên hoặc hạn đã lưu.');const payload={id:run.id,version:run.version,calibration,reason:reason.value.trim()||null};const updated=await window.CPC1Backend.updateRunCalibration(run.id,run.version,calibration,payload.reason,requestId(payload));requestIds.delete(payloadKey(payload));state.runs=state.runs.map(item=>item.id===run.id?updated:item);renderRuns();message('Đã cập nhật thông tin thiết bị của đợt.');}catch(problem){error.textContent=errorText(problem);}});return form;}
  function renderRuns() { const host = $('run-list'); host.replaceChildren(); if (!state.runs.length) { host.append(el('p', { className: 'empty', text: 'Chưa có đợt thực hiện nào trong phạm vi của bạn.' })); return; } state.runs.forEach(run => { const p = run.progress || {}; const card = el('article', { className: 'run-card' }); card.append(el('div', { className: `tag ${run.status}`, text: statusLabel(run) }), el('h3', { text: run.title }), el('p', { className: 'run-meta', text: `${run.mode === 'campaign' ? 'Đợt đầy đủ' : 'Phạm vi chọn riêng'} · ${state.history.some(h=>h.run_id===run.id&&h.sources?.length)?'Tháng thực hiện '+run.started_on.slice(0,7):'Bắt đầu '+run.started_on}` }), el('p', { className: 'run-progress', text: `Đã đủ ${p.complete || 0}/${p.total || 0} · Không đạt ${p.fail || 0} · Không hợp lệ ${p.invalid || 0}` }),calibrationSummary(run)); if (run.close_reason) card.append(el('p', { className: 'help', text: `Lý do: ${run.close_reason}` })); const actions = el('div', { className: 'run-actions' }); (run.items || []).forEach(item => actions.append(el('a', { className: 'button', href: recordHref({...item,run_id:run.id}), text: `Mở ${systems[item.system]}` })));if(run.status==='open'&&run.can_close===true&&(run.calibration_requirements||[]).length){const editor=calibrationEditor(run),button=el('button',{type:'button',text:'Sửa thông tin thiết bị',onclick:()=>editor.hidden=!editor.hidden});actions.append(button,editor);}if (run.status === 'open' && run.can_close === true) { const complete = el('button', { type: 'button', text: 'Hoàn tất phạm vi', onclick: () => transition(run, 'completed', '') }); complete.disabled = !p.ready; const close = el('button', { type: 'button', text: 'Kết thúc có lý do', onclick: () => closeForm.hidden = !closeForm.hidden }); const closeForm = el('div', { hidden: 'hidden' }); const reason = el('textarea', { placeholder: 'Nêu lý do kết thúc khi chưa hoàn thành', maxlength: '1000' }); reason.setAttribute('aria-label','Lý do kết thúc đợt '+run.title);closeForm.append(reason, el('button', { type:'button', text:'Xác nhận kết thúc', onclick:()=>transition(run,'closed',reason.value) }));actions.append(complete,close,closeForm);}card.append(actions);host.append(card);}); }
  async function transition(run, status, reason) { try { if (status === 'closed' && !reason.trim()) throw new Error('Nhập lý do kết thúc đợt.'); const payload = { id: run.id, version: run.version, status, reason: reason || null }; const updated = await window.CPC1Backend.transitionRun(run.id, run.version, status, reason || null, requestId(payload)); requestIds.delete(payloadKey(payload)); state.runs = state.runs.map(r => r.id === updated.id ? updated : r); renderRuns(); message('Đã cập nhật trạng thái đợt.'); } catch (error) { message(errorText(error)); } }
  function selectOptions(select, options, keep) { select.replaceChildren(...options.map(o => el('option', { value: o.value, text: o.label }))); if (options.some(o => o.value === keep)) select.value = keep; }
  function pointLabel(system,form,id) {
    const point = measurementForms(system,state.configs[system]).find(f => f.id===form)?.locations?.find(p => p.id===id);
    return window.CPC1PointLabels?.label(point || {id,name:id}) || id;
  }
  function highlightPoint(point) {
    document.querySelectorAll('#trend-chart [data-point],#limit-chart [data-point],#multi-trend-chart [data-point]').forEach(node=>{
      node.classList.toggle('chart-muted',!!point&&node.dataset.point!==point);
      node.classList.toggle('chart-emphasis',node.dataset.point===point);
    });
  }
  const trendViews=['points','limits','history'];
  function setTrendView(view) {
    state.trendView=view;
    trendViews.forEach(name=>{
      const active=name===view,button=$('view-'+name);
      button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
      $(name+'-chart-panel').hidden=!active;
    });
    $('active-chart-heading').textContent=$('view-'+view).textContent;
    $('trend-data-details').hidden=view==='history';$('multi-data-details').hidden=view!=='history';
    const scope=$('assessment-scope');scope.textContent=scope.dataset.recordScope||'Chưa có hồ sơ đã lưu';
    if(view==='history')scope.textContent+=' · Đánh giá bên dưới chỉ áp dụng cho đợt đang chọn';
  }
  function renderAssessment(item,data,annotated,loading,error) {
    const outside=annotated.filter(row=>['above','below'].includes(row.action.state)).length;
    const unknown=annotated.filter(row=>row.action.state==='unknown').length;
    const run=state.runs.find(run=>run.id===item?.run_id);
    $('assessment-scope').dataset.recordScope=item?`${item.period.slice(0,7)} · ${run?.title||'Hồ sơ đã lưu'} · v${item.version}`:'Chưa có hồ sơ đã lưu';
    $('summary-points').textContent=String(data.points.length);
    $('summary-samples').textContent=String(data.rows.length);
    $('summary-outside').textContent=loading||error||!item?'—':String(outside);
    $('summary-unknown').textContent=loading||error||!item?'—':String(unknown);
    const text=!item?'Chưa có dữ liệu phù hợp. Chọn đợt, biểu mẫu và chỉ tiêu khi có hồ sơ đã lưu.':loading?'Đang tải tiêu chí của phiên bản hồ sơ để đối chiếu…':error?'Tiêu chí chưa tải được; chưa thể đối chiếu giới hạn. Thử tải lại tiêu chí.':!annotated.length?'Chưa có kết quả cho phạm vi đã chọn.':outside?`${outside} kết quả ngoài giới hạn hành động${unknown?`; ${unknown} kết quả chưa đủ cơ sở đối chiếu`:''}. Xem từng lần đo và nguồn hồ sơ bên dưới.`:unknown?`${annotated.length-unknown} kết quả trong giới hạn; ${unknown} kết quả chưa đủ cơ sở đối chiếu.`:'Tất cả kết quả trong phạm vi đang chọn đều nằm trong giới hạn hành động đã lưu.';
    $('trend-assessment').textContent=text;
    $('trend-assessment-box').dataset.state=loading||error||!item?'pending':outside?'outside':unknown?'unknown':annotated.length?'within':'pending';
    setTrendView(state.trendView);
  }
  function observationProps(point,title) {
    const inspect=()=>{$('chart-inspection').textContent=title;};
    return {'data-point':point,tabindex:'0','aria-label':title,onfocus:inspect,onpointerenter:inspect};
  }
  const snapshotKey=item=>`${item.record_id}:${item.version}`;
  async function fetchSnapshot(item) {
    const key=snapshotKey(item);if(state.pendingSnapshots.has(key)||state.snapshots.has(key)||state.snapshotErrors.has(key))return;
    const revision=state.accessRevision;state.pendingSnapshots.set(key,revision);
    try {const snapshot=await window.CPC1Backend.historySnapshot(item.record_id,item.version);if(revision===state.accessRevision)state.snapshots.set(key,snapshot);}
    catch(error){if(revision===state.accessRevision)state.snapshotErrors.set(key,errorText(error));}
    finally {if(state.pendingSnapshots.get(key)===revision)state.pendingSnapshots.delete(key);if(revision===state.accessRevision&&$('trend-record').value===key)renderTrend();}
  }
  function renderLocationChart(id,rows,points,limits,loading) {
    const chart=$(id);let svg=chart.querySelector('g');if(!svg){svg=el('g');chart.append(svg);}svg.replaceChildren();
    const visible=points.filter(p=>!state.hiddenPoints.has(p));
    const plotted=rows.filter(r=>visible.includes(r.point_id)&&r.action.plotValue!==null);
    const width=Math.max(760,visible.length*76+104),height=370,left=72,right=width-24,top=30,bottom=258;
    chart.setAttribute('viewBox',`0 0 ${width} ${height}`);chart.style.minWidth=width+'px';
    if(!plotted.length){svg.append(el('text',{x:width/2,y:140,className:'chart-empty','text-anchor':'middle',text:!visible.length&&points.length?'Đã ẩn tất cả điểm. Chọn “Hiện tất cả điểm” để xem lại.':loading?'Đang tải phiên bản hồ sơ…':'Không có số đã lưu phù hợp để biểu diễn.'}));return;}
    const values=plotted.map(r=>r.action.plotValue);
    plotted.forEach(r=>{if(r.action.limit!==null)values.push(r.action.limit);});if(!limits)values.push(0);
    const min=Math.min(...values),max=Math.max(...values),pad=(max-min||Math.max(1,Math.abs(max)*.1))*.1;
    const low=limits?min-pad:min<0?min-pad:0,high=limits?max+pad:max>0?max+pad:min===0?1:0;
    const slot=(right-left)/visible.length,x=i=>left+slot*(i+.5),y=v=>bottom-(v-low)/(high-low)*(bottom-top);
    [0,.25,.5,.75,1].forEach(t=>{const yy=bottom-t*(bottom-top);svg.append(el('line',{x1:left,y1:yy,x2:right,y2:yy,className:'chart-grid'}),el('text',{x:left-10,y:yy+4,'text-anchor':'end',className:'chart-label',text:(low+t*(high-low)).toLocaleString('vi-VN',{maximumSignificantDigits:5})}));});
    visible.forEach((point,i)=>{
      svg.append(el('text',{x:x(i),y:bottom+20,transform:`rotate(-50 ${x(i)} ${bottom+20})`,'text-anchor':'end',className:'chart-label',text:point}));
      const samples=plotted.filter(r=>r.point_id===point),step=Math.min(18,slot*.7/Math.max(1,samples.length));
      {
        const bounds=[...new Set(samples.map(r=>r.action.limit).filter(v=>v!==null))];
        bounds.forEach(bound=>svg.append(el('line',{x1:x(i)-slot*.4,x2:x(i)+slot*.4,y1:y(bound),y2:y(bound),className:'action-limit','data-point':point},[el('title',{text:`${point} · giới hạn hành động ${bound}`})])));
      }
      samples.forEach((row,j)=>{
        const xx=x(i)+(j-(samples.length-1)/2)*step,value=row.action.plotValue;
        const outside=['above','below'].includes(row.action.state);
        const title=`${point} · lần ${row.trial??1} · ${row.action.rawValue} ${row.unit} · ${row.action.reason}`;
        if(limits){
          const attrs={...observationProps(point,title),className:`action-point ${outside?'action-outside':row.action.state==='unknown'?'action-unknown':'action-within'}`};
          svg.append(outside?el('path',{...attrs,d:`M${xx},${y(value)-6}l6,6 -6,6 -6,-6 Z`},[el('title',{text:title})]):el('circle',{...attrs,cx:xx,cy:y(value),r:5},[el('title',{text:title})]));
        }else{
          svg.append(el('rect',{...observationProps(point,title),x:xx-step*.4,y:Math.min(y(0),y(value)),width:Math.max(2,step*.8),height:Math.max(1,Math.abs(y(0)-y(value))),className:`chart-bar trial-${row.trial??1}${outside?' chart-bar-outside':''}`},[el('title',{text:title})]));
          if(outside)svg.append(el('path',{d:`M${xx},${y(value)-7}l5,5 -5,5 -5,-5 Z`,className:'outside-marker','data-point':point},[el('title',{text:title})]));
        }
      });
    });
    svg.append(el('text',{x:left,y:16,className:'chart-label',text:rows[0]?.unit||''}));
  }
  function renderMultiTrend(system,form,point,metric,unit){
    const history=closedTrendHistory(state.history,state.runs,system),data=trendSeries(history,system,form,point,metric,unit),chart=$('multi-trend-chart'),group=chart.querySelector('g'),width=Math.max(760,data.months.length*110+120),height=320,left=72,right=width-28,top=28,bottom=240;
    chart.setAttribute('viewBox',`0 0 ${width} ${height}`);chart.style.minWidth=width+'px';group.replaceChildren();
    const visibleSeries=data.series.filter(series=>!state.hiddenPoints.has(series.point_id));
    const values=visibleSeries.flatMap(series=>series.values).filter(Number.isFinite),low=values.length?Math.min(...values):0,high=values.length?Math.max(...values):1,pad=(high-low||Math.max(1,Math.abs(high)*.1))*.1,y=value=>bottom-(value-(low-pad))/((high+pad)-(low-pad))*(bottom-top),x=index=>data.months.length<2?left+(right-left)/2:left+(right-left)*index/(data.months.length-1);
    [0,.25,.5,.75,1].forEach(step=>{const yy=bottom-step*(bottom-top),value=(low-pad)+step*((high+pad)-(low-pad));group.append(el('line',{x1:left,x2:right,y1:yy,y2:yy,className:'chart-grid'}),el('text',{x:left-8,y:yy+4,'text-anchor':'end',className:'chart-label',text:value.toLocaleString('vi-VN',{maximumSignificantDigits:5})}));});
    data.months.forEach((month,index)=>group.append(el('text',{x:x(index),y:bottom+24,'text-anchor':'middle',className:'chart-label',text:month.slice(0,7)})));
    data.series.forEach((series,index)=>{
      if(state.hiddenPoints.has(series.point_id))return;
      let segment=[];
      const flush=()=>{if(!segment.length)return;const path=segment.map((item,position)=>`${position?'L':'M'}${x(item.index)},${y(item.value)}`).join(' ');group.append(el('path',{d:path,className:`multi-line series-${index%6}`,'data-point':series.point_id},[el('title',{text:`${series.point_id} · lần ${series.trial} · chuỗi ${series.occurrence+1}`})]));segment=[];};
      series.values.forEach((value,monthIndex)=>{if(Number.isFinite(value)){segment.push({index:monthIndex,value});const title=`${data.months[monthIndex].slice(0,7)} · ${pointLabel(system,form,series.point_id)} · lần ${series.trial} · chuỗi ${series.occurrence+1}: ${value} ${data.unit}`;group.append(el('circle',{...observationProps(series.point_id,title),cx:x(monthIndex),cy:y(value),r:4,className:`multi-point series-${index%6}`},[el('title',{text:title})]));}else flush();});
      flush();
    });
    const allHidden=data.series.length>0&&!visibleSeries.length;
    if(!values.length)group.append(el('text',{x:width/2,y:130,'text-anchor':'middle',className:'chart-empty',text:allHidden?'Đã ẩn tất cả điểm. Chọn “Hiện tất cả điểm” để xem lại.':'Chưa có số liệu từ đợt đã đóng phù hợp.'}));
    $('multi-trend-status').textContent=data.series.length?`${history.length} hồ sơ đã đóng · ${visibleSeries.length}/${data.series.length} chuỗi hiển thị · ${data.unit||'không có đơn vị'}${data.excluded?' · '+data.excluded+' kết quả thiếu hoặc chưa chắc chắn không được vẽ':''}. Chưa kết luận độ ổn định thống kê của hệ thống.`:'Chưa có số liệu từ đợt đã đóng cho lựa chọn này.';
    $('multi-trend-legend').replaceChildren(...data.series.flatMap((series,index)=>state.hiddenPoints.has(series.point_id)?[]:[el('li',{},[el('span',{className:`multi-swatch series-${index%6}`,'aria-hidden':'true'}),el('span',{text:`${pointLabel(system,form,series.point_id)} · lần ${series.trial}${series.occurrence?' · chuỗi '+(series.occurrence+1):''}`})])]));
    // The table is an alternative to the chart: preserve every saved source row,
    // including observations that cannot be plotted. Gap rows are explicitly synthetic.
    const tableRows=data.rows.map(row=>({...row,sourceState:row.uncertain?'uncertain':Number.isFinite(row.value)?'saved':'missing'}));
    data.series.forEach(series=>series.values.forEach((value,index)=>{
      const period=data.months[index];
      if(value===null&&!data.rows.some(row=>row.period===period&&row.point_id===series.point_id&&(row.trial??1)===series.trial)&&!tableRows.some(row=>row.sourceState==='gap'&&row.period===period&&row.point_id===series.point_id&&row.trial===series.trial))tableRows.push({period,point_id:series.point_id,trial:series.trial,unit:data.unit,sourceState:'gap'});
    }));
    tableRows.sort((a,b)=>a.period.localeCompare(b.period)||a.point_id.localeCompare(b.point_id)||(a.trial??1)-(b.trial??1));
    $('multi-trend-data').querySelector('tbody').replaceChildren(...tableRows.map(row=>el('tr',{'data-source-state':row.sourceState},[
      row.period?.slice(0,7)||'—',pointLabel(system,form,row.point_id),row.trial??1,row.record_id?`${row.record_id} · v${row.version??'—'}`:'—',
      row.source_value??'—',row.value??'—',row.unit||'—',({saved:'Đã lưu',uncertain:'Nguồn chưa chắc chắn · không vẽ',missing:'Thiếu giá trị số · không vẽ',gap:'Tháng chưa có số liệu · không phải dòng hồ sơ'}[row.sourceState])
    ].map(cell=>el('td',{text:String(cell)})))));

  }
  function renderTrend() {
    const system=$('trend-system').value;state.activeSystem=system;
    const entries=state.history.filter(h=>h.system===system).slice().sort((a,b)=>b.period.localeCompare(a.period)||String(a.record_id).localeCompare(String(b.record_id)));
    selectOptions($('trend-record'),entries.map(h=>({value:snapshotKey(h),label:`${h.period.slice(0,7)} · ${state.runs.find(r=>r.id===h.run_id)?.title||'Hồ sơ '+String(h.record_id).slice(-8)} · v${h.version}`})),$('trend-record').value);
    const item=entries.find(h=>snapshotKey(h)===$('trend-record').value),rows=item?.trend||[];
    const forms=[...new Set(rows.map(r=>r.form).filter(Boolean))];
    selectOptions($('trend-form'),forms.map(value=>({value,label:formTitle(measurementForms(system,state.configs[system]).find(f=>f.id===value)||{id:value})})),$('trend-form').value);
    const form=$('trend-form').value;
    const metrics=[...new Map(rows.filter(r=>r.form===form).map(r=>[JSON.stringify([r.metric,r.unit||'']),{value:JSON.stringify([r.metric,r.unit||'']),label:`${r.label||r.metric}${r.unit?' ('+r.unit+')':''}`}])).values()];
    selectOptions($('trend-metric'),metrics,$('trend-metric').value);
    const [metric,unit]=$('trend-metric').value?JSON.parse($('trend-metric').value):['',''];
    const key=JSON.stringify([system,item&&snapshotKey(item),form,metric,unit]);
    if(state.trendKey!==key){state.trendKey=key;state.hiddenPoints.clear();$('trend-point').value='';}
    const historical=closedTrendHistory(state.history,state.runs,system);
    const points=[...new Set([...rows,...historical.flatMap(h=>h.trend||[])].filter(r=>r.form===form&&r.metric===metric&&(r.unit||'')===unit).map(r=>r.point_id).filter(Boolean))].sort();
    selectOptions($('trend-point'),[{value:'',label:`Tất cả điểm (${points.length})`},...points.map(value=>({value,label:pointLabel(system,form,value)}))],$('trend-point').value);
    const point=$('trend-point').value;
    const data=trendSeries(item?[item]:[],system,form,point,metric,unit);
    const skey=item&&snapshotKey(item),snapshot=state.snapshots.get(skey),error=state.snapshotErrors.get(skey),loading=!!item&&!snapshot&&!error;
    const annotated=data.rows.map(row=>({...row,action:window.CPC1TrendLimits.annotate(system,row,snapshot)}));
    const historyPoints=trendSeries(historical,system,form,point,metric,unit).points;
    const legendPoints=[...new Set([...data.points,...historyPoints])].sort();
    renderAssessment(item,data,annotated,loading,error);
    $('chart-unit').textContent=`${data.label||'Chưa có chỉ tiêu'}${unit?' · '+unit:''}`;
    $('chart-inspection').textContent='Chạm, di chuột hoặc dùng bàn phím tới giá trị trên biểu đồ để xem chi tiết.';
    const period=item?.period.slice(0,7)||'';
    $('chart-title').textContent=`${systems[system]} · ${data.label||'Chưa có chỉ tiêu'} · ${period}`;
    $('chart-desc').textContent='Trục X là điểm lấy mẫu, trục Y là giá trị đo. Các cột riêng theo lần đo; vạch đứt là giới hạn đề cương tại từng điểm, hình thoi đánh dấu ngoài giới hạn. Không lấy trung bình.';
    $('chart-caption').textContent=`${data.label||'Chưa có dữ liệu'}${unit?' ('+unit+')':''} · ${period}. Trục X: điểm lấy mẫu · Trục Y: giá trị đo. Giữ riêng từng lần đo.`;
    $('limit-title').textContent=`Giới hạn hành động · ${data.label||'Chưa có chỉ tiêu'}`;
    $('limit-desc').textContent='Trục X là điểm lấy mẫu, trục Y là giá trị đo. Vạch đứt là giới hạn đề cương; hình thoi là kết quả ngoài giới hạn. Bảng bên dưới ghi giá trị và giới hạn từng điểm.';
    $('limit-source').textContent=error?`Không tải được tiêu chí: ${error}`:loading?'Đang tải kết quả và tiêu chí đúng phiên bản…':snapshot?`Tiêu chí từ hồ sơ v${item.version} · ${snapshot.evaluation?.formula_version||snapshot.evaluation?.source_context?.formula_version||'phiên bản đã lưu'}. Giới hạn hành động là giới hạn trong đề cương; đối chiếu này không thay đổi kết luận hồ sơ.`:'Chưa có hồ sơ đã lưu cho hệ thống này.';
    $('limits-retry').hidden=!error;
    $('limits-retry').onclick=()=>{state.snapshotErrors.delete(skey);renderTrend();};
    const legend=$('chart-legend');legend.replaceChildren();
    function draw(){
      const activePoints=state.trendView==='history'?historyPoints:data.points;
      const shown=activePoints.filter(id=>!state.hiddenPoints.has(id)).length;
      const unknown=annotated.filter(r=>r.action.state==='unknown'),outside=annotated.filter(r=>['above','below'].includes(r.action.state));
      $('trend-note').textContent=`Hiển thị ${shown}/${activePoints.length} điểm · Cùng chỉ tiêu và đơn vị · Bảng số liệu giữ đầy đủ điểm đã lọc.`;
      $('limit-summary').textContent=loading||error||!item?$('trend-assessment').textContent:`${outside.length} kết quả ngoài giới hạn hành động${unknown.length?' · '+unknown.length+' kết quả chưa đủ cơ sở đối chiếu':''}.`;
      $('limit-exceptions').replaceChildren(...outside.map(r=>el('li',{text:`${r.point_id} · lần ${r.trial??1}: ${r.action.rawValue} ${r.unit} — ${r.action.reason} (${r.action.direction==='max'?'≤':'≥'} ${r.action.limit}).`})));
      renderLocationChart('trend-chart',annotated,data.points,false,loading);renderLocationChart('limit-chart',annotated,data.points,true,loading);
      renderMultiTrend(system,form,point,metric,unit);
      const focus=document.activeElement?.closest('#chart-legend label');if(focus)highlightPoint(focus.querySelector('input').value);
      $('trend-data').querySelector('tbody').replaceChildren(...annotated.map(row=>el('tr',{},[
        period,row.form?.toUpperCase(),row.point_id,row.label||row.metric,row.trial??'—',row.source_value??'—',row.action.rawValue??row.value??'—',row.unit||'—',
        row.action.limit===null?'Chưa xác định':`${row.action.direction==='max'?'≤':'≥'} ${row.action.limit}`,row.action.reason,
        row.page?'Trang '+row.page:'—',({match:'Khớp đánh giá',match_at_source_precision:'Khớp độ làm tròn nguồn',mismatch:'Chênh lệch cần xem xét',needs_review:'Cần xem xét'}[row.comparison]||'—'),({pass:'Đạt',fail:'Không đạt',invalid:'Cần kiểm tra',incomplete:'Chưa đủ dữ liệu'}[row.computed_status]||'—')
      ].map(value=>el('td',{text:String(value)})))));
    }
    legendPoints.forEach(id=>{
      const input=el('input',{type:'checkbox',value:id});input.checked=!state.hiddenPoints.has(id);
      input.addEventListener('change',()=>{if(input.checked)state.hiddenPoints.delete(id);else state.hiddenPoints.add(id);draw();});
      const label=el('label',{},[input,el('span',{text:pointLabel(system,form,id)})]);
      label.addEventListener('pointerenter',()=>highlightPoint(id));label.addEventListener('pointerleave',()=>highlightPoint(legend.contains(document.activeElement)?document.activeElement.value:null));
      label.addEventListener('focusin',()=>highlightPoint(id));label.addEventListener('focusout',()=>highlightPoint(null));legend.append(label);
    });
    $('trend-show-all').onclick=()=>{state.hiddenPoints.clear();legend.querySelectorAll('input').forEach(input=>input.checked=true);draw();};
    $('trend-show-all').disabled=!legendPoints.length;draw();renderHistoryDetails(system);
    if(loading)fetchSnapshot(item);
  }
  function renderHistoryDetails(system) { const host = $('history-details'); host.replaceChildren(); const entries = state.history.filter(h => h.system === system); if (!entries.length) { host.append(el('p',{className:'empty',text:'Chưa có lịch sử nguồn cho hệ thống này.'})); return; } entries.forEach(item => { const box = el('article',{className:'history-item'}); box.append(el('strong',{text:`${item.period?.slice(0,7)} · hồ sơ ${item.record_id || '—'}`})); if ((item.issues || []).length) { const list = el('ul'); item.issues.forEach(issue => list.append(el('li',{text:typeof issue === 'string' ? issue : JSON.stringify(issue)}))); box.append(el('p',{className:'help',text:'Vấn đề cần xem xét:'}),list); } if ((item.sources || []).length) { const actions = el('div',{className:'source-actions'}); item.sources.forEach(source => actions.append(el('button',{type:'button',text:`Tải PDF: ${source.title || source.source_id}`,onclick:()=>download(source)}))); box.append(actions); } host.append(box); }); }
  async function download(source) { try { const blob = await window.CPC1Backend.downloadHistorySource(source.object_path); const url = URL.createObjectURL(blob), a = el('a',{href:url,download:source.title || 'nguon-lich-su.pdf'}); document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url); } catch(error) { message(errorText(error)); } }
  async function load() { const token=++state.loadToken;state.accessRevision++;state.snapshots.clear();state.snapshotErrors.clear();state.pendingSnapshots.clear();state.configs={};state.runs=[];state.history=[];renderRuns();renderTrend();try { const backend = window.CPC1Backend; const session = await backend.getSession(); if (!session)throw new Error('Đăng nhập VMP để xem dữ liệu.'); const visible=availableSystems(backend), archiveVisible=Object.keys(systems).filter(system=>backend.permissionsFor(system).can_view&&(!route.dedicated||system===route.system)), entering=availableSystems(backend,true); const configs={}; for (const system of visible) configs[system]=system==='steam'?await backend.getConfig():await backend.getGasConfig(system); const [runs,history]=await Promise.all([backend.listRuns(),backend.listHistory()]); if(token!==state.loadToken)return; $('create-run').hidden=!entering.length;state.configs=configs; state.runs=runs || []; state.history=history || []; state.activeSystem=route.dedicated&&archiveVisible.includes(route.system)?route.system:archiveVisible[0]||''; renderCampaignSystems(); selectOptions($('single-system'), entering.map(value=>({value,label:systems[value]}))); selectOptions($('trend-system'), archiveVisible.map(value=>({value,label:systems[value]})),state.activeSystem); renderRuns(); renderTrend();toggleMode();message('Đã tải dữ liệu đợt và xu hướng.'); } catch(error) { if(token!==state.loadToken)return;message(errorText(error)); $('run-list').replaceChildren(el('p',{className:'empty',text:'Không tải được danh sách đợt. Dữ liệu đang nhập vẫn được giữ.'})); } }
  function tabs() {
    const buttons=[$('runs-tab'),$('trend-tab')];
    function activate(index){buttons.forEach((b,i)=>{b.setAttribute('aria-selected',String(i===index));b.tabIndex=i===index?0:-1;});$('runs-panel').hidden=index!==0;$('trend-panel').hidden=index!==1;if(index===1)renderTrend();}
    buttons.forEach((b,i)=>{b.addEventListener('click',()=>activate(i));b.addEventListener('keydown',e=>{const index=e.key==='Home'?0:e.key==='End'?1:['ArrowLeft','ArrowRight'].includes(e.key)?1-i:null;if(index===null)return;e.preventDefault();activate(index);buttons[index].focus();});});if(route.dedicated){document.querySelector('.page-tabs').hidden=true;$('trend-system-control').hidden=true;document.querySelector('h1').textContent=`Xu hướng · ${systems[route.system]}`;document.title=`Xu hướng ${systems[route.system]} | VMP`;document.querySelector('.runs-shell>.intro').textContent='Xem chung các điểm cùng chỉ tiêu và đơn vị. Đối chiếu giới hạn theo phiên bản hồ sơ đã lưu hoặc theo dõi diễn biến qua các đợt đã đóng.';activate(1);}else activate(0);
  }
  trendViews.forEach((name,index)=>{
    const button=$('view-'+name);
    button.addEventListener('click',()=>{setTrendView(name);renderTrend();});
    button.addEventListener('keydown',event=>{
      const next=event.key==='Home'?0:event.key==='End'?trendViews.length-1:event.key==='ArrowRight'?(index+1)%trendViews.length:event.key==='ArrowLeft'?(index+trendViews.length-1)%trendViews.length:null;
      if(next===null)return;event.preventDefault();setTrendView(trendViews[next]);renderTrend();$('view-'+trendViews[next]).focus();
    });
  });
  $('create-run').addEventListener('submit',async event=>{ event.preventDefault(); const error=$('create-error'); error.hidden=true; try { const data=definition(), submit=$('create-submit'); submit.disabled=true; const created=await window.CPC1Backend.createRun(data,requestId(data)); requestIds.delete(payloadKey(data)); state.runs.unshift(created); renderRuns(); event.target.reset();$('run-started').value=new Date().toLocaleDateString('en-CA');toggleMode(); message('Đã tạo đợt thực hiện.'); } catch(err) { error.textContent=errorText(err); error.hidden=false; } finally { $('create-submit').disabled=false; } });
  document.querySelectorAll('input[name="mode"]').forEach(input=>input.addEventListener('change',toggleMode)); $('single-system').addEventListener('change',()=>{renderScopePicker();void loadRequirements();});$('scope-picker').addEventListener('change',()=>void loadRequirements());$('campaign-systems').addEventListener('change',()=>void loadRequirements()); $('reload-runs').addEventListener('click',load); ['trend-system','trend-record','trend-form','trend-point','trend-metric'].forEach(id => $(id).addEventListener('change',()=>{state.hiddenPoints.clear();renderTrend();})); tabs(); $('run-started').value = new Date().toISOString().slice(0,10); load();
  window.addEventListener('cpc1:permissions-refreshed',()=>void load());
})();
