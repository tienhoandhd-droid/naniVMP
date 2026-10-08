(() => {
  'use strict';
  const svgTags=new Set(['svg','g','line','rect','circle','path','text','title','desc']);
  const node=(tag,attrs={},children=[])=>{const n=svgTags.has(tag)?document.createElementNS('http://www.w3.org/2000/svg',tag):document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==='text')n.textContent=v;else n.setAttribute(k,v);}n.append(...children);return n;};
  const fmt=value=>Number.isFinite(value)?value.toLocaleString('vi-VN',{maximumSignificantDigits:7}):'—';
  const plottedValue=row=>row.uncertain?null:Number.isFinite(row.action?.plotValue)?row.action.plotValue:Number.isFinite(row.value)?row.value:null;
  const pointOrder=(a,b)=>String(a).localeCompare(String(b),'vi',{numeric:true});
  function prepare(rows,{system,snapshot,point,selectedMetric,groupRows=rows}={}){
    const groups=[...new Map(groupRows.map(r=>[JSON.stringify([r.form,r.metric,r.unit||'']),{form:r.form,metric:r.metric,unit:r.unit||'',label:r.label||r.metric}])).values()];
    // Both particle channels must remain visible even if one has no saved numbers.
    const particles=groups.filter(g=>g.form==='bm01'&&['p05','p5'].includes(g.metric)&&g.unit==='hạt/m³');
    if(system==='air'&&particles.length&&!selectedMetric){
      for(const [metric,label] of [['p05','Tiểu phân ≥ 0,5 µm'],['p5','Tiểu phân ≥ 5 µm']]){
        if(!particles.some(g=>g.metric===metric))groups.push({form:'bm01',metric,unit:'hạt/m³',label});
      }
    }
    return groups.map(group=>{
      group.rows=rows.filter(r=>r.form===group.form&&r.metric===group.metric&&(r.unit||'')===group.unit).map(r=>({...r,plotValue:plottedValue(r)}));
      const savedScope=snapshot?.evaluation?.run_scope?.[group.form];
      const scope=Array.isArray(savedScope)?savedScope.filter(id=>!(system==='steam'&&group.form==='bm02'&&group.metric==='endotoxin'
        &&snapshot?.evaluation?.source_context?.config?.locations?.find(p=>p.id===id)?.endotoxin===false)):[];
      const sibling=system==='air'&&group.form==='bm01'&&['p05','p5'].includes(group.metric)&&group.unit==='hạt/m³'
        ?rows.filter(r=>r.form==='bm01'&&['p05','p5'].includes(r.metric)&&r.unit==='hạt/m³').map(r=>r.point_id):[];
      group.points=[...new Set([...group.rows.map(r=>r.point_id),...sibling,...(Array.isArray(scope)?scope:[])])].filter(p=>p&&(!point||p===point)).sort(pointOrder);
      group.stats=new Map();group.outliers=new Set();
      for(const point of group.points){const samples=group.rows.filter(r=>r.point_id===point&&r.plotValue!==null),stats=window.CPC1BoxStats.summarize(samples.map(r=>r.plotValue));group.stats.set(point,stats);stats.outliers.forEach(o=>group.outliers.add(samples[o.index]));}
      return group;
    });
  }
  function chartKind(system,group){
    return system==='air'&&group.form==='bm01'&&['p05','p5'].includes(group.metric)&&group.unit==='hạt/m³'
      ||system==='steam'&&group.form==='bm02'&&group.metric==='conductivity'&&group.unit==='µS/cm'?'bar':'individual';
  }
  // Extrema are exact saved decimals; floating-point coordinates are for drawing only.
  function decimalKey(row){
    const raw=String(Number.isFinite(row.action?.plotValue)?row.action.rawValue??row.plotValue:row.plotValue).replace(',','.');
    const text=raw.length<=100&&/^[+-]?\d+(\.\d+)?$/.test(raw)?raw:String(row.plotValue);
    const match=/^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text);
    if(!match)return decimalKey({plotValue:row.plotValue});
    const fraction=match[3]||'',exponent=Number(match[4]||0),places=fraction.length-exponent;
    let n=BigInt((match[1]==='-'?'-':'')+match[2]+fraction);
    if(places<0)n*=10n**BigInt(-places);
    return {n,places:Math.max(0,places)};
  }
  function compareRows(a,b){
    const x=decimalKey(a),y=decimalKey(b),places=Math.max(x.places,y.places);
    const left=x.n*10n**BigInt(places-x.places),right=y.n*10n**BigInt(places-y.places);
    return left<right?-1:left>right?1:0;
  }
  function summarize(group,{snapshot,pending=false}={}){
    const points={pass:[],fail:[],unknown:[]};
    for(const point of group.points){
      const rows=group.rows.filter(r=>r.point_id===point);
      const valid=row=>row.plotValue!==null&&!row.uncertain;
      const saved=snapshot?.evaluation?.forms?.[group.form]?.rows?.[point];
      const missingTrial=Array.isArray(saved)&&saved.some((result,index)=>
        !result||!['pass','fail'].includes(result.parameters?.[group.metric]||result.status)
        ||!rows.some(r=>r.trial===index+1&&valid(r)&&r.action?.state==='within'));
      const state=pending?'unknown':rows.some(r=>valid(r)&&['above','below'].includes(r.action?.state))?'fail'
        :rows.length&&!missingTrial&&rows.every(r=>valid(r)&&r.action?.state==='within')?'pass':'unknown';
      points[state].push(point);
    }
    const samples=group.rows.filter(r=>r.plotValue!==null&&group.points.includes(r.point_id))
      .slice().sort((a,b)=>pointOrder(a.point_id,b.point_id)||(a.trial??0)-(b.trial??0));
    let min=null,max=null;
    for(const row of samples){
      if(!min||compareRows(row,min.rows[0])<0)min={value:row.plotValue,rows:[row]};else if(compareRows(row,min.rows[0])===0)min.rows.push(row);
      if(!max||compareRows(row,max.rows[0])>0)max={value:row.plotValue,rows:[row]};else if(compareRows(row,max.rows[0])===0)max.rows.push(row);
    }
    return {total:group.points.length,pass:points.pass.length,fail:points.fail.length,unknown:points.unknown.length,points,min,max};
  }
  function summaryTable(group,{snapshot,verdictPending,label,scope}){
    const summary=summarize(group,{snapshot,pending:verdictPending});
    const location=row=>`${label(group.form,row.point_id)}${row.trial!=null?' · lần '+row.trial:''}`;
    const extreme=value=>value?String(value.rows[0].action?.rawValue??value.value).replace('.',',')+(group.unit?' '+group.unit:''):'—';
    const rows=[
      ['min','Nhỏ nhất (min)',extreme(summary.min),summary.min?.rows.map(location)||[]],
      ['max','Lớn nhất (max)',extreme(summary.max),summary.max?.rows.map(location)||[]],
      ['pass','Số điểm đạt',verdictPending?'—':String(summary.pass),verdictPending?[]:summary.points.pass.map(id=>label(group.form,id))],
      ['fail','Số điểm không đạt',verdictPending?'—':String(summary.fail),verdictPending?[]:summary.points.fail.map(id=>label(group.form,id))],
      ['unknown','Chưa đủ đánh giá',String(summary.unknown),summary.points.unknown.map(id=>label(group.form,id))]
    ];
    return node('section',{class:'pq-summary-section'},[
      node('div',{class:'table-scroll',tabindex:'0',role:'region','aria-label':'Tổng kết '+group.label},[
        node('table',{class:'pq-point-summary'},[
          node('caption',{text:`Tổng kết ${group.label} · ${summary.total} điểm · ${scope}`}),
          node('thead',{},[node('tr',{},['Nội dung','Giá trị / số điểm','Vị trí lấy mẫu'].map(text=>node('th',{scope:'col',text})))]),
          node('tbody',{},rows.map(([key,title,value,locations])=>node('tr',{'data-summary':key},[
            node('th',{scope:'row',text:title}),node('td',{class:'pq-summary-value',text:value}),
            node('td',{class:'pq-summary-locations'},locations.length?locations.map(text=>node('div',{text})):[node('span',{text:verdictPending&&['pass','fail'].includes(key)?'Chưa tải được tiêu chí':'—'})])
          ])))
        ])
      ]),
      node('p',{class:'pq-summary-note',text:'Mỗi điểm chỉ đếm một lần cho chỉ tiêu này. Không đạt: có số đo ngoài giới hạn PQ; đạt: các số đo đã lưu đủ đối chiếu và trong giới hạn. Thiếu số đo hoặc tiêu chí: chưa đủ đánh giá. Ẩn điểm trên hình không thay đổi bảng tổng kết; bảng theo đợt và bộ lọc đang chọn.'})
    ]);
  }
  // Only horizontal packing changes; Y pixels and source order remain exact.
  function swarm(ys,gap=12){
    const result=Array(ys.length).fill(0),ordered=ys.map((y,i)=>({y,i})).sort((a,b)=>a.y-b.y||a.i-b.i);
    let cluster=[];
    const center=()=>{
      if(!cluster.length)return;
      const mid=(Math.min(...cluster.map(p=>p.x))+Math.max(...cluster.map(p=>p.x)))/2;
      cluster.forEach(p=>{result[p.i]=p.x-mid;});cluster=[];
    };
    for(const point of ordered){
      if(cluster.length&&point.y-cluster.at(-1).y>=gap)center();
      const neighbors=cluster.filter(p=>point.y-p.y<gap),candidates=[0];
      neighbors.forEach(p=>{const dx=Math.sqrt(Math.max(0,gap*gap-(point.y-p.y)**2))+1e-6;candidates.push(p.x-dx,p.x+dx);});
      candidates.sort((a,b)=>Math.abs(a)-Math.abs(b)||a-b);
      const x=candidates.find(x=>neighbors.every(p=>Math.hypot(x-p.x,point.y-p.y)>=gap-1e-7));
      cluster.push({...point,x});
    }
    center();return result;
  }
  let observers=[];
  function render(host,groups,{hiddenPoints,label,inspect,scope,verdictPending,system,snapshot}){
    observers.forEach(o=>o.disconnect());observers=[];host.replaceChildren();
    const dismissAll=()=>{host.querySelectorAll('.pq-tooltip').forEach(t=>{t.hidden=true;});host.querySelectorAll('.pq-figure [aria-describedby]').forEach(n=>n.removeAttribute('aria-describedby'));};
    if(!groups.length){host.append(node('p',{class:'empty',text:'Chưa có số liệu cho phạm vi đang chọn.'}));return;}
    groups.forEach((group,index)=>{
      const redesigned=system==='air'||system==='steam',primary=chartKind(system,group);
      const card=node('article',{class:'pq-metric-card'+(redesigned?' pq-point-card':''),'data-metric':group.metric,'aria-labelledby':'pq-heading-'+index});
      const out=group.rows.filter(r=>['above','below'].includes(r.action.state)).length;
      const unknown=group.rows.filter(r=>r.action.state==='unknown').length,valid=group.rows.filter(r=>r.plotValue!==null).length;
      card.append(node('header',{class:'pq-card-header'},[
        node('div',{},[node('p',{class:'eyebrow',text:group.form.toUpperCase()+' · '+scope}),node('h2',{id:'pq-heading-'+index,text:group.label}),node('p',{class:'pq-card-meta',text:`${group.unit||'Không có đơn vị'} · ${group.points.length} điểm lấy mẫu · ${valid}/${group.rows.length} số đo được vẽ`})]),
        node('div',{class:'pq-card-verdict'},[node('span',{class:out?'pq-warning':'',text:verdictPending?'Chưa tải được giới hạn PQ':group.rows.every(r=>r.action.state==='unknown')?'Chưa đối chiếu PQ':`${out} vượt PQ${unknown?' · '+unknown+' chưa đối chiếu':''}`}),node('span',{class:'pq-iqr-count',text:`${group.outliers.size} số đo khác biệt`})])
      ]));
      const visible=group.points.filter(p=>!hiddenPoints.has(p)),samples=group.rows.filter(r=>visible.includes(r.point_id)&&r.plotValue!==null);
      const numbers=samples.map(r=>r.plotValue);if(redesigned&&primary==='bar')numbers.push(0);samples.forEach(r=>{if(Number.isFinite(r.action.limit))numbers.push(r.action.limit);});
      let low=0,high=1;
      if(numbers.length){
        let min=numbers[0],max=min;for(const value of numbers){min=Math.min(min,value);max=Math.max(max,value);}
        const span=max-min,pad=(Number.isFinite(span)&&span>0?span:Math.max(Math.abs(max)*.1,1))*.12;
        low=min-pad;high=max+pad;if(!Number.isFinite(low)||!Number.isFinite(high)||high<=low){low=min;high=max>min?max:min+1;}
      }
      if(redesigned&&primary==='bar'&&numbers.every(v=>v>=0))low=0;
      const plots=node('div',{class:'pq-plots'}),figures=[];card.append(plots);
      for(const kind of (redesigned?[primary]:['individual','boxplot'])){
        const name=kind==='bar'?'Giá trị theo điểm · Cột nhóm':kind==='individual'?'Số đo theo điểm':'Phân bố số đo',titleId=`pq-${index}-${kind}-title`,descId=`pq-${index}-${kind}-desc`;
        const ruleCaption=node('span',{class:'pq-rule-caption',hidden:'hidden'});
        const tooltip=node('div',{class:'pq-tooltip',id:`pq-${index}-${kind}-tooltip`,role:'tooltip',hidden:'hidden'});
        const figure=node('figure',{class:'pq-figure'},[
          node('div',{class:'pq-plot-heading'},[node('div',{},[node('h3',{text:name}),node('p',{class:'pq-chart-type',text:kind==='boxplot'?'So sánh mức phân tán của số đo tại từng điểm':redesigned?'Một đợt lấy mẫu · Giữ riêng từng lần đo · L1, L2… là lần đo':'Từng số đo tại các điểm lấy mẫu'})]),ruleCaption])
        ]);
        const chart=node('svg',{'data-chart':kind,'data-y-min':low,'data-y-max':high,role:'group','aria-labelledby':titleId+' '+descId},[
          node('title',{id:titleId,text:group.label+' · '+name}),
          node('desc',{id:descId,text:`${scope}. Trục X là điểm lấy mẫu; trục Y là giá trị ${group.unit}. Hình thoi đỏ vượt giới hạn PQ đã lưu. Vòng cam là số đo khác biệt so với các số đo cùng điểm, không đồng nghĩa với vượt giới hạn. Nền đỏ nhạt chỉ vùng số ngoài giới hạn chung đã lưu. Không gộp các đợt. Mỗi dấu hoặc cột thể hiện một số đo đã lưu.`})
        ]);
        const scroll=node('div',{class:'pq-chart-scroll',tabindex:'0',role:'region','aria-label':name+' · '+group.label+' · có thể cuộn ngang'},[chart]);
        const hint=node('figcaption',{class:'pq-scroll-hint',hidden:'hidden',text:'Cuộn ngang để xem đủ các điểm lấy mẫu'});
        figure.append(scroll,hint,tooltip);plots.append(figure);
        const touchTargets=new Map();
        scroll.addEventListener('click',e=>{
          if(e.pointerType!=='touch')return;
          let nearest=null,distance=24;
          for(const [mark,show] of touchTargets){
            if(!mark.isConnected)continue;
            const r=mark.getBoundingClientRect(),d=Math.hypot(e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2);
            if(d<distance||(nearest&&Math.abs(d-distance)<1e-7&&mark.classList.contains('box-value'))){distance=d;nearest={mark,show};}
          }
          if(nearest){e.preventDefault();nearest.mark.focus({preventScroll:true});nearest.show();}
        });
        const hide=()=>{tooltip.hidden=true;figure.querySelectorAll('[aria-describedby]').forEach(n=>n.removeAttribute('aria-describedby'));};
        figure.addEventListener('keydown',e=>{if(e.key==='Escape')dismissAll();});
        scroll.addEventListener('scroll',hide,{passive:true});
        const bind=(mark,heading,value,detail,title)=>{
          const show=()=>{
            dismissAll();
            tooltip.replaceChildren(node('div',{class:'pq-tooltip-heading',text:heading}),node('strong',{class:'pq-tooltip-value',text:value}),node('div',{class:'pq-tooltip-detail',text:detail}));
            tooltip.hidden=false;mark.setAttribute('aria-describedby',tooltip.id);inspect(title);
            const a=mark.getBoundingClientRect(),b=figure.getBoundingClientRect(),w=tooltip.offsetWidth,h=tooltip.offsetHeight;
            const left=Math.max(8,Math.min(a.left-b.left+a.width/2-w/2,b.width-w-8));
            const above=a.top-b.top-h-12;
            tooltip.style.left=left+'px';tooltip.style.top=(above>=8?above:a.bottom-b.top+12)+'px';
          };
          touchTargets.set(mark,show);
          mark.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show();}});
          mark.addEventListener('focus',show);mark.addEventListener('pointerenter',show);mark.addEventListener('click',()=>{mark.focus({preventScroll:true});show();});
          mark.addEventListener('blur',hide);mark.addEventListener('pointerleave',()=>{if(document.activeElement!==mark)hide();});
        };
        figures.push({chart,scroll,kind,ruleCaption,hint,bind,hide,touchTargets});
      }
      const excluded=group.rows.length-valid,small=group.points.filter(p=>group.stats.get(p).smallSample);
      if(redesigned)card.append(summaryTable(group,{snapshot,verdictPending,label,scope}));
      const footer=node('div',{class:'pq-card-footer'});
      const smallNote=small.length>3?`${small.length} điểm có ít hơn 4 số đo; xem số lượng dưới từng hộp.`:small.length?`${small.join(', ')}: ít mẫu.`:'';
      const singletonNote=small.some(p=>group.stats.get(p).n===1)?'Điểm chỉ có một số đo không vẽ hộp phân bố.':'';
      footer.append(node('p',{class:'pq-sample-note',text:[smallNote||'Hộp cho thấy mức phân tán; các chấm bên cạnh là từng số đo.',singletonNote,excluded?`${excluded} dòng thiếu/chưa chắc chắn giữ trong bảng.`:'','Số đo khác biệt không đồng nghĩa với vượt giới hạn PQ.'].filter(Boolean).join(' ')}));
      const tbody=node('tbody',{},group.points.map(point=>{const st=group.stats.get(point);return node('tr',{'data-point':point},[label(group.form,point),st.n,fmt(st.q1),fmt(st.median),fmt(st.q3),fmt(st.iqr),fmt(st.lowerWhisker),fmt(st.upperWhisker),st.outliers.length].map(v=>node('td',{text:String(v)})));}));
      footer.append(node('details',{class:'trend-details'},[node('summary',{text:'Cách đọc phân bố và thống kê theo điểm'}),node('p',{class:'help',text:'Hộp chứa 50% số đo ở giữa (Q1–Q3); vạch giữa là trung vị. IQR = Q3 − Q1. Râu kéo đến số đo xa nhất còn nằm trong khoảng Q1 − 1,5 × IQR đến Q3 + 1,5 × IQR. Số đo ngoài khoảng này được đánh dấu khác biệt. n là số lượng số đo.'}),node('div',{class:'table-scroll',tabindex:'0',role:'region','aria-label':'Bảng thống kê '+group.label},[node('table',{class:'pq-stats-table'},[node('caption',{text:group.label+' · '+group.unit+' · phân vị tuyến tính (type 7)'}),node('thead',{},[node('tr',{},['Điểm','n','Q1','Trung vị','Q3','IQR','Râu dưới','Râu trên','Ngoại lai IQR'].map(t=>node('th',{scope:'col',text:t})))]),tbody])]) ]));
      if(!redesigned)card.append(footer);host.append(card);
      for(const {chart,scroll,kind,ruleCaption,hint,bind,hide,touchTargets} of figures){
        let lastWidth=0;
        const draw=()=>{
          const width=Math.ceil(scroll.clientWidth);if(width===lastWidth)return;lastWidth=width;hide();touchTargets.clear();
          const view=drawPlot(chart,group,visible,samples,kind,width,low,high,label,bind,redesigned)||{};
          ruleCaption.textContent=view.ruleText||'';ruleCaption.hidden=!view.ruleText;
          hint.hidden=Number(chart.getAttribute('width'))<=scroll.clientWidth+1;
        };
        draw();const observer=new ResizeObserver(draw);observer.observe(scroll);observers.push(observer);
      }
    });
  }
  function drawPlot(svg,group,points,samples,kind,available,low,high,label,bind,redesigned=false){
    svg.querySelectorAll('g').forEach(n=>n.remove());const g=node('g');svg.append(g);
    const bounds=points.map(point=>{
      const rows=samples.filter(r=>r.point_id===point),known=rows.filter(r=>Number.isFinite(r.action.limit)&&r.action.direction);
      return rows.length&&known.length===rows.length&&known.every(r=>r.action.limit===known[0].action.limit&&r.action.direction===known[0].action.direction)?known[0].action:null;
    });
    const shared=bounds.length&&bounds.every(b=>b&&b.limit===bounds[0]?.limit&&b.direction===bounds[0]?.direction);
    const ruleText=shared?`Giới hạn PQ ${bounds[0].direction==='max'?'≤':'≥'} ${fmt(bounds[0].limit)} ${group.unit}`:bounds.some(Boolean)?'Giới hạn PQ theo từng điểm':'';
    const height=350,left=redesigned?Math.max(64,Math.max(fmt(low).length,fmt(high).length)*7+22):60,top=28,bottom=254;
    const scale=Math.max(Math.abs(low),Math.abs(high),1),span=high/scale-low/scale,y=v=>bottom-(v/scale-low/scale)/span*(bottom-top);
    const boxHalf=Math.min(24,Math.max(points.length>=10?9:12,(available-80)/Math.max(1,points.length)*.075));
    // Calculate the required categorical footprint from both plots so X columns align.
    const layouts=points.map(point=>{
      const values=samples.filter(r=>r.point_id===point).sort((a,b)=>(a.trial??0)-(b.trial??0)),ys=values.map(r=>y(r.plotValue));
      const individual=swarm(ys,12),box=swarm(ys,9),extent=xs=>xs.length?Math.max(...xs)-Math.min(...xs):0;
      const lane=redesigned?Math.max(30,...values.map(r=>fmt(r.plotValue).length*7+12)):0;
      const footprint=redesigned?Math.max(48,values.length*lane+18):values.length>1?Math.max(extent(individual)+24,boxHalf*2+9+extent(box)+16):36;
      return {values,ys,individual,box,footprint,lane};
    });
    const pointSpace=Math.max(52,...points.map((point,i)=>Math.max(String(point).length*7+14,layouts[i].footprint,!shared&&bounds[i]?(`${bounds[i].direction==='max'?'≤':'≥'} ${fmt(bounds[i].limit)}`).length*6.5+16:0)));
    const width=Math.max(available,points.length*pointSpace+left+20),right=width-20,slot=(right-left)/Math.max(1,points.length),x=i=>left+slot*(i+.5);
    svg.setAttribute('width',width);svg.setAttribute('height',height);svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    if(shared){const yy=y(bounds[0].limit);g.append(node('rect',{x:left,y:bounds[0].direction==='max'?top:yy,width:right-left,height:Math.max(0,bounds[0].direction==='max'?yy-top:bottom-yy),class:'pq-exclusion-band'}));}
    points.forEach((point,i)=>g.append(node('rect',{x:left+slot*i,y:top,width:slot,height:bottom-top,class:'pq-point-column','data-point':point}),node('line',{x1:x(i),x2:x(i),y1:top,y2:bottom,class:'pq-point-guide','data-point':point})));
    const range=high-low,rawStep=range/5,power=10**Math.floor(Math.log10(rawStep)),ratio=rawStep/power,step=(ratio<=1?1:ratio<=2?2:ratio<=5?5:10)*power,ticks=[];
    if(Number.isFinite(step)&&step>0){for(let i=0,v=Math.ceil(low/step)*step;i<12&&v<=high;i++,v+=step)ticks.push(Math.abs(v)<step*1e-8?0:v);}else ticks.push(low,high);
    ticks.forEach(v=>g.append(node('line',{x1:left,x2:right,y1:y(v),y2:y(v),class:'pq-grid'}),node('text',{x:left-12,y:y(v)+4,'text-anchor':'end',class:'pq-axis',text:fmt(v)})));
    g.append(node('text',{x:left,y:16,class:'pq-axis pq-unit-label',text:group.unit}),node('line',{x1:left,x2:right,y1:bottom,y2:bottom,class:'pq-baseline'}));
    points.forEach((point,i)=>{
      g.append(node('text',{x:x(i),y:bottom+24,'text-anchor':'middle',class:'pq-axis pq-point-label',text:point},[node('title',{text:label(group.form,point)})]));
      if(kind==='boxplot')g.append(node('text',{x:x(i),y:bottom+43,'text-anchor':'middle',class:'pq-axis pq-n-label',text:'n='+group.stats.get(point).n}));
    });
    g.append(node('text',{x:(left+right)/2,y:342,'text-anchor':'middle',class:'pq-axis pq-x-title',text:'Điểm lấy mẫu'}));
    if(!samples.length){g.append(node('text',{x:width/2,y:145,'text-anchor':'middle',class:'chart-empty',text:points.length?'Chưa có số đo hợp lệ để vẽ.':'Đã ẩn tất cả điểm.'}));return {ruleText};}
    const bound=(b,x1,x2,point)=>{
      g.append(node('line',{x1,x2,y1:y(b.limit),y2:y(b.limit),class:'pq-limit','data-scope':point?'point':'shared',...(point?{'data-point':point}:{})}));
      if(point)g.append(node('text',{x:(x1+x2)/2,y:bottom+62,'text-anchor':'middle',class:'pq-limit-label','data-point':point,text:`${b.direction==='max'?'≤':'≥'} ${fmt(b.limit)}`}));
    };
    if(shared)bound(bounds[0],left,right);else bounds.forEach((b,i)=>{if(b)bound(b,x(i)-slot*.4,x(i)+slot*.4,points[i]);});
    points.forEach((point,i)=>{
      const {values,ys,individual,box:offsets,lane}=layouts[i],stats=group.stats.get(point),xx=x(i);
      const minOffset=offsets.length?Math.min(...offsets):0,spread=offsets.length?Math.max(...offsets)-minOffset:0;
      const boxX=stats.n>1?xx-(9+spread+8)/2:xx,capHalf=Math.min(12,boxHalf*.6);
      if(kind==='boxplot'&&stats.n){
        const distribution=`${stats.n} số đo · khoảng giữa ${fmt(stats.q1)} đến ${fmt(stats.q3)} ${group.unit} · độ rộng khoảng giữa ${fmt(stats.iqr)} ${group.unit} · ${stats.outliers.length} số đo khác biệt`;
        const summary=`${label(group.form,point)} · giá trị giữa ${fmt(stats.median)} ${group.unit} · ${distribution}`;
        const box=node('g',{class:'box-summary','data-point':point,'data-n':stats.n,tabindex:'0',role:'button','aria-label':summary});
        if(stats.n>1){
          box.append(node('line',{x1:boxX,x2:boxX,y1:y(stats.lowerWhisker),y2:y(stats.upperWhisker),class:'box-whisker'}));
          for(const v of [stats.lowerWhisker,stats.upperWhisker])box.append(node('line',{x1:boxX-capHalf,x2:boxX+capHalf,y1:y(v),y2:y(v),class:'box-whisker'}));
          box.append(node('rect',{x:boxX-boxHalf,y:y(stats.q3),width:boxHalf*2,height:Math.max(1,y(stats.q1)-y(stats.q3)),class:'box-body'}));
        }
        box.append(node('line',{x1:boxX-(stats.n===1?capHalf:boxHalf),x2:boxX+(stats.n===1?capHalf:boxHalf),y1:y(stats.median),y2:y(stats.median),class:'box-median'}));g.append(box);
        bind(box,label(group.form,point),`Giá trị giữa ${fmt(stats.median)} ${group.unit}`,distribution,summary);
      }
      values.forEach((row,j)=>{
        const cx=redesigned?xx+(j-(values.length-1)/2)*lane:kind==='individual'?xx+individual[j]:stats.n>1?boxX+boxHalf+9+offsets[j]-minOffset:xx,yy=ys[j];
        const outside=['above','below'].includes(row.action.state),outlier=group.outliers.has(row);
        const heading=`${label(group.form,point)} · lần ${row.trial??1}`,value=`${row.action.rawValue??row.plotValue} ${group.unit}`;
        const criterion=Number.isFinite(row.action.limit)&&row.action.direction?`PQ đã lưu ${row.action.direction==='max'?'≤':'≥'} ${fmt(row.action.limit)} ${group.unit}`:'Chưa có giới hạn PQ phù hợp cho số đo này.';
        const detail=[row.action.reason,criterion,outlier?'Số đo khác biệt so với các số đo cùng điểm; không đồng nghĩa với vượt giới hạn PQ.':'Không được đánh dấu khác biệt với số liệu hiện có.'].filter(Boolean).join('\n');
        const title=`${heading}: ${value} · ${detail.replace(/\n/g,' · ')}`;
        const attrs={class:(kind==='bar'?'bar-value':kind==='individual'?'individual-value':'box-value')+(redesigned?' pq-trial-'+((Math.max(1,row.trial??1)-1)%3):'')+(outside?' pq-outside':''),'data-point':point,'data-value':String(row.plotValue),tabindex:'0',role:'button','aria-label':title};
        const radius=kind==='individual'?5:3.5;
        const mark=kind==='bar'?node('rect',{...attrs,x:cx-11,y:Math.min(y(0),yy),width:22,height:Math.max(1,Math.abs(y(0)-yy)),rx:2}):outside?node('path',{...attrs,d:`M${cx},${yy-5}l5,5 -5,5 -5,-5 Z`}):node('circle',{...attrs,cx,cy:yy,r:radius});
        g.append(mark);bind(mark,heading,value,detail,title);
        if(redesigned||kind==='individual'&&values.length===1)g.append(node('text',{x:cx,y:kind==='bar'&&row.plotValue<0?yy+16:yy-14,'text-anchor':'middle',class:'pq-value-label','data-point':point,text:fmt(row.plotValue)}));
        if(redesigned&&row.trial!=null)g.append(node('text',{x:cx,y:bottom+43,'text-anchor':'middle',class:'pq-axis pq-trial-label','data-point':point,text:'L'+row.trial}));
        if(kind==='bar'&&outside)g.append(node('path',{d:`M${cx},${yy-5}l5,5 -5,5 -5,-5 Z`,class:'pq-outside','data-point':point,'aria-hidden':'true','pointer-events':'none'}));
        if(outlier)g.append(node('circle',{cx,cy:yy,r:9,class:'stat-outlier','data-point':point,'pointer-events':'none'},[node('title',{text:title})]));
      });
    });
    return {ruleText};
  }
  window.CPC1PQCharts={prepare,render,swarm,summarize,chartKind};
})();
