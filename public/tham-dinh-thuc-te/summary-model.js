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
          const value=result?.values?.[metric],status=result?.parameters?.[metric]||result?.status;
          const trendRow={form,point_id:point,metric,label,unit,trial:index+1,value:typeof value==='number'&&Number.isFinite(value)?value:null};
          const action=window.CPC1TrendLimits.annotate(item.system,trendRow,snapshot);
          return {status,action,raw,value:action.rawValue??(value===null||value===undefined?'—':String(value)),numeric:trendRow.value!==null};
        });
        const complete=!!snapshot&&details.every(t=>['pass','fail'].includes(t.status)&&t.numeric);
        const hasFail=details.some(t=>['above','below'].includes(t.action.state));
        const missing=details.some(t=>!t.status||t.status==='incomplete');
        const state=hasFail?'fail':!snapshot?'unknown':missing?'missing':details.every(t=>t.action.state==='within')?'pass':'unknown';
        const people=[...new Set(details.map(t=>isSteam?t.raw?.executor:t.raw?.executed_by).filter(Boolean))];
        const dates=[...new Set(details.map(t=>isSteam?t.raw?.date:form==='bm04'?t.raw?.result_date:t.raw?.execution_date).filter(Boolean))];
        rows.push({system:item.system,form,point,metric,label,unit,metricKey:form+':'+metric,area:areaFor(location),name:location?.name||'Chưa có tên điểm trong phiên bản đã lưu',state,complete,values:details.map(t=>t.value),limits:[...new Set(details.filter(t=>t.action.limit!==null).map(t=>(t.action.direction==='min'?'≥ ':'≤ ')+t.action.limit))],sampledBy:!isSteam&&form==='bm04'?details[0].raw?.sampled_by||null:null,samplingDate:!isSteam&&form==='bm04'?details[0].raw?.sampling_date||null:null,performer:people.join(' · ')||'Chưa khai báo',date:dates.join(' · ')||'Chưa khai báo',savedAt:snapshot?.created_at||null,record:item.record_id,version:item.version,run:run.id,runStatus:run.status});
      }
    }
    return rows;
  }
  function filterRows(rows,filters={}) {return rows.filter(row=>['system','area'].every(key=>!filters[key]||row[key]===filters[key])&&(!filters.state||(filters.state==='missing'?!row.complete:row.state===filters.state))&&(!filters.metric||row.metricKey===filters.metric));}
  function summarize(rows) {
    const total=rows.length,complete=rows.filter(r=>r.complete).length;
    return {total,complete,percent:total?Math.round(complete*100/total):0,points:new Set(rows.map(r=>r.system+':'+r.point)).size,missing:total-complete,...Object.fromEntries(['pass','fail','unknown'].map(state=>[state,rows.filter(r=>r.state===state).length]))};
  }
  window.CPC1SummaryModel=Object.freeze({areaFor,buildRows,filterRows,summarize});
})();
