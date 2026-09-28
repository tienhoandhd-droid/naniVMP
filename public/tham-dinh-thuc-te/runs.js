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
  const monthRange = (months) => { if (!months.length) return []; const out = [], d = new Date(`${months[0]}T00:00:00Z`), end = months.at(-1); while (d.toISOString().slice(0, 10) <= end) { out.push(d.toISOString().slice(0, 8) + '01'); d.setUTCMonth(d.getUTCMonth() + 1); } return out; };
  const trendSeries = (history, system, form, point, metric, unit) => {
    const allMonths = history.map(h => h.period).filter(Boolean).sort();
    const candidates = history.filter(h => h.system === system)
      .flatMap(h => (h.trend || []).map(row => ({ ...row, period: h.period })))
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
  window.CPC1RunsUI = { campaignScope, validateSingleScope, trendSeries };
  if (typeof document === 'undefined') return;
  const $ = id => document.getElementById(id);
  const el = (name, props = {}, children = []) => { const node = ['text','line','path','circle','rect','title','g'].includes(name)?document.createElementNS('http://www.w3.org/2000/svg',name):document.createElement(name); Object.entries(props).forEach(([key, value]) => { if (key === 'text') node.textContent = value; else if (key === 'className') node.setAttribute('class',value); else if (key.startsWith('on')) node.addEventListener(key.slice(2), value); else node.setAttribute(key, value); }); node.append(...children); return node; };
  const state = { configs: {}, runs: [], history: [], activeSystem: 'steam', trendKey: '', hiddenPoints: new Set(), snapshots: new Map(), snapshotErrors: new Map(), pendingSnapshots: new Set() };
  const message = text => { $('runs-status').textContent = text; };
  const errorText = error => error?.message || 'Không thể tải dữ liệu. Thử lại sau.';
  const payloadKey = payload => JSON.stringify(payload);
  const requestId = payload => { const key = payloadKey(payload); if (!requestIds.has(key)) requestIds.set(key, crypto.randomUUID()); return requestIds.get(key); };
  const currentMode = () => document.querySelector('input[name="mode"]:checked').value;
  const formTitle = form => `${form.id.toUpperCase()} · ${form.title || 'Biểu mẫu đo'}`;
  function renderCampaignSystems() { const host = $('campaign-systems'); host.replaceChildren(...Object.entries(systems).map(([id, title]) => { const input = el('input', { type: 'checkbox', value: id, checked: 'checked' }); input.checked = true; return el('label', { className: 'scope-row' }, [input, document.createTextNode(title)]); })); }
  function renderScopePicker() { const system = $('single-system').value; const host = $('scope-picker'); host.replaceChildren(...measurementForms(system, state.configs[system]).map(form => { const checked = el('input', { type: 'checkbox', value: form.id }); const points = el('div', { className: 'point-choices' }); form.locations.forEach(point => { const box = el('input', { type: 'checkbox', value: point.id }); points.append(el('label', {}, [box, document.createTextNode(window.CPC1PointLabels?.label(point)||point.id)])); }); return el('div', { className: 'scope-form' }, [el('label',{},[checked, document.createTextNode(formTitle(form))]), points]); })); }
  function toggleMode() { const single = currentMode() === 'single'; $('single-system-wrap').hidden = !single; $('scope-picker').hidden = !single; $('campaign-systems').hidden = single; $('scope-help').textContent = single ? 'Chỉ chọn một hệ thống. BM04 hơi yêu cầu BM03 cùng các điểm đã chọn.' : 'Đợt đầy đủ gồm toàn bộ biểu mẫu đo và điểm của từng hệ thống được chọn.'; if (single) renderScopePicker(); }
  function selectedSingleScope() { const forms = {}; [...$('scope-picker').querySelectorAll('.scope-form')].forEach(row => { const form = row.querySelector(':scope > label > input').value; if (row.querySelector(':scope > label > input').checked) forms[form] = [...row.querySelectorAll('.point-choices input:checked')].map(i => i.value); }); return forms; }
  function definition() { const mode = currentMode(), title = $('run-title').value.trim(), started_on = $('run-started').value; if (!title || !started_on) throw new Error('Nhập tên đợt và ngày bắt đầu.'); if (mode === 'campaign') { const selected = [...$('campaign-systems').querySelectorAll('input:checked')].map(i => i.value); if (!selected.length) throw new Error('Chọn ít nhất một hệ thống.'); return { title, mode, started_on, scope: campaignScope(selected, state.configs.steam, state.configs) }; } const system = $('single-system').value, forms = selectedSingleScope(), valid = validateSingleScope(system, forms); if (!valid.valid) throw new Error(valid.message); return { title, mode, started_on, scope: [{ system, forms }] }; }
  function statusLabel(run) { return run.status === 'completed' ? 'Hoàn thành' : run.status === 'closed' ? 'Kết thúc có lý do' : 'Đang mở'; }
  function recordHref(item) { return item.system === 'steam' ? `./steam.html?run=${encodeURIComponent(item.run_id || '')}&record=${encodeURIComponent(item.record_id)}` : `./gas.html?system=${encodeURIComponent(item.system)}&run=${encodeURIComponent(item.run_id || '')}&record=${encodeURIComponent(item.record_id)}`; }
  function renderRuns() { const host = $('run-list'); host.replaceChildren(); if (!state.runs.length) { host.append(el('p', { className: 'empty', text: 'Chưa có đợt thực hiện nào trong phạm vi của bạn.' })); return; } state.runs.forEach(run => { const p = run.progress || {}; const card = el('article', { className: 'run-card' }); card.append(el('div', { className: `tag ${run.status}`, text: statusLabel(run) }), el('h3', { text: run.title }), el('p', { className: 'run-meta', text: `${run.mode === 'campaign' ? 'Đợt đầy đủ' : 'Phạm vi chọn riêng'} · ${state.history.some(h=>h.run_id===run.id&&h.sources?.length)?'Tháng thực hiện '+run.started_on.slice(0,7):'Bắt đầu '+run.started_on}` }), el('p', { className: 'run-progress', text: `Đã đủ ${p.complete || 0}/${p.total || 0} · Không đạt ${p.fail || 0} · Không hợp lệ ${p.invalid || 0}` })); if (run.close_reason) card.append(el('p', { className: 'help', text: `Lý do: ${run.close_reason}` })); const actions = el('div', { className: 'run-actions' }); (run.items || []).forEach(item => { item.run_id = run.id; actions.append(el('a', { className: 'button', href: recordHref(item), text: `Mở ${systems[item.system]}` })); }); if (run.status === 'open') { if(window.CPC1Backend.permissions?.can_enter!==true){card.append(actions);host.append(card);return;} const complete = el('button', { type: 'button', text: 'Hoàn tất phạm vi', onclick: () => transition(run, 'completed', '') }); complete.disabled = !p.ready; const close = el('button', { type: 'button', text: 'Kết thúc có lý do', onclick: () => closeForm.hidden = !closeForm.hidden }); const closeForm = el('div', { hidden: 'hidden' }); const reason = el('textarea', { placeholder: 'Nêu lý do kết thúc khi chưa hoàn thành', maxlength: '1000' }); reason.setAttribute('aria-label','Lý do kết thúc đợt '+run.title);closeForm.append(reason, el('button', { type: 'button', text: 'Xác nhận kết thúc', onclick: () => transition(run, 'closed', reason.value) })); actions.append(complete, close, closeForm); } card.append(actions); host.append(card); }); }
  async function transition(run, status, reason) { try { if (status === 'closed' && !reason.trim()) throw new Error('Nhập lý do kết thúc đợt.'); const payload = { id: run.id, version: run.version, status, reason: reason || null }; const updated = await window.CPC1Backend.transitionRun(run.id, run.version, status, reason || null, requestId(payload)); requestIds.delete(payloadKey(payload)); state.runs = state.runs.map(r => r.id === updated.id ? updated : r); renderRuns(); message('Đã cập nhật trạng thái đợt.'); } catch (error) { message(errorText(error)); } }
  function selectOptions(select, options, keep) { select.replaceChildren(...options.map(o => el('option', { value: o.value, text: o.label }))); if (options.some(o => o.value === keep)) select.value = keep; }
  function pointLabel(system,form,id) {
    const point = measurementForms(system,state.configs[system]).find(f => f.id===form)?.locations?.find(p => p.id===id);
    return window.CPC1PointLabels?.label(point || {id,name:id}) || id;
  }
  function highlightPoint(point) {
    document.querySelectorAll('#trend-chart [data-point],#limit-chart [data-point]').forEach(node=>{
      node.classList.toggle('chart-muted',!!point&&node.dataset.point!==point);
      node.classList.toggle('chart-emphasis',node.dataset.point===point);
    });
  }
  const snapshotKey=item=>`${item.record_id}:${item.version}`;
  async function fetchSnapshot(item) {
    const key=snapshotKey(item);if(state.pendingSnapshots.has(key)||state.snapshots.has(key)||state.snapshotErrors.has(key))return;
    state.pendingSnapshots.add(key);
    try {state.snapshots.set(key,await window.CPC1Backend.historySnapshot(item.record_id,item.version));}
    catch(error){state.snapshotErrors.set(key,errorText(error));}
    finally {state.pendingSnapshots.delete(key);if($('trend-record').value===key)renderTrend();}
  }
  function renderLocationChart(id,rows,points,limits,loading) {
    const chart=$(id);let svg=chart.querySelector('g');if(!svg){svg=el('g');chart.append(svg);}svg.replaceChildren();
    const visible=points.filter(p=>!state.hiddenPoints.has(p));
    const plotted=rows.filter(r=>visible.includes(r.point_id)&&r.action.plotValue!==null);
    const width=Math.max(760,visible.length*76+104),height=370,left=72,right=width-24,top=30,bottom=258;
    chart.setAttribute('viewBox',`0 0 ${width} ${height}`);chart.style.minWidth=width+'px';
    if(!plotted.length){svg.append(el('text',{x:width/2,y:140,className:'chart-empty','text-anchor':'middle',text:loading?'Đang tải phiên bản hồ sơ…':'Không có số đã lưu phù hợp để biểu diễn.'}));return;}
    const values=plotted.map(r=>r.action.plotValue);
    if(limits)plotted.forEach(r=>{if(r.action.limit!==null)values.push(r.action.limit);});else values.push(0);
    const min=Math.min(...values),max=Math.max(...values),pad=(max-min||Math.max(1,Math.abs(max)*.1))*.1;
    const low=limits?min-pad:min<0?min-pad:0,high=limits?max+pad:max>0?max+pad:min===0?1:0;
    const slot=(right-left)/visible.length,x=i=>left+slot*(i+.5),y=v=>bottom-(v-low)/(high-low)*(bottom-top);
    [0,.25,.5,.75,1].forEach(t=>{const yy=bottom-t*(bottom-top);svg.append(el('line',{x1:left,y1:yy,x2:right,y2:yy,className:'chart-grid'}),el('text',{x:left-10,y:yy+4,'text-anchor':'end',className:'chart-label',text:(low+t*(high-low)).toLocaleString('vi-VN',{maximumSignificantDigits:5})}));});
    visible.forEach((point,i)=>{
      svg.append(el('text',{x:x(i),y:bottom+20,transform:`rotate(-50 ${x(i)} ${bottom+20})`,'text-anchor':'end',className:'chart-label',text:point}));
      const samples=plotted.filter(r=>r.point_id===point),step=Math.min(18,slot*.7/Math.max(1,samples.length));
      if(limits){
        const bounds=[...new Set(samples.map(r=>r.action.limit).filter(v=>v!==null))];
        bounds.forEach(bound=>svg.append(el('line',{x1:x(i)-slot*.4,x2:x(i)+slot*.4,y1:y(bound),y2:y(bound),className:'action-limit','data-point':point},[el('title',{text:`${point} · giới hạn hành động ${bound}`})])));
      }
      samples.forEach((row,j)=>{
        const xx=x(i)+(j-(samples.length-1)/2)*step,value=row.action.plotValue;
        const outside=['above','below'].includes(row.action.state);
        const title=`${point} · lần ${row.trial??1} · ${row.action.rawValue} ${row.unit} · ${row.action.reason}`;
        if(limits){
          const attrs={'data-point':point,className:`action-point ${outside?'action-outside':row.action.state==='unknown'?'action-unknown':'action-within'}`};
          svg.append(outside?el('path',{...attrs,d:`M${xx},${y(value)-6}l6,6 -6,6 -6,-6 Z`},[el('title',{text:title})]):el('circle',{...attrs,cx:xx,cy:y(value),r:5},[el('title',{text:title})]));
        }else{
          svg.append(el('rect',{x:xx-step*.4,y:Math.min(y(0),y(value)),width:Math.max(2,step*.8),height:Math.max(1,Math.abs(y(0)-y(value))),className:`chart-bar trial-${row.trial??1}`,'data-point':point},[el('title',{text:title})]));
        }
      });
    });
    svg.append(el('text',{x:left,y:16,className:'chart-label',text:rows[0]?.unit||''}));
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
    const points=[...new Set(rows.filter(r=>r.form===form&&r.metric===metric&&(r.unit||'')===unit).map(r=>r.point_id).filter(Boolean))].sort();
    selectOptions($('trend-point'),[{value:'',label:`Tất cả điểm (${points.length})`},...points.map(value=>({value,label:pointLabel(system,form,value)}))],$('trend-point').value);
    const point=$('trend-point').value;
    const data=trendSeries(item?[item]:[],system,form,point,metric,unit);
    const skey=item&&snapshotKey(item),snapshot=state.snapshots.get(skey),error=state.snapshotErrors.get(skey),loading=!!item&&!snapshot&&!error;
    const annotated=data.rows.map(row=>({...row,action:window.CPC1TrendLimits.annotate(system,row,snapshot)}));
    const period=item?.period.slice(0,7)||'';
    $('chart-title').textContent=`${systems[system]} · ${data.label||'Chưa có chỉ tiêu'} · ${period}`;
    $('chart-desc').textContent='Trục X là điểm lấy mẫu, trục Y là giá trị đo. Các cột riêng theo lần đo, không lấy trung bình.';
    $('chart-caption').textContent=`${data.label||'Chưa có dữ liệu'}${unit?' ('+unit+')':''} · ${period}. Mỗi điểm giữ riêng các lần đo; di chuột lên cột để xem số.`;
    $('limit-title').textContent=`Giới hạn hành động · ${data.label||'Chưa có chỉ tiêu'}`;
    $('limit-desc').textContent='Trục X là điểm lấy mẫu, trục Y là giá trị đo. Vạch đứt là giới hạn đề cương; hình thoi là kết quả ngoài giới hạn. Bảng bên dưới ghi giá trị và giới hạn từng điểm.';
    $('limit-source').textContent=error?`Không tải được tiêu chí: ${error}`:loading?'Đang tải kết quả và tiêu chí đúng phiên bản…':snapshot?`Tiêu chí từ hồ sơ v${item.version} · ${snapshot.evaluation?.formula_version||snapshot.evaluation?.source_context?.formula_version||'phiên bản đã lưu'}. Giới hạn hành động là giới hạn trong đề cương; đối chiếu này không thay đổi kết luận hồ sơ.`:'Chưa có hồ sơ đã lưu cho hệ thống này.';
    $('limits-retry').hidden=!error;
    $('limits-retry').onclick=()=>{state.snapshotErrors.delete(skey);renderTrend();};
    const legend=$('chart-legend');legend.replaceChildren();
    function draw(){
      const shown=data.points.filter(id=>!state.hiddenPoints.has(id)).length;
      const unknown=annotated.filter(r=>r.action.state==='unknown'),outside=annotated.filter(r=>['above','below'].includes(r.action.state));
      $('trend-note').textContent=`Đang chọn ${shown}/${data.points.length} điểm cùng chỉ tiêu. Trục X: điểm lấy mẫu · Trục Y: giá trị đo.`;
      $('limit-summary').textContent=loading?'Đang kiểm tra tiêu chí…':`${outside.length} kết quả ngoài giới hạn hành động${unknown.length?' · '+unknown.length+' kết quả chưa đủ cơ sở đối chiếu':''}.`;
      $('limit-exceptions').replaceChildren(...outside.map(r=>el('li',{text:`${r.point_id} · lần ${r.trial??1}: ${r.action.rawValue} ${r.unit} — ${r.action.reason} (${r.action.direction==='max'?'≤':'≥'} ${r.action.limit}).`})));
      renderLocationChart('trend-chart',annotated,data.points,false,loading);renderLocationChart('limit-chart',annotated,data.points,true,loading);
      const focus=document.activeElement?.closest('#chart-legend label');if(focus)highlightPoint(focus.querySelector('input').value);
      $('trend-data').querySelector('tbody').replaceChildren(...annotated.map(row=>el('tr',{},[
        period,row.form?.toUpperCase(),row.point_id,row.label||row.metric,row.trial??'—',row.source_value??'—',row.action.rawValue??row.value??'—',row.unit||'—',
        row.action.limit===null?'Chưa xác định':`${row.action.direction==='max'?'≤':'≥'} ${row.action.limit}`,row.action.reason,
        row.page?'Trang '+row.page:'—',({match:'Khớp đánh giá',match_at_source_precision:'Khớp độ làm tròn nguồn',mismatch:'Chênh lệch cần xem xét',needs_review:'Cần xem xét'}[row.comparison]||'—'),({pass:'Đạt',fail:'Không đạt',invalid:'Cần kiểm tra',incomplete:'Chưa đủ dữ liệu'}[row.computed_status]||'—')
      ].map(value=>el('td',{text:String(value)})))));
    }
    data.points.forEach(id=>{
      const input=el('input',{type:'checkbox',value:id});input.checked=!state.hiddenPoints.has(id);
      input.addEventListener('change',()=>{if(input.checked)state.hiddenPoints.delete(id);else state.hiddenPoints.add(id);draw();});
      const label=el('label',{},[input,el('span',{text:pointLabel(system,form,id)})]);
      label.addEventListener('pointerenter',()=>highlightPoint(id));label.addEventListener('pointerleave',()=>highlightPoint(legend.contains(document.activeElement)?document.activeElement.value:null));
      label.addEventListener('focusin',()=>highlightPoint(id));label.addEventListener('focusout',()=>highlightPoint(null));legend.append(label);
    });
    $('trend-show-all').onclick=()=>{state.hiddenPoints.clear();legend.querySelectorAll('input').forEach(input=>input.checked=true);draw();};
    $('trend-show-all').disabled=!data.points.length;draw();renderHistoryDetails(system);
    if(loading)fetchSnapshot(item);
  }
  function renderHistoryDetails(system) { const host = $('history-details'); host.replaceChildren(); const entries = state.history.filter(h => h.system === system); if (!entries.length) { host.append(el('p',{className:'empty',text:'Chưa có lịch sử nguồn cho hệ thống này.'})); return; } entries.forEach(item => { const box = el('article',{className:'history-item'}); box.append(el('strong',{text:`${item.period?.slice(0,7)} · hồ sơ ${item.record_id || '—'}`})); if ((item.issues || []).length) { const list = el('ul'); item.issues.forEach(issue => list.append(el('li',{text:typeof issue === 'string' ? issue : JSON.stringify(issue)}))); box.append(el('p',{className:'help',text:'Vấn đề cần xem xét:'}),list); } if ((item.sources || []).length) { const actions = el('div',{className:'source-actions'}); item.sources.forEach(source => actions.append(el('button',{type:'button',text:`Tải PDF: ${source.title || source.source_id}`,onclick:()=>download(source)}))); box.append(actions); } host.append(box); }); }
  async function download(source) { try { const blob = await window.CPC1Backend.downloadHistorySource(source.object_path); const url = URL.createObjectURL(blob), a = el('a',{href:url,download:source.title || 'nguon-lich-su.pdf'}); document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url); } catch(error) { message(errorText(error)); } }
  async function load() { try { const backend = window.CPC1Backend; const session = await backend.getSession(); if (!session)throw new Error('Đăng nhập VMP để xem dữ liệu.');$('create-run').hidden=backend.permissions?.can_enter!==true; const [steam,air,nitrogen,runs,history] = await Promise.all([backend.getConfig(),backend.getGasConfig('air'),backend.getGasConfig('nitrogen'),backend.listRuns(),backend.listHistory()]); state.configs={steam,air,nitrogen}; state.runs=runs || []; state.history=history || []; if(!$('campaign-systems').children.length)renderCampaignSystems(); selectOptions($('single-system'), Object.entries(systems).map(([value,label])=>({value,label}))); renderRuns(); renderTrend(); message('Đã tải dữ liệu đợt và xu hướng.'); } catch(error) { message(errorText(error)); $('run-list').replaceChildren(el('p',{className:'empty',text:'Không tải được danh sách đợt. Dữ liệu đang nhập vẫn được giữ.'})); } }
  function tabs() {
    const buttons=[$('runs-tab'),$('trend-tab')];
    function activate(index){buttons.forEach((b,i)=>{b.setAttribute('aria-selected',String(i===index));b.tabIndex=i===index?0:-1;});$('runs-panel').hidden=index!==0;$('trend-panel').hidden=index!==1;if(index===1)renderTrend();}
    buttons.forEach((b,i)=>{b.addEventListener('click',()=>activate(i));b.addEventListener('keydown',e=>{const index=e.key==='Home'?0:e.key==='End'?1:['ArrowLeft','ArrowRight'].includes(e.key)?1-i:null;if(index===null)return;e.preventDefault();activate(index);buttons[index].focus();});});activate(0);
  }
  $('create-run').addEventListener('submit',async event=>{ event.preventDefault(); const error=$('create-error'); error.hidden=true; try { const data=definition(), submit=$('create-submit'); submit.disabled=true; const created=await window.CPC1Backend.createRun(data,requestId(data)); requestIds.delete(payloadKey(data)); state.runs.unshift(created); renderRuns(); event.target.reset();$('run-started').value=new Date().toLocaleDateString('en-CA');toggleMode(); message('Đã tạo đợt thực hiện.'); } catch(err) { error.textContent=errorText(err); error.hidden=false; } finally { $('create-submit').disabled=false; } });
  document.querySelectorAll('input[name="mode"]').forEach(input=>input.addEventListener('change',toggleMode)); $('single-system').addEventListener('change',renderScopePicker); $('reload-runs').addEventListener('click',load); ['trend-system','trend-record','trend-form','trend-point','trend-metric'].forEach(id => $(id).addEventListener('change',()=>{state.hiddenPoints.clear();renderTrend();})); tabs(); $('run-started').value = new Date().toISOString().slice(0,10); load();
})();
