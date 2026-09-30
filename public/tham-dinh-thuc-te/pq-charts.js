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
      group.points=[...new Set(group.rows.map(r=>r.point_id))].sort();group.stats=new Map();group.outliers=new Set();
      for(const point of group.points){const samples=group.rows.filter(r=>r.point_id===point&&r.plotValue!==null),stats=window.CPC1BoxStats.summarize(samples.map(r=>r.plotValue));group.stats.set(point,stats);stats.outliers.forEach(o=>group.outliers.add(samples[o.index]));}
      return group;
    });
  }
  let observers=[];
  function render(host,groups,{hiddenPoints,label,inspect,scope,verdictPending}){
    observers.forEach(o=>o.disconnect());observers=[];host.replaceChildren();
    if(!groups.length){host.append(node('p',{class:'empty',text:'Chưa có số liệu cho phạm vi đang chọn.'}));return;}
    groups.forEach((group,index)=>{
      const card=node('article',{class:'pq-metric-card','aria-labelledby':'pq-heading-'+index});
      const out=group.rows.filter(r=>['above','below'].includes(r.action.state)).length,unknown=group.rows.filter(r=>r.action.state==='unknown').length,valid=group.rows.filter(r=>r.plotValue!==null).length;
      card.append(node('header',{class:'pq-card-header'},[node('div',{},[node('p',{class:'eyebrow',text:group.form.toUpperCase()+' · '+scope}),node('h2',{id:'pq-heading-'+index,text:group.label}),node('p',{class:'pq-card-meta',text:`${group.unit||'Không có đơn vị'} · ${group.points.length} điểm · ${valid}/${group.rows.length} số đo được vẽ`})]),node('div',{class:'pq-card-verdict'},[node('span',{class:out?'pq-warning':'',text:verdictPending?'Đang chờ tiêu chí PQ':group.rows.every(r=>r.action.state==='unknown')?'Chưa đối chiếu PQ':`${out} vượt PQ${unknown?' · '+unknown+' chưa đối chiếu':''}`}),node('span',{text:`${group.outliers.size} ngoại lai IQR`})])]));
      const visible=group.points.filter(p=>!hiddenPoints.has(p)),samples=group.rows.filter(r=>visible.includes(r.point_id)&&r.plotValue!==null);
      const numbers=samples.map(r=>r.plotValue);samples.forEach(r=>{if(Number.isFinite(r.action.limit))numbers.push(r.action.limit);});
      let low=0,high=1;if(numbers.length){let min=numbers[0],max=min;for(const value of numbers){min=Math.min(min,value);max=Math.max(max,value);}const span=max-min,pad=(Number.isFinite(span)&&span>0?span:Math.max(Math.abs(max)*.1,1))*.12;low=min-pad;high=max+pad;if(!Number.isFinite(low)||!Number.isFinite(high)||high<=low){low=min;high=max>min?max:min+1;}}
      const figures=[],plots=node('div',{class:'pq-plots'});card.append(plots);
      for(const kind of ['individual','boxplot']){
        const name=kind==='individual'?'Individual chart':'Boxplot',titleId=`pq-${index}-${kind}-title`,descId=`pq-${index}-${kind}-desc`;
        const chartNumber=node('span',{class:'pq-chart-number',text:kind==='individual'?'01':'02','aria-hidden':'true'}),ruleCaption=node('span',{class:'pq-rule-caption',hidden:'hidden'});
        const figure=node('figure',{class:'pq-figure'},[node('div',{class:'pq-plot-heading'},[node('div',{},[node('p',{class:'pq-chart-type',text:name}),node('h3',{text:kind==='individual'?'Giá trị theo điểm':'Phân bố theo điểm'})]),chartNumber,ruleCaption])]);
        const chart=node('svg',{'data-chart':kind,'data-y-min':low,'data-y-max':high,role:'img','aria-labelledby':titleId+' '+descId},[node('title',{id:titleId,text:group.label+' · '+name}),node('desc',{id:descId,text:`${scope}. Trục X là điểm lấy mẫu; trục Y là giá trị ${group.unit}. Hình thoi đỏ vượt giới hạn PQ đã lưu. Vòng cam là ngoại lai thống kê 1,5 IQR. Không gộp các đợt. Với một số đo chỉ vẽ điểm và trung vị.`})]);
        const scroll=node('div',{class:'pq-chart-scroll',tabindex:'0',role:'region','aria-label':name+' · '+group.label+' · có thể cuộn ngang'},[chart]);const hint=node('figcaption',{class:'pq-scroll-hint',hidden:'hidden',text:'Cuộn ngang để xem đủ các điểm lấy mẫu'});figure.append(scroll,hint);plots.append(figure);figures.push({chart,scroll,kind,chartNumber,ruleCaption,hint});
      }
      const excluded=group.rows.length-valid,small=group.points.filter(p=>group.stats.get(p).smallSample);
      card.append(node('p',{class:'pq-sample-note',text:[small.length?`${small.join(', ')}: ít mẫu; n=1 chỉ có số đo và trung vị.`:'Boxplot: hộp Q1–Q3, vạch giữa là trung vị, râu theo 1,5 × IQR.',excluded?`${excluded} dòng thiếu/chưa chắc chắn chỉ giữ trong bảng.`:'', 'Ngoại lai IQR và vượt PQ được đánh dấu riêng.'].filter(Boolean).join(' ')}));
      const tbody=node('tbody',{},group.points.map(point=>{const st=group.stats.get(point);return node('tr',{'data-point':point},[label(group.form,point),st.n,fmt(st.q1),fmt(st.median),fmt(st.q3),fmt(st.iqr),fmt(st.lowerWhisker),fmt(st.upperWhisker),st.outliers.length].map(v=>node('td',{text:String(v)})));}));
      card.append(node('details',{class:'trend-details'},[node('summary',{text:'Thống kê Boxplot theo điểm'}),node('div',{class:'table-scroll',tabindex:'0',role:'region','aria-label':'Bảng thống kê '+group.label},[node('table',{class:'pq-stats-table'},[node('caption',{text:group.label+' · '+group.unit+' · phân vị tuyến tính (type 7)'}),node('thead',{},[node('tr',{},['Điểm','n','Q1','Trung vị','Q3','IQR','Râu dưới','Râu trên','Ngoại lai IQR'].map(t=>node('th',{scope:'col',text:t})))]),tbody])]) ]));
      host.append(card);
      for(const {chart,scroll,kind,chartNumber,ruleCaption,hint} of figures){
        let lastWidth=0;
        const draw=()=>{const width=Math.ceil(scroll.clientWidth);if(width===lastWidth)return;lastWidth=width;
          const view=drawPlot(chart,group,visible,samples,kind,width,low,high,label,inspect)||{};
          ruleCaption.textContent=view.sharedText||'';ruleCaption.hidden=!view.headerRule;chartNumber.hidden=!!view.headerRule;
          hint.hidden=Number(chart.getAttribute('width'))<=scroll.clientWidth+1;
        };
        draw();const observer=new ResizeObserver(draw);observer.observe(scroll);observers.push(observer);
      }
    });
  }
  function drawPlot(svg,group,points,samples,kind,width,low,high,label,inspect){
    svg.querySelectorAll('g').forEach(n=>n.remove());const g=node('g');svg.append(g);
    const bounds=points.map(point=>{const rows=samples.filter(r=>r.point_id===point),known=rows.filter(r=>Number.isFinite(r.action.limit)&&r.action.direction);return rows.length&&known.length===rows.length&&known.every(r=>r.action.limit===known[0].action.limit&&r.action.direction===known[0].action.direction)?known[0].action:null;});
    const shared=bounds.length&&bounds.every(b=>b&&b.limit===bounds[0]?.limit&&b.direction===bounds[0]?.direction);
    const sharedText=shared?`PQ ${bounds[0].direction==='max'?'≤':'≥'} ${fmt(bounds[0].limit)}`:'';
    const pointSpace=Math.max(44,...points.map(point=>String(point).length*7+14));
    const ruleSpace=shared?Math.max(84,sharedText.length*6.7+34):20;
    const inlineRule=shared&&width>=points.length*pointSpace+68+ruleSpace;
    const rightSpace=inlineRule?ruleSpace:20;
    width=Math.max(width,points.length*pointSpace+68+rightSpace);
    const height=350,left=68,right=width-rightSpace,top=38,bottom=272,slot=(right-left)/Math.max(1,points.length),x=i=>left+slot*(i+.5);
    // Divide first so extreme finite input does not overflow a subtraction span.
    const scale=Math.max(Math.abs(low),Math.abs(high),1),span=high/scale-low/scale,y=v=>bottom-(v/scale-low/scale)/span*(bottom-top);
    svg.setAttribute('width',width);svg.setAttribute('height',height);svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    const range=high-low,rawStep=range/5,power=10**Math.floor(Math.log10(rawStep)),ratio=rawStep/power,step=(ratio<=1?1:ratio<=2?2:ratio<=5?5:10)*power;
    const ticks=[];if(Number.isFinite(step)&&step>0){for(let i=0,v=Math.ceil(low/step)*step;i<12&&v<=high;i++,v+=step)ticks.push(Math.abs(v)<step*1e-8?0:v);}else ticks.push(low,high);
    ticks.forEach(v=>g.append(node('line',{x1:left,x2:right,y1:y(v),y2:y(v),class:'pq-grid'}),node('text',{x:left-12,y:y(v)+4,'text-anchor':'end',class:'pq-axis',text:fmt(v)})));
    g.append(node('text',{x:left,y:18,class:'pq-axis pq-unit-label',text:group.unit}),node('line',{x1:left,x2:right,y1:bottom,y2:bottom,class:'pq-baseline'}));
    points.forEach((point,i)=>{g.append(node('line',{x1:x(i),x2:x(i),y1:top,y2:bottom,class:'pq-point-guide','data-point':point}),node('text',{x:x(i),y:bottom+25,'text-anchor':'middle',class:'pq-axis pq-point-label',text:point},[node('title',{text:label(group.form,point)})]));if(kind==='boxplot')g.append(node('text',{x:x(i),y:bottom+44,'text-anchor':'middle',class:'pq-axis pq-n-label',text:'n='+group.stats.get(point).n}));});
    g.append(node('text',{x:(left+right)/2,y:342,'text-anchor':'middle',class:'pq-axis',text:'Điểm lấy mẫu'}));
    if(!samples.length){g.append(node('text',{x:width/2,y:145,'text-anchor':'middle',class:'chart-empty',text:points.length?'Không có số đo đủ cơ sở để vẽ.':'Đã ẩn tất cả điểm.'}));return;}
    const bound=(b,x1,x2,point)=>{
      const text=`${point?'':'PQ '}${b.direction==='max'?'≤':'≥'} ${fmt(b.limit)}`,tagWidth=text.length*6.7+16;
      g.append(node('line',{x1,x2,y1:y(b.limit),y2:y(b.limit),class:'pq-limit','data-scope':point?'point':'shared',...(point?{'data-point':point}:{})}));
      if(!point&&inlineRule)g.append(node('rect',{x:x2+8,y:y(b.limit)-12,width:tagWidth,height:24,rx:5,class:'pq-limit-tag'}));
      if(point||inlineRule)g.append(node('text',{x:point?x2-8:x2+16,y:y(b.limit)+(point?-11:4),'text-anchor':point?'end':'start',class:'pq-limit-label',...(point?{'data-point':point,'data-rule-y':y(b.limit)}:{}),text}));
    };
    if(shared)bound(bounds[0],left,right);else bounds.forEach((b,i)=>{if(b)bound(b,x(i)-slot*.4,x(i)+slot*.4,points[i]);});
    points.forEach((point,i)=>{
      const values=samples.filter(r=>r.point_id===point),stats=group.stats.get(point),xx=x(i),boxHalf=Math.min(26,slot*.4),capHalf=Math.min(16,slot*.2);
      if(kind==='boxplot'&&stats.n){const box=node('g',{class:'box-summary','data-point':point,'data-n':stats.n});
        if(stats.n>1){box.append(node('line',{x1:xx,x2:xx,y1:y(stats.lowerWhisker),y2:y(stats.upperWhisker),class:'box-whisker'}));for(const v of [stats.lowerWhisker,stats.upperWhisker])box.append(node('line',{x1:xx-capHalf,x2:xx+capHalf,y1:y(v),y2:y(v),class:'box-whisker'}));box.append(node('rect',{x:xx-boxHalf,y:y(stats.q3),width:boxHalf*2,height:Math.max(1,y(stats.q1)-y(stats.q3)),class:'box-body'}));}
        box.append(node('line',{x1:xx-(stats.n===1?capHalf:boxHalf),x2:xx+(stats.n===1?capHalf:boxHalf),y1:y(stats.median),y2:y(stats.median),class:'box-median'}));g.append(box);
      }
      values.forEach((row,j)=>{
        const offset=values.length<2?0:[0,-1,1,-2,2,-3,3][j%7]*Math.min(4,slot*.06),yy=y(row.plotValue),cx=xx+offset,outside=['above','below'].includes(row.action.state),outlier=group.outliers.has(row);
        const title=`${label(group.form,point)} · lần ${row.trial??1}: ${row.action.rawValue??row.plotValue} ${group.unit} · ${row.action.reason}${outlier?' · Ngoại lai IQR (1,5 × IQR)':''}`;
        const attrs={class:(kind==='individual'?'individual-value':'box-value')+(outside?' pq-outside':''),'data-point':point,tabindex:'0','aria-label':title};
        const mark=outside?node('path',{...attrs,d:`M${cx},${yy-6}l6,6 -6,6 -6,-6 Z`}):node('circle',{...attrs,cx,cy:yy,r:kind==='individual'?5.5:4});mark.append(node('title',{text:title}));mark.addEventListener('focus',()=>inspect(title));mark.addEventListener('pointerenter',()=>inspect(title));g.append(mark);
        if(kind==='individual'&&values.length===1)g.append(node('text',{x:cx,y:yy-14,'text-anchor':'middle',class:'pq-value-label','data-point':point,text:fmt(row.plotValue)}));
        if(outlier)g.append(node('circle',{cx,cy:yy,r:11,class:'stat-outlier','data-point':point,'pointer-events':'none'},[node('title',{text:title})]));
      });
    });
    // Keep a displayed singleton value clear of its point-specific PQ annotation.
    const valueLabels=[...g.querySelectorAll('.pq-value-label')];
    g.querySelectorAll('.pq-limit-label[data-point]').forEach(limitLabel=>{
      const valueLabel=valueLabels.find(n=>n.dataset.point===limitLabel.dataset.point);if(!valueLabel)return;
      const a=valueLabel.getBBox(),b=limitLabel.getBBox(),pad=3;
      if(a.x<b.x+b.width+pad&&a.x+a.width+pad>b.x&&a.y<b.y+b.height+pad&&a.y+a.height+pad>b.y)limitLabel.setAttribute('y',Number(limitLabel.dataset.ruleY)+24);
    });
    return {sharedText,headerRule:shared&&!inlineRule};
  }
  window.CPC1PQCharts={prepare,render};
})();
