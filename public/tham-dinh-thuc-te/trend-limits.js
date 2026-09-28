(() => {
  'use strict';
  // Display-only comparison of saved results/criteria; never changes a saved decision.
  const steam = {
    bm01:{result:['ncg_max','max','%']},
    bm02:{conductivity:['conductivity_max','max','µS/cm'],toc:['toc_max','max','ppb'],microbial:['microbial_max','max','CFU/100 mL'],endotoxin:['endotoxin_max','max','EU/mL']},
    bm03:{result:['dryness_min','min','D']},
    bm04:{result:['superheat_max','max','°C'],delta:['delta_max','max','°C']}
  };
  const gas={bm01:{p05:['p05','max','hạt/m³'],p5:['p5','max','hạt/m³']},bm02:{result:['dewpoint','max','°C']},bm03:{result:['oil','max','mg/m³']},bm04:{result:['microbial','max','CFU/m³']},bm05:{result:['purity','min','%']}};
  function decimal(value) {
    const text=String(value??'').trim().replace(',','.');
    if(text.length>100 || !/^[+-]?\d+(\.\d+)?$/.test(text))return null;
    const places=text.split('.')[1]?.length||0;
    return {n:BigInt(text.replace('.','')),scale:10n**BigInt(places)};
  }
  function compare(a,b) {
    const x=decimal(a),y=decimal(b);if(!x||!y)return null;
    const left=x.n*y.scale,right=y.n*x.scale;return left<right?-1:left>right?1:0;
  }
  function annotate(system,row,snapshot) {
    const base={state:'unknown',limit:null,direction:null,plotValue:null,rawValue:null,reason:'Chưa tải được tiêu chí của phiên bản đã lưu.'};
    if(!Number.isFinite(row.value))return {...base,reason:'Thiếu giá trị số đã lưu; không biểu diễn.'};
    if(row.uncertain)return {...base,reason:'Giá trị nguồn chưa chắc chắn; không biểu diễn.'};
    const ev=snapshot?.evaluation,ctx=ev?.source_context;
    if(!ctx || (system==='steam' ? snapshot.data?.system && snapshot.data.system!=='steam' : snapshot.data?.system!==system || ctx.config?.system!==system))return base;
    const contract=(system==='steam'?steam:gas)[row.form]?.[row.metric];
    if(!contract||contract[2]!==row.unit)return {...base,reason:'Chỉ tiêu hoặc đơn vị không khớp tiêu chí đã lưu.'};
    let measured=ev.forms?.[row.form]?.rows?.[row.point_id];
    if(Array.isArray(measured))measured=Number.isInteger(row.trial)&&row.trial>0?measured[row.trial-1]:null;
    if(!measured)return {...base,reason:'Không tìm thấy kết quả tương ứng trong phiên bản đã lưu.'};
    const status=measured.parameters?.[row.metric]||measured.status;
    if(!['pass','fail'].includes(status))return {...base,reason:'Kết quả chưa đủ hoặc không hợp lệ; không kết luận ngoài giới hạn.'};
    let rawValue;
    if(row.metric==='result')rawValue=measured.values?.raw_result;
    else if(system==='steam'&&row.form==='bm02')rawValue=snapshot.data?.bm02?.[row.point_id]?.[row.metric];
    else if(system!=='steam'&&row.form==='bm01')rawValue=snapshot.data?.forms?.bm01?.[row.point_id]?.[row.metric];
    else rawValue=measured.values?.[row.metric];
    const numeric=decimal(rawValue)?Number(String(rawValue).replace(',','.')):NaN;
    if(!Number.isFinite(numeric))return {...base,reason:'Thiếu giá trị đủ chính xác trong kết quả đã lưu.'};
    const result={...base,plotValue:numeric,rawValue:String(rawValue)};
    const [key,direction]=contract;
    const limit=system==='steam'?ctx.criteria?.[key]:ctx.config.forms?.find(f=>f.id===row.form)?.locations?.find(p=>p.id===row.point_id)?.limits?.[key];
    const cmp=compare(rawValue,limit);
    if(cmp===null || !Number.isFinite(Number(limit)))return {...result,reason:'Chưa có giới hạn hành động trong tiêu chí đã lưu.'};
    Object.assign(result,{limit:Number(limit),direction});
    // Steam delta is stored rounded; a composite fail at its rounded boundary
    // cannot establish which criterion failed. Keep explicitly unknown.
    if(system==='steam'&&row.metric==='delta'&&cmp===0&&status!=='pass')return {...result,reason:'Giá trị làm tròn nằm trên biên; trạng thái tổng hợp chưa xác định riêng chỉ tiêu này.'};
    // Gas oil is decided on the server by exact cross-multiplication. Even raw_result
    // is a finite-precision quotient, so retain that saved single-criterion decision.
    if(system!=='steam'&&row.form==='bm03')return {...result,state:status==='fail'?'above':'within',reason:status==='fail'?'Vượt giới hạn trên (theo kết quả tính đã lưu)':'Trong giới hạn hành động'};
    const state=direction==='max'&&cmp>0?'above':direction==='min'&&cmp<0?'below':'within';
    return {...result,state,reason:state==='above'?'Vượt giới hạn trên':state==='below'?'Dưới giới hạn dưới':'Trong giới hạn hành động'};
  }
  window.CPC1TrendLimits={annotate};
})();
