import { workflow, node, trigger, ifElse, languageModel, expr } from '@n8n/workflow-sdk';

const nhanYeuCau = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Nhận yêu cầu rerank',
    position: [0, 0],
    parameters: {
      httpMethod: 'POST',
      path: 'vmp-rerank-tai-lieu',
      authentication: 'headerAuth',
      responseMode: 'responseNode',
      options: {}
    },
    credentials: { httpHeaderAuth: { id: 'YIF7OjtqjYjaQgwk', name: 'vmp-chat-cong-khai' } }
  },
  output: [{ body: { tu_khoa: 'vì sao LAF cân 9 điểm', vector: '' } }]
});

const chuanHoa = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Chuẩn hoá đầu vào',
    position: [200, 0],
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'tk', name: 'tu_khoa', value: expr("{{ $json.body?.tu_khoa ?? $json.tu_khoa ?? '' }}"), type: 'string' },
          { id: 'vt', name: 'vector', value: expr("{{ $json.body?.vector ?? $json.vector ?? '' }}"), type: 'string' },
          { id: 'ph', name: 'phien', value: expr("{{ $json.body?.phien ?? $json.phien ?? '' }}"), type: 'string' }
        ]
      },
      options: {}
    }
  },
  output: [{ tu_khoa: 'vì sao LAF cân 9 điểm', vector: '' }]
});

const traManh = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.6,
  config: {
    name: 'Tra 12 mảnh',
    position: [400, 0],
    parameters: {
      operation: 'executeQuery',
      query: 'select public.rpc_tim_tri_thuc($1, nullif($2, \'\'), 20) as kq',
      options: { queryReplacement: expr('{{ [$json.tu_khoa, $json.vector || \'\'] }}') }
    },
    credentials: { postgres: { id: 'gUbJq0xGJ2sJMjXx', name: 'VMP Supabase Postgres' } }
  },
  output: [{ kq: { ok: true, so_manh: 12, do_tin_cao_nhat: 0.9, diem_cao_nhat: 0.03, manh: [{ id: 1, diem: 0.03, do_tin: 0.9, nguon: 'docs/a.md', muc: 'Mục 1', noi_dung: '...' }] } }]
});

const canCham = ifElse({
  version: 2.2,
  config: {
    name: 'Cần chấm lại không?',
    position: [600, 0],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.kq.so_manh }}'), operator: { type: 'number', operation: 'gt' }, rightValue: 4 }],
        combinator: 'and'
      }
    }
  }
});

const geminiLite = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
  version: 1.1,
  config: {
    name: 'Gemini Lite (chấm)',
    position: [750, 200],
    parameters: { modelName: 'models/gemini-flash-lite-latest', options: { temperature: 0, maxOutputTokens: 1024 } },
    credentials: { googlePalmApi: { id: 'K79Qvznx7qa4UfFp', name: 'Tài khoảng Gemini' } }
  }
});

const geminiCham = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.7,
  config: {
    name: 'Gemini chấm mảnh',
    position: [800, 0],
    onError: 'continueRegularOutput',
    parameters: {
      promptType: 'define',
      text: expr(
        'Bạn là bộ CHẤM ĐỘ LIÊN QUAN của hệ tìm tài liệu. Chấm mỗi mảnh 0-10 theo mức nó TRẢ LỜI ĐÚNG câu hỏi (đúng chủ đề mới được điểm cao, trùng vài từ thì không). CHỈ xuất ra JSON đúng dạng {"diem":[{"id":1,"d":9}]} cho ĐỦ mọi id, không viết gì khác.\n\n' +
        'CÂU HỎI: {{ $("Chuẩn hoá đầu vào").item.json.tu_khoa }}\n\n' +
        'CÁC MẢNH: {{ JSON.stringify($("Tra 12 mảnh").item.json.kq.manh.map(m => ({ id: m.id, muc: m.muc, nguon: m.nguon, trich: (m.noi_dung || "").slice(0, 800) }))) }}'
      ),
      batching: {}
    },
    subnodes: { model: geminiLite }
  },
  output: [{ text: '{"diem":[{"id":1,"d":9}]}' }]
});

const docDiem = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Đọc điểm Gemini',
    position: [1000, 0],
    parameters: {
      jsCode:
        "var t = ($input.first().json.text || '').replace(/```json|```/g, '');\n" +
        "var diem = null;\n" +
        "try { var p = JSON.parse(t); if (Array.isArray(p.diem) && p.diem.length) diem = p.diem; } catch (e) {}\n" +
        "return [{ json: { ok: !!diem, diem: diem } }];"
    }
  },
  output: [{ ok: true, diem: [{ id: 1, d: 9 }] }]
});

const chamDuoc = ifElse({
  version: 2.2,
  config: {
    name: 'Gemini chấm được?',
    position: [1200, 0],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.ok }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      }
    }
  }
});

const openaiModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  version: 1.3,
  config: {
    name: 'GPT-4o mini (chấm dự phòng)',
    position: [1350, 350],
    parameters: { model: { __rl: true, mode: 'list', value: 'gpt-4o-mini' }, options: { temperature: 0, maxTokens: 1024 } },
    credentials: { openAiApi: { id: 'r5CCCyYKeJDjnJ0A', name: 'OpenAl' } }
  }
});

const openaiCham = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.7,
  config: {
    name: 'OpenAI chấm (dự phòng)',
    position: [1400, 150],
    onError: 'continueRegularOutput',
    parameters: {
      promptType: 'define',
      text: expr(
        'Bạn là bộ CHẤM ĐỘ LIÊN QUAN. Chấm mỗi mảnh 0-10 theo mức nó trả lời đúng câu hỏi. CHỈ xuất ra JSON {"diem":[{"id":1,"d":9}]} cho đủ mọi id.\n\n' +
        'CÂU HỎI: {{ $("Chuẩn hoá đầu vào").item.json.tu_khoa }}\n\n' +
        'CÁC MẢNH: {{ JSON.stringify($("Tra 12 mảnh").item.json.kq.manh.map(m => ({ id: m.id, muc: m.muc, nguon: m.nguon, trich: (m.noi_dung || "").slice(0, 800) }))) }}'
      ),
      batching: {}
    },
    subnodes: { model: openaiModel }
  },
  output: [{ text: '{"diem":[{"id":1,"d":9}]}' }]
});

const xepLai = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Xếp lại theo điểm',
    position: [1600, 0],
    parameters: {
      jsCode:
        "var goc = $('Tra 12 mảnh').first().json.kq;\n" +
        "var kq = JSON.parse(JSON.stringify(goc));\n" +
        "var vao = $input.first().json;\n" +
        "var diem = Array.isArray(vao.diem) ? vao.diem : null;\n" +
        "var nguon_cham = diem ? 'gemini' : null;\n" +
        "if (!diem) {\n" +
        "  var t = (vao.text || '').replace(/```json|```/g, '');\n" +
        "  try { var p = JSON.parse(t); if (Array.isArray(p.diem) && p.diem.length) { diem = p.diem; nguon_cham = 'openai'; } } catch (e) {}\n" +
        "}\n" +
        "if (diem) {\n" +
        "  var bang = {};\n" +
        "  diem.forEach(function (x) { bang[x.id] = Number(x.d) || 0; });\n" +
        "  kq.manh.sort(function (a, b) { return (bang[b.id] || 0) - (bang[a.id] || 0) || (b.do_tin || 0) - (a.do_tin || 0); });\n" +
        "  var loc = kq.manh.filter(function (m) { return (bang[m.id] || 0) >= 3; });\n" +
        "  kq.manh = (loc.length ? loc : kq.manh).slice(0, 4);\n" +
        "  kq.manh.forEach(function (m) { m.diem_lien_quan = bang[m.id] != null ? bang[m.id] : null; });\n" +
        "  kq.cham_lai = nguon_cham;\n" +
        "} else {\n" +
        "  kq.manh = kq.manh.slice(0, 4);\n" +
        "  kq.cham_lai = 'khong_cham_duoc';\n" +
        "}\n" +
        "kq.so_manh = kq.manh.length;\n" +
        "kq.do_tin_cao_nhat = kq.manh.reduce(function (m, x) { return Math.max(m, x.do_tin || 0); }, 0);\n" +
        "kq.diem_cao_nhat = kq.manh.reduce(function (m, x) { return Math.max(m, x.diem || 0); }, 0);\n" +
        "return [{ json: { ket_qua: kq } }];"
    }
  },
  output: [{ ket_qua: { ok: true, so_manh: 4, cham_lai: 'gemini', manh: [] } }]
});

const giuNguyen = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Giữ nguyên (ít mảnh)',
    position: [800, -200],
    parameters: {
      jsCode:
        "var kq = $input.first().json.kq;\n" +
        "kq.cham_lai = 'khong_can';\n" +
        "return [{ json: { ket_qua: kq } }];"
    }
  },
  output: [{ ket_qua: { ok: true, so_manh: 3, cham_lai: 'khong_can', manh: [] } }]
});

const luuTrichDan = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.6,
  config: {
    name: 'Lưu trích dẫn',
    position: [1720, -100],
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
    parameters: {
      operation: 'executeQuery',
      query:
        "with ins as (\n" +
        "  insert into public.vmp_ai_trich_dan_tam (phien, trich)\n" +
        "  select $1, coalesce(jsonb_agg(distinct jsonb_build_object('nguon', m->>'nguon', 'muc', m->>'muc')), '[]'::jsonb)\n" +
        "  from jsonb_array_elements($2::jsonb) m\n" +
        "  where coalesce((m->>'diem_lien_quan')::numeric, 10 * coalesce((m->>'do_tin')::numeric, 0)) >= 6\n" +
        "  returning 1\n" +
        ")\n" +
        "select $3::jsonb as ket_qua from ins",
      options: { queryReplacement: expr("{{ [$('Chuẩn hoá đầu vào').first().json.phien || '', JSON.stringify($json.ket_qua.manh || []), JSON.stringify($json.ket_qua)] }}") }
    },
    credentials: { postgres: { id: 'gUbJq0xGJ2sJMjXx', name: 'VMP Supabase Postgres' } }
  },
  output: [{ ket_qua: { ok: true, so_manh: 4, manh: [] } }]
});

const traKetQua = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Trả kết quả',
    position: [1850, 0],
    parameters: { respondWith: 'json', responseBody: expr("{{ (() => { try { if ($json.ket_qua) return JSON.stringify($json.ket_qua) } catch (e) {} try { return JSON.stringify($('Xếp lại theo điểm').first().json.ket_qua) } catch (e) {} return JSON.stringify($('Giữ nguyên (ít mảnh)').first().json.ket_qua) })() }}"), options: {} }
  },
  output: [{}]
});

export default workflow('vali-rerank-tai-lieu', 'Vali — Rerank tài liệu (RAG)')
  .add(nhanYeuCau)
  .to(chuanHoa)
  .to(traManh)
  .to(canCham
    .onTrue(geminiCham.to(docDiem.to(chamDuoc
      .onTrue(xepLai.to(luuTrichDan.to(traKetQua)))
      .onFalse(openaiCham.to(xepLai)))))
    .onFalse(giuNguyen.to(luuTrichDan)));
