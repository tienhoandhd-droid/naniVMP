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
  // Giới hạn PQ của một chỉ tiêu tại một điểm theo tiêu chí ĐÃ LƯU (chỉ để vẽ
  // đường giới hạn trên biểu đồ qua các đợt). Cùng nguồn với annotate().
  function limitFor(system,form,metric,unit,pointId,snapshot) {
    const ctx=snapshot?.evaluation?.source_context,contract=(system==='steam'?steam:gas)[form]?.[metric];
    if(!ctx||!contract||contract[2]!==unit)return null;
    if(system==='steam'?snapshot.data?.system&&snapshot.data.system!=='steam':snapshot.data?.system!==system||ctx.config?.system!==system)return null;
    const [key,direction]=contract;
    const limit=system==='steam'?ctx.criteria?.[key]:ctx.config.forms?.find(f=>f.id===form)?.locations?.find(p=>p.id===pointId)?.limits?.[key];
    return limit!==null&&limit!==undefined&&limit!==''&&Number.isFinite(Number(limit))?{limit:Number(limit),direction}:null;
  }
  // ---- Gói 4 (16/10): ngưỡng cảnh báo / hành động do Admin đặt ----------
  // Annex 1 §9.9: đặt từ dữ liệu thẩm định, xem lại định kỳ; §6.14: vượt cảnh
  // báo phải ghi nhận, vượt hành động phải điều tra. Máy chỉ so và GỢI Ý.
  const directionOf=(system,form,metric)=>(system==='steam'?steam:gas)[form]?.[metric]?.[1]||null;
  // Ngưỡng có hiệu lực cho một tháng (month = 'YYYY-MM…'; bỏ trống = bản mới nhất).
  // Ưu tiên ngưỡng riêng của điểm, không có thì dùng ngưỡng chung của chỉ tiêu.
  function levelFor(levels,form,metric,unit,pointId,month) {
    const pick=point=>(levels||[]).filter(l=>l.form===form&&l.metric===metric&&l.unit===unit&&l.point_id===point&&(!month||String(l.hieu_luc_tu).slice(0,7)<=String(month).slice(0,7)))
      .sort((a,b)=>b.phien_ban-a.phien_ban)[0]||null;
    return (pointId&&pick(pointId))||pick('');
  }
  function classify(value,level) {
    if(!level||!Number.isFinite(value))return 'ok';
    const vuot=(x,nguong)=>level.direction==='max'?x>Number(nguong):x<Number(nguong);
    return vuot(value,level.action)?'action':vuot(value,level.alert)?'alert':'ok';
  }
  // points: [{label, months:[{month, state:'ok'|'alert'|'action'|null}]}] — null = tháng không có số liệu.
  // Báo: mọi lần vượt hành động; vượt cảnh báo từ 2 đợt có số liệu liên tiếp.
  function signals(points) {
    const thang=m=>`${m.slice(5,7)}/${m.slice(0,4)}`,out=[];
    points.forEach(p=>{
      const co=p.months.filter(m=>m.state);let chuoi=[];
      const dong=()=>{if(chuoi.length>=2)out.push({muc:'alert',text:`${p.label}: vượt mức cảnh báo ${chuoi.length} đợt liên tiếp (${thang(chuoi[0])}–${thang(chuoi.at(-1))}) — xem xét xu hướng.`});chuoi=[];};
      co.forEach(m=>{
        if(m.state==='action')out.push({muc:'action',text:`${p.label} · ${thang(m.month)}: vượt mức hành động — cần điều tra.`});
        if(m.state==='ok')dong();else chuoi.push(m.month);
      });
      dong();
    });
    return out.sort((a,b)=>(a.muc==='action'?0:1)-(b.muc==='action'?0:1));
  }
  // Gợi ý từ lịch sử: hoá lý trung bình ± 2SD/3SD; vi sinh (CFU) percentile 95/99.
  const SO_LIEU_TOI_THIEU=10;
  function suggest(values,direction,unit) {
    const v=(values||[]).filter(Number.isFinite).sort((a,b)=>a-b),n=v.length,lamTron=x=>Number(x.toPrecision(3));
    if(!['max','min'].includes(direction))return {du:false,text:'Chỉ tiêu này chưa có chiều giới hạn; chưa gợi ý được.'};
    if(n<SO_LIEU_TOI_THIEU)return {du:false,text:`Cần ít nhất ${SO_LIEU_TOI_THIEU} kết quả để gợi ý (hiện có ${n}).`};
    if(/CFU/i.test(unit||'')&&direction==='max') {
      const phanVi=p=>v[Math.min(n-1,Math.ceil(p/100*n)-1)],alert=phanVi(95),action=phanVi(99);
      if(alert===action)return {du:false,text:`Số liệu vi sinh quá ít dao động (${n} kết quả); chưa gợi ý được.`};
      return {du:true,alert,action,text:`Gợi ý từ ${n} kết quả: cảnh báo = phân vị 95 (${alert}), hành động = phân vị 99 (${action}).`};
    }
    const mean=v.reduce((a,b)=>a+b,0)/n,sd=Math.sqrt(v.reduce((a,b)=>a+(b-mean)**2,0)/(n-1));
    if(!(sd>0))return {du:false,text:`Số liệu không dao động (${n} kết quả); chưa gợi ý được.`};
    const dau=direction==='max'?1:-1,alert=lamTron(mean+dau*2*sd),action=lamTron(mean+dau*3*sd);
    return {du:true,alert,action,text:`Gợi ý từ ${n} kết quả: trung bình ${lamTron(mean)}, độ lệch chuẩn ${lamTron(sd)} → cảnh báo ${dau>0?'+':'−'}2SD = ${alert}, hành động ${dau>0?'+':'−'}3SD = ${action}.`};
  }
  window.CPC1TrendLimits={annotate,limitFor,directionOf,levelFor,classify,signals,suggest};
})();
