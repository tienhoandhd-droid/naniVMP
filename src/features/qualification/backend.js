import { createClient } from '@supabase/supabase-js';
import { renderPdf } from './pdf.js';

const canonical = value => JSON.stringify(value, function(key,item) {
  return item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])) : item;
});

export function makeBackend(settings, existingClient) {
  if (!settings?.url || !settings?.publishableKey) throw new Error('Chưa cấu hình dự án Supabase cho CPC1.');
  const parsed = new URL(settings.url);
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co')) throw new Error('Địa chỉ Supabase không hợp lệ.');
  if (settings.publishableKey.startsWith('sb_secret_')) throw new Error('Không được đưa khóa bí mật vào web.');
  // Legacy anon JWT is allowed; service-role JWT is rejected before bundling/deployment too.
  if (settings.publishableKey.startsWith('eyJ')) {
    try { if (JSON.parse(atob(settings.publishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role !== 'anon') throw new Error('wrong role'); }
    catch { throw new Error('Chỉ dùng publishable key hoặc anon key cho web.'); }
  } else if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(settings.publishableKey)) throw new Error('Chỉ dùng publishable key hoặc anon key cho web.');
  // Match the VMP client: same project/default storage key; never copy tokens.
  const client = existingClient || createClient(settings.url,settings.publishableKey,{auth:{persistSession:true,detectSessionInUrl:false,autoRefreshToken:true}});
  let current = null;
  let runBinding = null;
  const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
  let permissions = null;
  let localLogout = false;
  const pending = new Map();
  async function rpc(name,args={}) {
    const {data,error}=await client.rpc(name,args);
    if(error) {
      const err=new Error(error.message || 'Không kết nối được Supabase.');err.code=error.code;throw err;
    }
    return data;
  }
  const download = async (name,assetPath) => {
    if(!/^v[1-9][0-9]*$/.test(assetPath))throw new Error('Phiên bản bộ mẫu không hợp lệ.');
    const {data,error}=await client.storage.from('cpc1-templates').download(`${assetPath}/${name}`);
    if(error) throw new Error('Không tải được mẫu in riêng tư. Kiểm tra quyền hoặc bộ mẫu đã cài.');
    return new Uint8Array(await data.arrayBuffer());
  };
  return {
    mode:'cloud',
    get permissions(){return permissions;},
    onSessionChange:callback=>client.auth.onAuthStateChange((event,session)=>{if(!(localLogout && event==='SIGNED_OUT'))callback(event,session);}),
    bindRun(runId,recordId){if(!uuid(runId)||!uuid(recordId))throw Error('Liên kết đợt không hợp lệ.');if(current||runBinding)throw Error('Không đổi đợt trong phiên nhập đang mở.');runBinding={runId,recordId};},
    get runBinding(){return runBinding && {...runBinding};},
    listRuns:()=>rpc('cpc1_run_list'),
    createRun:(definition,requestId)=>rpc('cpc1_run_create',{p_definition:definition,p_request_id:requestId}),
    transitionRun:(id,version,status,reason,requestId)=>rpc('cpc1_run_transition',{p_run_id:id,p_expected_version:version,p_status:status,p_reason:reason,p_request_id:requestId}),
    listHistory:()=>rpc('cpc1_history_list'),
    async historySnapshot(recordId,version){
      if(!uuid(recordId)||!Number.isSafeInteger(version)||version<1)throw Error('Định danh phiên bản hồ sơ không hợp lệ.');
      const snapshot=await rpc('cpc1_load',{p_record_id:recordId,p_version:version});
      if(snapshot?.id!==recordId || snapshot?.version!==version)throw Error('Phiên bản hồ sơ trả về không khớp. Không dùng tiêu chí này.');
      return snapshot;
    },
    async downloadHistorySource(path){
      if(!/^[0-9a-f]{64}\.pdf$/.test(path))throw Error('Đường dẫn báo cáo nguồn không hợp lệ.');
      const {data,error}=await client.storage.from('cpc1-history').download(path);if(error)throw Error('Không tải được báo cáo nguồn trong phạm vi quyền.');
      const bytes=await data.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
      if(hash!==path.slice(0,64))throw Error('Báo cáo nguồn không khớp mã kiểm tra đã lưu.');return new Blob([bytes],{type:'application/pdf'});
    },
    getConfig:()=>runBinding?rpc('cpc1_run_config',{p_run_id:runBinding.runId,p_system:'steam'}):rpc('cpc1_config'),
    async getGasConfig(system){if(!['air','nitrogen'].includes(system))throw new Error('Hệ thống khí không hợp lệ.');return runBinding?rpc('cpc1_run_config',{p_run_id:runBinding.runId,p_system:system}):rpc('cpc1_gas_config',{p_system:system});},
    evaluate:data=>runBinding?rpc('cpc1_run_evaluate',{p_run_id:runBinding.runId,p_data:data}):rpc('cpc1_evaluate',{p_data:data}),
    async getSession(){const {data,error}=await client.auth.getSession();if(error)throw error;if(data.session){permissions=await rpc('cpc1_context');if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('cpc1:permissions'));}return data.session;},
    async signIn(){throw new Error('Đăng nhập tại VMP rồi mở lại Thẩm định thực tế (demo).');},
    async signOut(){localLogout=true;try{const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;current=null;pending.clear();}finally{localLogout=false;}},
    async list(system='steam'){return (await rpc('cpc1_list')).filter(r=>(r.system||'steam')===system);},
    async load(id){if(runBinding&&id!==runBinding.recordId)throw Error('Hồ sơ không thuộc đợt đang mở.');current=runBinding?await rpc('cpc1_run_load',{p_record_id:id,p_run_id:runBinding.runId}):await rpc('cpc1_load',{p_record_id:id});return current;},
    async save(data,options={}){
      const args={p_data:data,p_record_id:options.recordId||null,p_expected_version:options.expectedVersion??0,p_title:options.title||({air:'Đợt đánh giá khí nén',nitrogen:'Đợt đánh giá khí nitơ'}[data.system]||'Đợt đánh giá hơi tinh khiết')};
      if(runBinding){if(options.recordId&&options.recordId!==runBinding.recordId)throw Error('Hồ sơ không thuộc đợt đang mở.');args.p_run_id=runBinding.runId;args.p_record_id=runBinding.recordId;args.p_expected_version=options.expectedVersion??current?.version??0;delete args.p_title;}
      const key=JSON.stringify(args);
      args.p_request_id=pending.get(key)||options.requestId||crypto.randomUUID();pending.set(key,args.p_request_id);
      const saved=runBinding?await rpc('cpc1_run_save',args):await rpc('cpc1_save',args);pending.delete(key);current=saved;return saved;
    },
    async report(form,data){
      const gas=['air','nitrogen'].includes(data?.system);
      if(!(gas?/^bm0[1-7]$/:/^bm0[1-5]$/).test(form))throw new Error('Biểu mẫu không hợp lệ.');
      if(!current || canonical(data)!==canonical(current.data))throw new Error('Lưu Supabase trước khi in để báo cáo dùng đúng dữ liệu đã lưu.');
      const expected={id:current.id,version:current.version,data:canonical(data)};
      const snapshot=await rpc('cpc1_load',{p_record_id:expected.id,p_version:expected.version});
      if(snapshot?.id!==expected.id || snapshot?.version!==expected.version || canonical(snapshot?.data)!==expected.data)throw new Error('Phiên bản hồ sơ trả về không khớp bản đã lưu. Không tạo PDF.');
      const ctx=snapshot.evaluation.source_context;
      if(gas && (snapshot.data.system!==data.system || ctx?.config?.system!==data.system || !ctx.config.forms.some(f=>f.id===form)))throw new Error('Hệ thống hoặc biểu mẫu không khớp phiên bản đã lưu.');
      const fontFiles={arial:'Arial.ttf',arialBold:'Arial_Bold.ttf',arialItalic:'Arial_Italic.ttf',arialBoldItalic:'Arial_Bold_Italic.ttf',times:'Times_New_Roman.ttf',timesBold:'Times_New_Roman_Bold.ttf',timesItalic:'Times_New_Roman_Italic.ttf',timesBoldItalic:'Times_New_Roman_Bold_Italic.ttf'};
      if(!ctx?.template_sha256?.[form] || !ctx?.asset_sha256?.['print-layout.json'] || Object.values(fontFiles).some(name=>!ctx?.asset_sha256?.[name]))throw new Error('Phiên bản hồ sơ thiếu định danh mẫu in đúng định dạng gốc.');
      const [template,layoutBytes,...fontBytes]=await Promise.all([download(`${form}.pdf`,ctx.asset_path),download('print-layout.json',ctx.asset_path),...Object.values(fontFiles).map(name=>download(name,ctx.asset_path))]);
      const fonts=Object.fromEntries(Object.keys(fontFiles).map((key,i)=>[key,fontBytes[i]]));
      const evaluation={...snapshot.evaluation,report_context:{id:snapshot.id,version:snapshot.version,created_at:snapshot.created_at}};
      const renderer=gas?(await import('./gas-pdf.js')).renderGasPdf:renderPdf;
      const bytes=await renderer(form,snapshot.data,evaluation,{template,layoutBytes,fonts});
      return new Blob([bytes],{type:'application/pdf'});
    }
  };
}
