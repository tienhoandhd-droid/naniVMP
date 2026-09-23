import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const FORMS=new Set(['bm01','bm02','bm03','bm04','bm05']);
const str=v=>v==null?'':String(v);
const date=v=>/^\d{4}-\d{2}-\d{2}/.test(str(v))?`${str(v).slice(8,10)}/${str(v).slice(5,7)}/${str(v).slice(0,4)}`:str(v);
const fe=(e,f)=>e?.forms?.[f]||e?.[f]||{};
const row=(d,f,l,i)=>Array.isArray(d?.[f]?.[l])?d[f][l][i]||{}:{};
const erow=(e,f,l,i)=>Array.isArray(fe(e,f)?.rows?.[l])?fe(e,f).rows[l][i]||{}:{};
async function sha256(bytes){const h=await globalThis.crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('');}

function status(e,s){
  if(s.type==='rowStatus')return str(erow(e,s.form,s.location,s.index).status);
  if(s.type==='parameterStatus')return str(fe(e,'bm02')?.rows?.[s.location]?.parameters?.[s.key]);
  if(s.type==='formStatus')return str(fe(e,s.form).status);
  if(s.type==='overall')return str(e?.overall);
  return '';
}
function value(d,e,s){
  const k=s.key;
  if(s.type==='row')return str(row(d,s.form,s.location,s.index)[k]);
  if(s.type==='rowDate')return date(row(d,s.form,s.location,s.index)[k]);
  if(s.type==='computed'){
    const values=erow(e,s.form,s.location,s.index)?.values||{};let v=k==='result'?(values.print_result??values[k]):values[k];
    if(v==null&&s.form==='bm04'&&['t3','ts'].includes(k))v=row(d,'bm04',s.location,s.index)[k];
    return str(v);
  }
  if(['equipment','equipmentDate'].includes(s.type)){const v=d?.equipment?.[k];return s.type.endsWith('Date')?date(v):str(v);}
  if(['meta','metaDate'].includes(s.type)){const v=d?.meta?.[k];return s.type.endsWith('Date')?date(v):str(v);}
  if(['bm02','bm02Date','bm02Value'].includes(s.type)){
    const raw=d?.bm02?.[s.location]||{};
    if(k==='sample_endo'&&fe(e,'bm02')?.rows?.[s.location]?.parameters?.endotoxin==='not_applicable')return '';
    if(s.type==='bm02Date')return date(raw[k]);
    if(k==='appearance')return ({pass:'Trong, không màu, không mùi',fail:'Không đáp ứng'})[str(raw[k])]??str(raw[k]);
    return str(raw[k]);
  }
  if(s.type==='summary'){
    const ev=fe(e,s.form),sm=ev.summary||{};
    if(k==='failed_codes')return Object.entries(ev.locations||{}).filter(([,v])=>v==='fail'||v==='invalid').map(([x])=>x).join(', ');
    return str(sm[k]);
  }
  return '';
}
function box(page,r){return{x:r[0],y:page.getHeight()-r[3],width:r[2]-r[0],height:r[3]-r[1]};}
function wrap(text,font,size,width){
  const out=[];
  for(const para of text.split('\n')){const words=para.split(/\s+/).filter(Boolean);if(!words.length){out.push('');continue;}let line='';
    for(const word of words){const c=line?`${line} ${word}`:word;if(font.widthOfTextAtSize(c,size)<=width)line=c;else if(!line||font.widthOfTextAtSize(word,size)>width)return null;else{out.push(line);line=word;}}out.push(line);}
  return out;
}
function drawText(page,op,text,font){
  if(!text)return;const b=box(page,op.rect),size=op.size,pad=op.padding??2,inner={x:b.x+pad,y:b.y+pad,width:b.width-2*pad,height:b.height-2*pad};
  const lines=wrap(text,font,size,inner.width),lh=size*(op.lineSpacing??115)/100;if(!lines||lines.length*lh>inner.height)throw new Error(`Nội dung không vừa ô PDF ở cỡ chữ gốc ${size}: ${text.slice(0,80)}`);
  let y=op.baseline!=null?page.getHeight()-op.baseline:op.valign==='top'?inner.y+inner.height-size:inner.y+(inner.height+lines.length*lh)/2-lh;const c=op.color||[0,0,0];
  for(const line of lines){const w=font.widthOfTextAtSize(line,size),x=op.align==='left'?inner.x:inner.x+(inner.width-w)/2;page.drawText(line,{x,y,size,font,color:rgb(c[0],c[1],c[2])});y-=lh;}
}

export async function renderPdf(form,data,evaluation,assets){
  form=str(form).toLowerCase();if(!FORMS.has(form))throw new Error(`Mẫu báo cáo không hỗ trợ: ${form}`);
  if(!(assets?.template instanceof Uint8Array)||!(assets?.layoutBytes instanceof Uint8Array))throw new TypeError('Thiếu template hoặc layoutBytes');
  const ctx=evaluation?.source_context||{}, hashes=ctx.asset_sha256||{};
  if(Object.keys(hashes).length){
    const layoutExpected=hashes['print-layout.json'];if(!layoutExpected||await sha256(assets.layoutBytes)!==layoutExpected)throw new Error('Hash print-layout không khớp snapshot nguồn');
    for(const [key,bytes] of Object.entries(assets.fonts||{})){const filename={arial:'Arial.ttf',arialBold:'Arial_Bold.ttf',arialItalic:'Arial_Italic.ttf',arialBoldItalic:'Arial_Bold_Italic.ttf',times:'Times_New_Roman.ttf',timesBold:'Times_New_Roman_Bold.ttf',timesItalic:'Times_New_Roman_Italic.ttf',timesBoldItalic:'Times_New_Roman_Bold_Italic.ttf'}[key];if(!filename||!hashes[filename]||await sha256(bytes)!==hashes[filename])throw new Error(`Hash font PDF không khớp: ${filename||key}`);}
  }
  const expected=typeof ctx.template_sha256==='object'?ctx.template_sha256?.[form]:ctx.template_sha256;if(expected&&await sha256(assets.template)!==expected)throw new Error('Hash mẫu PDF không khớp snapshot nguồn');
  let layout;try{layout=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(assets.layoutBytes));}catch{throw new Error('print-layout không phải JSON hợp lệ');}
  if(layout.schema_version!==2)throw new Error('Không hỗ trợ phiên bản print-layout');const mapped=layout.forms?.[form]?.pages;if(!mapped)throw new Error(`Layout không có mẫu ${form}`);
  if(!data||!evaluation||(!Object.keys(data).length&&!Object.keys(evaluation).length))return assets.template.slice();
  const pdf=await PDFDocument.load(assets.template,{updateMetadata:false});if(pdf.getPageCount()!==mapped.length)throw new Error('Số trang template không khớp print-layout');pdf.registerFontkit(fontkit);
  const needed=new Set();for(const p of mapped)for(const op of p.writes)if(op.kind==='text'&&value(data,evaluation,op.source))needed.add(op.fontKey);
  const fonts={};for(const key of needed){const bytes=assets.fonts?.[key];if(!(bytes instanceof Uint8Array))throw new TypeError(`Thiếu font exact: ${key}`);fonts[key]=await pdf.embedFont(bytes,{subset:true});}
  const pages=pdf.getPages();mapped.forEach((mp,i)=>{for(const op of mp.writes){if(op.kind==='checkbox'){if(status(evaluation,op.source)!==op.checkedStatus)continue;const b=box(pages[i],op.rect);pages[i].drawLine({start:{x:b.x+.20*b.width,y:b.y+.58*b.height},end:{x:b.x+.45*b.width,y:b.y+.28*b.height},thickness:.8,color:rgb(0,0,0)});pages[i].drawLine({start:{x:b.x+.45*b.width,y:b.y+.28*b.height},end:{x:b.x+.82*b.width,y:b.y+.82*b.height},thickness:.8,color:rgb(0,0,0)});}else drawText(pages[i],op,value(data,evaluation,op.source),fonts[op.fontKey]);}});
  return pdf.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false});
}
