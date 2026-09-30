(() => {
  'use strict';
  const svgTags=new Set(['svg','g','line','rect','circle','path','text','title','desc']);
  const node=(tag,attrs={},children=[])=>{const n=svgTags.has(tag)?document.createElementNS('http://www.w3.org/2000/svg',tag):document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==='text')n.textContent=v;else n.setAttribute(k,v);}n.append(...children);return n;};
  const fmt=value=>Number.isFinite(value)?value.toLocaleString('vi-VN',{maximumSignificantDigits:7}):'—';
  const plottedValue=row=>row.uncertain?null:Number.isFinite(row.action?.plotValue)?row.action.plotValue:Number.isFinite(row.value)?row.value:null;
  function prepare(rows){
    const groups=[...new Map(rows.map(r=>[JSON.stringify([r.form,r.metric,r.unit||'']),{form:r.form,metric:r.metric,unit:r.unit||'',label:r.label||r.metric}])).values()];
    return groups.map(group=>{
      group.rows=rows.filter(r=>r.form===group.form&&r.metric===group.metric&&(r.unit||'')===group.unit).map(r=>({...r,plotValue:plottedValue(r)}));
      group.points=[...new Set(group.rows.map(r=>r.point_id))].sort((a,b)=>String(a).localeCompare(String(b),'vi',{numeric:true}));group.stats=new Map();group.outliers=new Set();
      for(const point of group.points){const samples=group.rows.filter(r=>r.point_id===point&&r.plotValue!==null),stats=window.CPC1BoxStats.summarize(samples.map(r=>r.plotValue));group.stats.set(point,stats);stats.outliers.forEach(o=>group.outliers.add(samples[o.index]));}
      return group;
    });
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
  function render(host,groups,{hiddenPoints,label,inspect,scope,verdictPending}){
    observers.forEach(o=>o.disconnect());observers=[];host.replaceChildren();
    const dismissAll=()=>{host.querySelectorAll('.pq-tooltip').forEach(t=>{t.hidden=true;});host.querySelectorAll('.pq-figure [aria-describedby]').forEach(n=>n.removeAttribute('aria-describedby'));};
    if(!groups.length){host.append(node('p',{class:'empty',text:'Chưa có số liệu cho phạm vi đang chọn.'}));return;}
    groups.forEach((group,index)=>{
      const card=node('article',{class:'pq-metric-card','aria-labelledby':'pq-heading-'+index});
      const out=group.rows.filter(r=>['above','below'].includes(r.action.state)).length;
      const unknown=group.rows.filter(r=>r.action.state==='unknown').length,valid=group.rows.filter(r=>r.plotValue!==null).length;
      card.append(node('header',{class:'pq-card-header'},[
        node('div',{},[node('p',{class:'eyebrow',text:group.form.toUpperCase()+' · '+scope}),node('h2',{id:'pq-heading-'+index,text:group.label}),node('p',{class:'pq-card-meta',text:`${group.unit||'Không có đơn vị'} · ${group.points.length} điểm lấy mẫu · ${valid}/${group.rows.length} số đo được vẽ`})]),
        node('div',{class:'pq-card-verdict'},[node('span',{class:out?'pq-warning':'',text:verdictPending?'Đang chờ tiêu chí PQ':group.rows.every(r=>r.action.state==='unknown')?'Chưa đối chiếu PQ':`${out} vượt PQ${unknown?' · '+unknown+' chưa đối chiếu':''}`}),node('span',{class:'pq-iqr-count',text:`${group.outliers.size} ngoại lai IQR`})])
      ]));
      const visible=group.points.filter(p=>!hiddenPoints.has(p)),samples=group.rows.filter(r=>visible.includes(r.point_id)&&r.plotValue!==null);
      const numbers=samples.map(r=>r.plotValue);samples.forEach(r=>{if(Number.isFinite(r.action.limit))numbers.push(r.action.limit);});
      let low=0,high=1;
      if(numbers.length){
        let min=numbers[0],max=min;for(const value of numbers){min=Math.min(min,value);max=Math.max(max,value);}
        const span=max-min,pad=(Number.isFinite(span)&&span>0?span:Math.max(Math.abs(max)*.1,1))*.12;
        low=min-pad;high=max+pad;if(!Number.isFinite(low)||!Number.isFinite(high)||high<=low){low=min;high=max>min?max:min+1;}
      }
      const plots=node('div',{class:'pq-plots'}),figures=[];card.append(plots);
      for(const kind of ['individual','boxplot']){
        const name=kind==='individual'?'Individual chart':'Boxplot',titleId=`pq-${index}-${kind}-title`,descId=`pq-${index}-${kind}-desc`;
        const ruleCaption=node('span',{class:'pq-rule-caption',hidden:'hidden'});
        const tooltip=node('div',{class:'pq-tooltip',id:`pq-${index}-${kind}-tooltip`,role:'tooltip',hidden:'hidden'});
        const figure=node('figure',{class:'pq-figure'},[
          node('div',{class:'pq-plot-heading'},[node('div',{},[node('h3',{text:name}),node('p',{class:'pq-chart-type',text:kind==='individual'?'Từng số đo tại các điểm lấy mẫu':'Hộp Q1–Q3 · trung vị · râu 1,5 × IQR'})]),ruleCaption])
        ]);
        const chart=node('svg',{'data-chart':kind,'data-y-min':low,'data-y-max':high,role:'group','aria-labelledby':titleId+' '+descId},[
          node('title',{id:titleId,text:group.label+' · '+name}),
          node('desc',{id:descId,text:`${scope}. Trục X là điểm lấy mẫu; trục Y là giá trị ${group.unit}. Hình thoi đỏ vượt giới hạn PQ đã lưu. Vòng cam là ngoại lai thống kê 1,5 IQR. Nền đỏ nhạt chỉ vùng số ngoài giới hạn chung đã lưu. Không gộp các đợt. Một số đo chỉ vẽ điểm và trung vị.`})
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
      const footer=node('div',{class:'pq-card-footer'});
      const smallNote=small.length>3?`${small.length} điểm có ít hơn 4 số đo; xem n dưới từng hộp.`:small.length?`${small.join(', ')}: ít mẫu.`:'';
      const singletonNote=small.some(p=>group.stats.get(p).n===1)?'n=1 chỉ có số đo và trung vị.':'';
      footer.append(node('p',{class:'pq-sample-note',text:[smallNote||'Hộp thể hiện Q1–Q3; các chấm bên cạnh là số đo gốc.',singletonNote,excluded?`${excluded} dòng thiếu/chưa chắc chắn giữ trong bảng.`:'','Ngoại lai IQR được đánh dấu riêng với vượt PQ.'].filter(Boolean).join(' ')}));
      const tbody=node('tbody',{},group.points.map(point=>{const st=group.stats.get(point);return node('tr',{'data-point':point},[label(group.form,point),st.n,fmt(st.q1),fmt(st.median),fmt(st.q3),fmt(st.iqr),fmt(st.lowerWhisker),fmt(st.upperWhisker),st.outliers.length].map(v=>node('td',{text:String(v)})));}));
      footer.append(node('details',{class:'trend-details'},[node('summary',{text:'Xem thống kê Boxplot theo điểm'}),node('div',{class:'table-scroll',tabindex:'0',role:'region','aria-label':'Bảng thống kê '+group.label},[node('table',{class:'pq-stats-table'},[node('caption',{text:group.label+' · '+group.unit+' · phân vị tuyến tính (type 7)'}),node('thead',{},[node('tr',{},['Điểm','n','Q1','Trung vị','Q3','IQR','Râu dưới','Râu trên','Ngoại lai IQR'].map(t=>node('th',{scope:'col',text:t})))]),tbody])]) ]));
      card.append(footer);host.append(card);
      for(const {chart,scroll,kind,ruleCaption,hint,bind,hide,touchTargets} of figures){
        let lastWidth=0;
        const draw=()=>{
          const width=Math.ceil(scroll.clientWidth);if(width===lastWidth)return;lastWidth=width;hide();touchTargets.clear();
          const view=drawPlot(chart,group,visible,samples,kind,width,low,high,label,bind)||{};
          ruleCaption.textContent=view.ruleText||'';ruleCaption.hidden=!view.ruleText;
          hint.hidden=Number(chart.getAttribute('width'))<=scroll.clientWidth+1;
        };
        draw();const observer=new ResizeObserver(draw);observer.observe(scroll);observers.push(observer);
      }
    });
  }
  function drawPlot(svg,group,points,samples,kind,available,low,high,label,bind){
    svg.querySelectorAll('g').forEach(n=>n.remove());const g=node('g');svg.append(g);
    const bounds=points.map(point=>{
      const rows=samples.filter(r=>r.point_id===point),known=rows.filter(r=>Number.isFinite(r.action.limit)&&r.action.direction);
      return rows.length&&known.length===rows.length&&known.every(r=>r.action.limit===known[0].action.limit&&r.action.direction===known[0].action.direction)?known[0].action:null;
    });
    const shared=bounds.length&&bounds.every(b=>b&&b.limit===bounds[0]?.limit&&b.direction===bounds[0]?.direction);
    const ruleText=shared?`Giới hạn PQ ${bounds[0].direction==='max'?'≤':'≥'} ${fmt(bounds[0].limit)} ${group.unit}`:bounds.some(Boolean)?'Giới hạn PQ theo từng điểm':'';
    const height=350,left=60,top=28,bottom=254;
    const scale=Math.max(Math.abs(low),Math.abs(high),1),span=high/scale-low/scale,y=v=>bottom-(v/scale-low/scale)/span*(bottom-top);
    const boxHalf=Math.min(24,Math.max(points.length>=10?9:12,(available-80)/Math.max(1,points.length)*.075));
    // Calculate the required categorical footprint from both plots so X columns align.
    const layouts=points.map(point=>{
      const values=samples.filter(r=>r.point_id===point),ys=values.map(r=>y(r.plotValue));
      const individual=swarm(ys,12),box=swarm(ys,9),extent=xs=>xs.length?Math.max(...xs)-Math.min(...xs):0;
      const footprint=values.length>1?Math.max(extent(individual)+24,boxHalf*2+9+extent(box)+16):36;
      return {values,ys,individual,box,footprint};
    });
    const pointSpace=Math.max(52,...points.map((point,i)=>Math.max(String(point).length*7+14,layouts[i].footprint,!shared&&bounds[i]?(`${bounds[i].direction==='max'?'≤':'≥'} ${fmt(bounds[i].limit)}`).length*6.5+16:0)));
    const width=Math.max(available,points.length*pointSpace+80),right=width-20,slot=(right-left)/Math.max(1,points.length),x=i=>left+slot*(i+.5);
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
    if(!samples.length){g.append(node('text',{x:width/2,y:145,'text-anchor':'middle',class:'chart-empty',text:points.length?'Không có số đo đủ cơ sở để vẽ.':'Đã ẩn tất cả điểm.'}));return {ruleText};}
    const bound=(b,x1,x2,point)=>{
      g.append(node('line',{x1,x2,y1:y(b.limit),y2:y(b.limit),class:'pq-limit','data-scope':point?'point':'shared',...(point?{'data-point':point}:{})}));
      if(point)g.append(node('text',{x:(x1+x2)/2,y:bottom+62,'text-anchor':'middle',class:'pq-limit-label','data-point':point,text:`${b.direction==='max'?'≤':'≥'} ${fmt(b.limit)}`}));
    };
    if(shared)bound(bounds[0],left,right);else bounds.forEach((b,i)=>{if(b)bound(b,x(i)-slot*.4,x(i)+slot*.4,points[i]);});
    points.forEach((point,i)=>{
      const {values,ys,individual,box:offsets}=layouts[i],stats=group.stats.get(point),xx=x(i);
      const minOffset=offsets.length?Math.min(...offsets):0,spread=offsets.length?Math.max(...offsets)-minOffset:0;
      const boxX=stats.n>1?xx-(9+spread+8)/2:xx,capHalf=Math.min(12,boxHalf*.6);
      if(kind==='boxplot'&&stats.n){
        const summary=`${label(group.form,point)} · n=${stats.n} · Q1 ${fmt(stats.q1)} · trung vị ${fmt(stats.median)} · Q3 ${fmt(stats.q3)} · IQR ${fmt(stats.iqr)}`;
        const box=node('g',{class:'box-summary','data-point':point,'data-n':stats.n,tabindex:'0',role:'button','aria-label':summary});
        if(stats.n>1){
          box.append(node('line',{x1:boxX,x2:boxX,y1:y(stats.lowerWhisker),y2:y(stats.upperWhisker),class:'box-whisker'}));
          for(const v of [stats.lowerWhisker,stats.upperWhisker])box.append(node('line',{x1:boxX-capHalf,x2:boxX+capHalf,y1:y(v),y2:y(v),class:'box-whisker'}));
          box.append(node('rect',{x:boxX-boxHalf,y:y(stats.q3),width:boxHalf*2,height:Math.max(1,y(stats.q1)-y(stats.q3)),class:'box-body'}));
        }
        box.append(node('line',{x1:boxX-(stats.n===1?capHalf:boxHalf),x2:boxX+(stats.n===1?capHalf:boxHalf),y1:y(stats.median),y2:y(stats.median),class:'box-median'}));g.append(box);
        bind(box,label(group.form,point),`Trung vị ${fmt(stats.median)} ${group.unit}`,`n=${stats.n} · Q1 ${fmt(stats.q1)} · Q3 ${fmt(stats.q3)} · IQR ${fmt(stats.iqr)} · ${stats.outliers.length} ngoại lai IQR`,summary);
      }
      values.forEach((row,j)=>{
        const cx=kind==='individual'?xx+individual[j]:stats.n>1?boxX+boxHalf+9+offsets[j]-minOffset:xx,yy=ys[j];
        const outside=['above','below'].includes(row.action.state),outlier=group.outliers.has(row);
        const heading=`${label(group.form,point)} · lần ${row.trial??1}`,value=`${row.action.rawValue??row.plotValue} ${group.unit}`;
        const criterion=Number.isFinite(row.action.limit)&&row.action.direction?`PQ đã lưu ${row.action.direction==='max'?'≤':'≥'} ${fmt(row.action.limit)} ${group.unit}`:'Chưa có giới hạn PQ đủ cơ sở đối chiếu.';
        const detail=[row.action.reason,criterion,outlier?'Ngoại lai IQR (1,5 × IQR)':'Không thuộc ngoại lai IQR.'].filter(Boolean).join('\n');
        const title=`${heading}: ${value} · ${detail.replace(/\n/g,' · ')}`;
        const attrs={class:(kind==='individual'?'individual-value':'box-value')+(outside?' pq-outside':''),'data-point':point,tabindex:'0',role:'button','aria-label':title};
        const radius=kind==='individual'?5:3.5;
        const mark=outside?node('path',{...attrs,d:`M${cx},${yy-5}l5,5 -5,5 -5,-5 Z`}):node('circle',{...attrs,cx,cy:yy,r:radius});
        g.append(mark);bind(mark,heading,value,detail,title);
        if(kind==='individual'&&values.length===1)g.append(node('text',{x:cx,y:yy-14,'text-anchor':'middle',class:'pq-value-label','data-point':point,text:fmt(row.plotValue)}));
        if(outlier)g.append(node('circle',{cx,cy:yy,r:9,class:'stat-outlier','data-point':point,'pointer-events':'none'},[node('title',{text:title})]));
      });
    });
    return {ruleText};
  }
  window.CPC1PQCharts={prepare,render,swarm};
})();
