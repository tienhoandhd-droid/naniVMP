/* Read-only aggregation of exact saved revisions. No measurement calculations. */
(() => {
  'use strict';
  const unknownArea='Chưa xác định khu';
  const gas={bm01:[['p05','Tiểu phân ≥ 0,5 µm','hạt/m³'],['p5','Tiểu phân ≥ 5 µm','hạt/m³']],bm02:[['result','Điểm sương','°C']],bm03:[['result','Hàm lượng dầu','mg/m³']],bm04:[['result','Vi sinh','CFU/m³']],bm05:[['result','Độ tinh khiết','%']]};
  const steam={bm01:[['result','Khí không ngưng tụ','%']],bm02:[['conductivity','Độ dẫn điện','µS/cm'],['toc','TOC','ppb'],['microbial','Vi sinh','CFU/100 mL'],['endotoxin','Nội độc tố','EU/mL']],bm03:[['result','Độ khô','D']],bm04:[['result','Quá nhiệt','°C'],['delta','Chênh lệch nhiệt độ','°C']]};
  function areaFor(point) {
    for(const key of ['area','zone'])if(typeof point?.[key]==='string'&&point[key].trim())return point[key].trim().toUpperCase();
    const roomId=/^([A-Z]\d+)\.[A-Z]\d+(?:-[A-Z]\d+)?$/i.exec(String(point?.id||''));
    const areas=[...new Set([...(roomId?[roomId[1].toUpperCase()]:[]),...Array.from(String(point?.name||'').toUpperCase().matchAll(/\b([A-Z]\d+)\.[A-Z]\d+\b/g),m=>m[1])])];
    return areas.length===1?areas[0]:unknownArea;
  }
  // SQL shown(numeric) returns text. Parse only the numeric representation;
  // keep the saved text and the existing exact-decimal comparison unchanged.
  function savedNumber(value) {
    if(typeof value==='number')return Number.isFinite(value)?value:null;
    if(typeof value!=='string')return null;
    const text=value.trim();
    if(text.length>100||!/^[-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text))return null;
    const numeric=Number(text.replace(',','.'));
    return Number.isFinite(numeric)?numeric:null;
  }
  const particle=row=>['air','nitrogen'].includes(row.system)&&row.form==='bm01'&&['p05','p5'].includes(row.metric);
  const workKey=row=>JSON.stringify([row.run||'',row.record||'',row.system,row.form,row.point,particle(row)?'particles':row.metric]);
  const completeFor=row=>row.measurementComplete??row.complete;
  const metricKey=row=>(row.system==='steam'?'steam:':'')+(row.metricKey||row.form+':'+row.metric);
  function buildRows(run,item,snapshot) {
    const ev=snapshot?.evaluation,config=ev?.source_context?.config,data=snapshot?.data,isSteam=item.system==='steam',rows=[];
    const scope=item.scope||ev?.run_scope||{};
    for(const [form,ids] of Object.entries(scope))for(const point of ids){
      const location=(isSteam?config?.locations:config?.forms?.find(f=>f.id===form)?.locations)?.find(p=>p.id===point);
      const measured=ev?.forms?.[form]?.rows?.[point];
      const trials=isSteam&&form!=='bm02'?Array.from({length:Math.max(3,Array.isArray(measured)?measured.length:0)},(_,i)=>measured?.[i]):[measured];
      for(const [metric,label,unit] of (isSteam?steam:gas)[form]||[]){
        if(isSteam&&metric==='endotoxin'&&location?.endotoxin===false)continue;
        const details=trials.map((result,index)=>{
          const raw=isSteam?(form==='bm02'?data?.[form]?.[point]:data?.[form]?.[point]?.[index]):data?.forms?.[form]?.[point];
          const value=result?.values?.[metric],parameterStatus=result?.parameters?.[metric],status=parameterStatus||result?.status;
          const trendRow={form,point_id:point,metric,label,unit,trial:index+1,value:savedNumber(value)};
          const action=window.CPC1TrendLimits.annotate(item.system,trendRow,snapshot);
          const savedLimit=window.CPC1TrendLimits.limitFor?.(item.system,form,metric,unit,point,snapshot);
          if(action.limit===null&&savedLimit){action.limit=savedLimit.limit;action.direction=savedLimit.direction;}
          const qualitative=isSteam&&metric==='endotoxin'&&((String(value).trim()==='Đạt'&&status==='pass')||(String(value).trim()==='Không đạt'&&status==='fail'));
          // Prefer the evaluator's saved verdict when it identifies this indicator.
          // A combined failure cannot determine which particle/steam subcriterion failed.
          const numeric=trendRow.value!==null,composite=((isSteam?steam:gas)[form]||[]).length>1;
          const savedVerdict=(numeric||qualitative)&&['pass','fail'].includes(status)&&(parameterStatus||!composite||status==='pass')?status:null;
          const verdict=savedVerdict||(action.state==='within'?'pass':['above','below'].includes(action.state)?'fail':null);
          const sourceWord=isSteam&&form==='bm02'&&metric==='microbial'&&/^(KPH|KFH)$/i.test(String(raw?.microbial).trim())?String(raw.microbial):null;
          return {status,action,raw,qualitative,verdict,value:sourceWord??action.rawValue??(value===null||value===undefined?'—':String(value)),numeric};
        });
        const complete=!!snapshot&&details.every(t=>['pass','fail'].includes(t.status)&&(t.numeric||t.qualitative));
        const hasFail=details.some(t=>t.verdict==='fail');
        const missing=details.some(t=>!t.status||t.status==='incomplete');
        const state=hasFail?'fail':!snapshot?'unknown':missing?'missing':details.every(t=>t.verdict==='pass')?'pass':'unknown';
        const people=[...new Set(details.map(t=>isSteam?t.raw?.executor:t.raw?.executed_by).filter(Boolean))];
        const dates=[...new Set(details.map(t=>isSteam?t.raw?.date:form==='bm04'?t.raw?.result_date:t.raw?.execution_date).filter(Boolean))];
        rows.push({system:item.system,form,point,metric,label,unit,metricKey:form+':'+metric,area:areaFor(location),name:location?.name||'Chưa có tên điểm trong phiên bản đã lưu',state,complete,values:details.map(t=>t.value),limits:details.some(t=>t.qualitative)?['Định tính: Đạt']:[...new Set(details.filter(t=>t.action.limit!==null).map(t=>(t.action.direction==='min'?'≥ ':'≤ ')+t.action.limit))],sampledBy:!isSteam&&form==='bm04'?details[0].raw?.sampled_by||null:null,samplingDate:!isSteam&&form==='bm04'?details[0].raw?.sampling_date||null:null,performer:people.join(' · ')||'Chưa khai báo',date:dates.join(' · ')||'Chưa khai báo',savedAt:snapshot?.created_at||null,record:item.record_id,version:item.version,run:run.id,runStatus:run.status});
      }
    }
    const particles=new Map();
    for(const row of rows)if(particle(row)){const key=workKey(row);if(!particles.has(key))particles.set(key,[]);particles.get(key).push(row);}
    for(const group of particles.values()){
      const complete=new Set(group.map(row=>row.metric)).size===2&&group.every(row=>row.complete);
      for(const row of group)row.measurementComplete=complete;
    }
    return rows;
  }
  function filterRows(rows,filters={}) {return rows.filter(row=>['system','area'].every(key=>!filters[key]||row[key]===filters[key])&&(!filters.state||(filters.state==='missing'?!completeFor(row):row.state===filters.state))&&(!filters.metric||metricKey(row)===filters.metric));}
  function metricOptions(rows) {
    const options=new Map();
    for(const row of rows)options.set(metricKey(row),{value:metricKey(row),label:row.label,form:row.form});
    return [...options.values()].sort((a,b)=>a.form.localeCompare(b.form,'vi',{numeric:true})||a.label.localeCompare(b.label,'vi',{numeric:true}));
  }
  function summarize(rows) {
    const groups=new Map();
    for(const row of rows){const key=workKey(row);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
    const measurements=[...groups.values()].map(group=>{
      const complete=group.every(row=>completeFor(row));
      return {complete,pass:complete&&group.every(row=>row.state==='pass'),fail:group.some(row=>row.state==='fail'),unknown:group.some(row=>row.state==='unknown')};
    });
    const total=measurements.length,complete=measurements.filter(m=>m.complete).length;
    return {total,complete,percent:total?Math.round(complete*100/total):0,points:new Set(rows.map(r=>r.system+':'+r.point)).size,missing:total-complete,...Object.fromEntries(['pass','fail','unknown'].map(state=>[state,measurements.filter(m=>m[state]).length]))};
  }
  window.CPC1SummaryModel=Object.freeze({areaFor,buildRows,filterRows,metricOptions,summarize});
})();
