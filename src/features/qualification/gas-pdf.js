import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
const str=v=>v==null?'':String(v), date=(v,fmt)=>/^\d{4}-\d{2}-\d{2}$/.test(str(v))?`${str(v).slice(8,10)}${fmt==='dot'?'.':'/'}${str(v).slice(5,7)}${fmt==='dot'?'.':'/'}${str(v).slice(0,4)}`:str(v);
const formData=(d,f)=>d?.forms?.[f]||{}, row=(d,f,l)=>formData(d,f)?.[l]||{}, ef=(e,f)=>e?.forms?.[f]||{}, erow=(e,f,l)=>ef(e,f)?.rows?.[l]||{};
async function sha256(bytes){const h=await globalThis.crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function status(e,s){if(s.type==='rowStatus')return str(erow(e,s.form,s.location).status);if(s.type==='formStatus')return str(ef(e,s.form).status);if(s.type==='overall')return str(e?.overall);if(s.type==='controlStatus')return str(e?.controls?.status);return '';}
function value(d,e,s){const {type:t,key:k,form:f,location:l}=s;
  if(t==='row'||t==='rowDate'){let v=row(d,f,l)[k];if(f==='bm04'&&k==='microbial'&&['KPH','KFH'].includes(str(v).trim().toUpperCase()))v='KFH';return t==='rowDate'?date(v,s.dateFormat):str(v);}
  if(t==='computed'){const v=erow(e,f,l)?.values||{};return str(v.print_result??v[k]);}
  if(t==='equipment'||t==='equipmentDate'){const v=d?.equipment?.[f]?.[k];return t==='equipmentDate'?date(v,s.dateFormat):str(v);}
  if(t==='meta'||t==='metaDate'){const v=d?.meta?.[k];return t==='metaDate'?date(v,s.dateFormat):str(v);}
  if(t==='summary'){const v=ef(e,f)?.summary?.[k];return Array.isArray(v)?v.join(', '):str(v);}
  if(t==='control'||t==='controlDate'){const v=d?.controls?.[k];return t==='controlDate'?date(v,s.dateFormat):str(v);}
  if(t==='trend'||t==='trendDate'){const v=d?.trend?.[k];return t==='trendDate'?date(v,s.dateFormat):str(v);}
  return '';
}
function box(page,r){return{x:r[0],y:page.getHeight()-r[3],width:r[2]-r[0],height:r[3]-r[1]};}
function wrap(text,font,size,width){const out=[];for(const para of text.split('\n')){const words=para.split(/\s+/).filter(Boolean);if(!words.length){out.push('');continue;}let line='';for(const word of words){const c=line?`${line} ${word}`:word;if(font.widthOfTextAtSize(c,size)<=width)line=c;else if(!line||font.widthOfTextAtSize(word,size)>width)return null;else{out.push(line);line=word;}}out.push(line);}return out;}
function drawText(page,op,text,font){if(!text)return;const b=box(page,op.rect),size=op.size,pad=op.padding??2,inner={x:b.x+pad,y:b.y+pad,width:b.width-2*pad,height:b.height-2*pad};const lines=wrap(text,font,size,inner.width),lh=size*(op.lineSpacing??100)/100;if(!lines||lines.length*lh>inner.height)throw new Error(`Nội dung không vừa ô PDF ở cỡ chữ gốc ${size}: ${text.slice(0,80)}`);let y=op.baseline!=null?page.getHeight()-op.baseline:op.valign==='top'?inner.y+inner.height-size:inner.y+(inner.height+lines.length*lh)/2-lh;const c=op.color||[0,0,0];for(const line of lines){const w=font.widthOfTextAtSize(line,size),x=op.align==='left'?inner.x:inner.x+(inner.width-w)/2;page.drawText(line,{x,y,size,font,color:rgb(...c)});y-=lh;}}
export async function renderGasPdf(form,data,evaluation,assets){
  const system=str(data?.system||evaluation?.system).toLowerCase();form=str(form).toLowerCase();if(!['air','nitrogen'].includes(system))throw new Error('Thiếu hoặc sai hệ thống khí');
  if(!(assets?.template instanceof Uint8Array)||!(assets?.layoutBytes instanceof Uint8Array))throw new TypeError('Thiếu template hoặc layoutBytes');
  const ctx=evaluation?.source_context||{},hashes=ctx.asset_sha256||{};
  if(Object.keys(hashes).length){const expected=hashes['print-layout.json'];if(!expected||await sha256(assets.layoutBytes)!==expected)throw new Error('Hash print-layout không khớp snapshot nguồn');const names={arial:'Arial.ttf',arialBold:'Arial_Bold.ttf',arialItalic:'Arial_Italic.ttf',arialBoldItalic:'Arial_Bold_Italic.ttf',times:'Times_New_Roman.ttf',timesBold:'Times_New_Roman_Bold.ttf',timesItalic:'Times_New_Roman_Italic.ttf',timesBoldItalic:'Times_New_Roman_Bold_Italic.ttf'};for(const [key,filename] of Object.entries(names)){if(hashes[filename]){const bytes=assets.fonts?.[key];if(!(bytes instanceof Uint8Array)||await sha256(bytes)!==hashes[filename])throw new Error(`Hash font PDF không khớp: ${filename}`);}}}
  const tex=typeof ctx.template_sha256==='object'?ctx.template_sha256?.[form]:ctx.template_sha256;if(tex&&await sha256(assets.template)!==tex)throw new Error('Hash mẫu PDF không khớp snapshot nguồn');
  let layout;try{layout=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(assets.layoutBytes));}catch{throw new Error('print-layout không phải JSON hợp lệ');}if(layout.schema_version!==1||layout.system!==system)throw new Error('Không hỗ trợ phiên bản print-layout khí');const mapped=layout.forms?.[form]?.pages;if(!mapped)throw new Error(`Layout không có mẫu ${form}`);
  if(Object.keys(data||{}).every(k=>k==='system')&&!Object.keys(evaluation||{}).length)return assets.template.slice();
  const pdf=await PDFDocument.load(assets.template,{updateMetadata:false});if(pdf.getPageCount()!==mapped.length)throw new Error('Số trang template không khớp print-layout');pdf.registerFontkit(fontkit);
  const needed=new Set();for(const p of mapped)for(const op of p.writes)if(op.kind==='text'&&value(data,evaluation,op.source))needed.add(op.fontKey);const fonts={};for(const key of needed){const bytes=assets.fonts?.[key];if(!(bytes instanceof Uint8Array))throw new TypeError(`Thiếu font exact: ${key}`);fonts[key]=await pdf.embedFont(bytes,{subset:true});}
  const pages=pdf.getPages();mapped.forEach((mp,i)=>{for(const op of mp.writes){if(op.kind==='checkbox'){if(status(evaluation,op.source)!==op.checkedStatus)continue;const b=box(pages[i],op.rect);pages[i].drawLine({start:{x:b.x+.2*b.width,y:b.y+.58*b.height},end:{x:b.x+.45*b.width,y:b.y+.28*b.height},thickness:.8,color:rgb(0,0,0)});pages[i].drawLine({start:{x:b.x+.45*b.width,y:b.y+.28*b.height},end:{x:b.x+.82*b.width,y:b.y+.82*b.height},thickness:.8,color:rgb(0,0,0)});}else drawText(pages[i],op,value(data,evaluation,op.source),fonts[op.fontKey]);}});return pdf.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false});
}
