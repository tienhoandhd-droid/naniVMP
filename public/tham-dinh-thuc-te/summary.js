/* Manager view. Only reads authorized exact-version snapshots. */
(() => {
  'use strict';
  const systems={air:'Khí nén',nitrogen:'Khí nitơ',steam:'Hơi tinh khiết'};
  const states={pass:'Đạt',fail:'Không đạt',missing:'Còn thiếu',unknown:'Chưa đối chiếu được'};
  const node=(tag,text,attrs={})=>{const n=document.createElement(tag);if(text!==null)n.textContent=text;for(const [key,value]of Object.entries(attrs))n.setAttribute(key,value);return n;};
  function mount(host,{loadSnapshot,onReload}) {
    const $=id=>host.querySelector('#manager-'+id),model=window.CPC1SummaryModel;
    let runs=[],allowed=[],rows=[],request=0,active=false,busy=false,failures=0;
    const controls=['system','area','metric','state'];
    function options(select,values,all){const keep=select.value;select.replaceChildren(node('option',all,{value:''}),...values.map(([value,label])=>node('option',label,{value})));if(values.some(([value])=>value===keep))select.value=keep;}
    function filters(){return Object.fromEntries(controls.map(key=>[key,$(key).value]));}
    function message(text,state){$('status').textContent=text;$('status').dataset.state=state;}
    function sourceHref(row){const query=new URLSearchParams();if(row.system!=='steam')query.set('system',row.system);query.set('run',row.run);query.set('record',row.record);query.set('form',row.form);return './'+(row.system==='steam'?'steam.html':'gas.html')+'?'+query;}
    function render(){
      const current=filters(),selected=model.filterRows(rows,current).sort((a,b)=>a.form.localeCompare(b.form,'vi',{numeric:true})),sum=model.summarize(selected);
      const totals={points:sum.points,complete:`${sum.complete}/${sum.total}`,missing:sum.missing,fail:sum.fail,unknown:sum.unknown};
      for(const [key,value]of Object.entries(totals))host.querySelector(`[data-manager-stat="${key}"]`).textContent=busy||failures?'—':String(value);
      $('progress').value=sum.percent;$('progress').hidden=busy||failures>0;
      $('progress-text').textContent=busy?'Đang tải kết quả đã lưu…':failures?'Chưa đủ dữ liệu để tổng hợp tiến độ.':`${sum.percent}% đã đủ số đo · ${sum.total} phép đo trong bộ lọc`;
      const areaRows=model.filterRows(rows,{...current,area:'',state:''});
      const areas=[...new Set(areaRows.map(r=>r.area))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
      $('areas').hidden=busy||failures>0;
      $('areas').replaceChildren(...areas.map(area=>{
        const group=model.summarize(areaRows.filter(r=>r.area===area)),button=node('button',null,{type:'button',class:'manager-area-card','aria-pressed':String(current.area===area)});
        const bar=node('progress',null,{max:'100',value:String(group.percent),'aria-label':`Tiến độ ${area}`});
        button.append(node('strong',area),node('span',`${group.complete}/${group.total} phép đo đã đủ`),bar,node('small',`${group.missing} còn thiếu · ${group.fail} không đạt · ${group.unknown} chưa đối chiếu`));
        button.addEventListener('click',()=>{$('area').value=current.area===area?'':area;render();});return button;
      }));
      $('count').textContent=`${selected.length} kết quả chỉ tiêu · ${sum.total} phép đo · ${sum.points} điểm lấy mẫu`;
      const body=$('table').querySelector('tbody');body.replaceChildren(...selected.map(row=>{
        const tr=node('tr',null,{'data-state':row.state});
        const point=node('td',null);point.append(node('strong',row.point),node('small',row.name));
        const metric=node('td',null);metric.append(node('span',row.label),node('small',row.form.toUpperCase()));
        const values=node('td',null);row.values.forEach((v,i)=>values.append(node('div',(row.values.length>1?`Lần ${i+1}: `:'')+v)));
        values.append(node('small',row.unit));
        const state=node('td',null);state.append(node('span',states[row.state],{class:'manager-verdict '+row.state}));if(!(row.measurementComplete??row.complete)&&row.state!=='missing')state.append(node('small',row.measurementComplete===false&&row.complete?'Thiếu cỡ tiểu phân còn lại':'Chưa đủ số đo'));
        const person=node('td',null);person.append(node('span',row.performer),node('small',(row.form==='bm04'&&row.system!=='steam'?'Trả kết quả: ':'Ngày đo: ')+row.date));if(row.sampledBy||row.samplingDate)person.append(node('small',`Lấy mẫu: ${row.sampledBy||'Chưa khai báo'} · ${row.samplingDate||'Chưa có ngày'}`));
        const source=node('td',null),link=node('a','Mở biểu mẫu',{href:sourceHref(row)});source.append(link,node('small',`v${row.version}`));
        if(row.savedAt){const date=new Date(row.savedAt);source.append(node('small',Number.isNaN(date.getTime())?'Chưa rõ thời gian lưu':'Lưu '+date.toLocaleString('vi-VN',{timeZone:'Asia/Bangkok',hour12:false})));}
        tr.append(node('td',row.area),node('td',systems[row.system]||row.system),point,metric,values,node('td',row.limits.length?row.limits.join(' · '):'Chưa có giới hạn'),state,person,source);return tr;
      }));
      $('empty').hidden=selected.length>0||busy;
      $('empty').textContent=runs.length?'Không có kết quả phù hợp với bộ lọc.':'Chưa có đợt thực hiện trong phạm vi được xem.';
      $('table').hidden=!selected.length;
    }
    function dependentOptions(){
      const subset=model.filterRows(rows,{system:$('system').value});
      options($('area'),[...new Set(subset.map(r=>r.area))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true})).map(a=>[a,a]),'Tất cả khu');
      const metric=$('metric'),keep=metric.value,choices=model.metricOptions(subset),groups=new Map();
      metric.replaceChildren(node('option','Tất cả chỉ tiêu',{value:''}));
      for(const choice of choices){
        if(!groups.has(choice.form)){const group=node('optgroup',null,{label:choice.form.toUpperCase()});groups.set(choice.form,group);metric.append(group);}
        groups.get(choice.form).append(node('option',choice.label,{value:choice.value}));
      }
      if(choices.some(choice=>choice.value===keep))metric.value=keep;
    }
    async function load(){
      const token=++request,run=runs.find(r=>r.id===$('run').value);rows=[];failures=0;busy=!!run;$('retry').hidden=true;render();
      if(!run){$('context').textContent='';message('Chưa có đợt thực hiện trong phạm vi được xem.','empty');return;}
      $('context').textContent=`${run.title} · ${run.status==='open'?'Đang nhập — số liệu chưa chốt':run.status==='completed'?'Đã chốt — hoàn thành phạm vi':'Đã chốt — kết thúc có lý do'} · Chỉ số đã lưu lên hệ thống`;
      message('Đang tải từng hồ sơ trong đợt…','loading');
      const items=(run.items||[]).filter(item=>allowed.includes(item.system));
      const results=await Promise.allSettled(items.map(item=>loadSnapshot(item.record_id,item.version)));
      if(token!==request||window.CPC1_SESSION_ENDED)return;
      results.forEach((result,index)=>{if(result.status==='rejected'){failures++;return;}rows.push(...model.buildRows(run,items[index],result.value));});
      busy=false;options($('system'),[...new Set(items.map(i=>i.system))].map(s=>[s,systems[s]]),'Tất cả hệ thống');dependentOptions();render();
      $('retry').hidden=!failures;
      message(failures?`Tổng hợp chưa đầy đủ: ${failures}/${items.length} hồ sơ chưa tải được. Bảng chỉ hiện phần đã tải; thử lại để xem đủ.`:`Đã đọc ${items.length} hồ sơ · Tiến độ số đo không thay thế hoàn tất hồ sơ hoặc phê duyệt QA.`,failures?'error':'ready');
    }
    $('run').addEventListener('change',()=>void load());
    controls.forEach(key=>$(key).addEventListener('change',()=>{if(key==='system')dependentOptions();render();}));
    $('retry').addEventListener('click',()=>void load());$('reload').addEventListener('click',onReload);
    $('reset').addEventListener('click',()=>{controls.forEach(key=>$(key).value='');dependentOptions();render();});
    function clear(){request++;rows=[];runs=[];allowed=[];busy=false;failures=0;$('run').replaceChildren();controls.forEach(key=>{if(key!=='state')$(key).replaceChildren(node('option','Tất cả',{value:''}));else $(key).value='';});$('context').textContent='';$('retry').hidden=true;render();message('Đang tải danh sách đợt…','loading');}
    window.addEventListener('cpc1:permission-denied',clear);
    return {fail(text){clear();failures=1;render();message(text,'error');},activate(){if(!active){active=true;void load();}},setData(nextRuns,nextAllowed){const keep=$('run').value;clear();allowed=nextAllowed;runs=[...nextRuns].sort((a,b)=>String(b.started_on).localeCompare(String(a.started_on)));$('run').replaceChildren(...runs.map(r=>node('option',r.title,{value:r.id})));if(runs.some(r=>r.id===keep))$('run').value=keep;if(active)void load();},clear};
  }
  window.CPC1Summary={mount};
})();
