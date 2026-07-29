import { workflow, node, trigger, sticky, languageModel, memory, tool, ifElse, expr, fromAi, nodeJson } from '@n8n/workflow-sdk';

const PG = { postgres: { id: 'gUbJq0xGJ2sJMjXx', name: 'VMP Supabase Postgres' } };

const LUAT = 'Bạn là trợ lý của hệ giám sát thẩm định VMP tại CPC1 HN. Trả lời bằng TIẾNG VIỆT.\n\nQUY TẮC BẮT BUỘC\n1. KHÔNG tự đoán bất kỳ con số nào. Mọi con số phải lấy từ công cụ "Tra so lieu timeline". Chưa gọi công cụ thì chưa được nói số.\n2. Câu hỏi về luật, quy tắc, cách tính, vì sao — gọi "Tra tai lieu luat GMP" rồi trích dẫn tên mục.\n3. Câu hỏi vừa có số vừa có luật thì gọi CẢ HAI công cụ.\n4. Câu hỏi dài hoặc nhiều ý: tách thành từng ý nhỏ, gọi công cụ cho từng ý, rồi mới tổng hợp một câu trả lời liền mạch.\n5. Không tìm thấy dữ liệu thì nói thẳng "không có trong dữ liệu", tuyệt đối không bịa. Đây là hệ GMP, một con số sai có thể thành sai lệch hồ sơ.\n6. Trả lời chi tiết và có cấu trúc: kết luận trước, rồi số liệu, rồi giải thích. Có danh sách thì gạch đầu dòng, ghi rõ mã hạng mục.\n7. Cuối câu trả lời ghi một dòng "Nguồn:" liệt kê công cụ đã dùng và tên mục tài liệu nếu có.\n\nGIẢI NGHĨA THUẬT NGỮ\n- IQ/OQ/PQ/PV/GSP: các loại thẩm định. VMP: kế hoạch thẩm định gốc.\n- Điểm trọng yếu 1..9 = mức độ phức tạp (1-3) × ảnh hưởng chất lượng sản phẩm (1-3). Từ 7 trở lên là nhóm ưu tiên.\n- trang_thai_tinh: done=hoàn thành, over=quá hạn, prog=đang làm, todo/plan=chưa bắt đầu.';

const hoiDapWebhook = trigger({
  type: 'n8n-nodes-base.webhook', version: 2.1,
  config: {
    name: 'Nhận câu hỏi từ web',
    parameters: { httpMethod: 'POST', path: 'vmp-hoi-dap', responseMode: 'responseNode', authentication: 'headerAuth', options: {} },
    credentials: { httpHeaderAuth: { id: 'xrCgCgomdKuB9B0I', name: 'x-vmp-secret' } }
  },
  output: [{ body: { cau_hoi: 'Ai phụ trách HVAC-C1?', phien: 'u1', email: 'a@b.com' } }]
});

const chuanHoa = node({
  type: 'n8n-nodes-base.set', version: 3.4,
  config: {
    name: 'Chuẩn hoá đầu vào',
    parameters: {
      mode: 'manual', includeOtherFields: false,
      assignments: { assignments: [
        { id: 'q', name: 'cau_hoi', value: expr('{{ $json.body?.cau_hoi ?? $json.cau_hoi ?? "" }}'), type: 'string' },
        { id: 's', name: 'phien', value: expr('{{ $json.body?.phien ?? $json.phien ?? "khach" }}'), type: 'string' },
        { id: 'e', name: 'email', value: expr('{{ $json.body?.email ?? $json.email ?? "" }}'), type: 'string' },
        { id: 't', name: 'bat_dau', value: expr('{{ $now.toMillis() }}'), type: 'number' }
      ] }
    }
  },
  output: [{ cau_hoi: 'Ai phụ trách HVAC-C1?', phien: 'u1', email: 'a@b.com', bat_dau: 1750000000000 }]
});

const thuTraLoiThang = node({
  type: 'n8n-nodes-base.postgres', version: 2.6,
  config: {
    name: 'Thử trả lời bằng SQL',
    parameters: {
      operation: 'executeQuery',
      query: 'select public.rpc_ai_tra_loi_nhanh($1) as kq',
      options: { queryReplacement: expr('{{ $json.cau_hoi }}') }
    },
    credentials: PG
  },
  output: [{ kq: { khop: true, y_dinh: 'dem_qua_han', tra_loi: 'Hiện có 162 hạng mục quá hạn.' } }]
});

const canAiKhong = ifElse({
  version: 2.2,
  config: {
    name: 'SQL trả lời được chưa?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $json.kq.khop }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      }
    }
  }
});

const ghiNhatKySql = node({
  type: 'n8n-nodes-base.postgres', version: 2.6,
  config: {
    name: 'Nhật ký (đường SQL)',
    parameters: {
      operation: 'executeQuery',
      query: 'insert into public.vmp_ai_chat_log (user_email, question, answer, model, duong_tra_loi, y_dinh, latency_ms) values ($1, $2, $3, $4, $5, $6, $7)',
      options: { queryReplacement: expr('{{ $("Chuẩn hoá đầu vào").item.json.email }}, {{ $("Chuẩn hoá đầu vào").item.json.cau_hoi }}, {{ $json.kq.tra_loi }}, khong-dung-ai, sql, {{ $json.kq.y_dinh }}, {{ $now.toMillis() - $("Chuẩn hoá đầu vào").item.json.bat_dau }}') }
    },
    onError: 'continueRegularOutput',
    credentials: PG
  },
  output: [{ ok: true }]
});

const traLoiSql = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: {
    name: 'Trả lời (không dùng AI)',
    parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify({ ok: true, nguon: "sql", tra_loi: $("Thử trả lời bằng SQL").item.json.kq.tra_loi }) }}') }
  },
  output: [{ ok: true }]
});

const moHinhGemini = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini', version: 1.1,
  config: {
    name: 'Gemini (chính)',
    parameters: { modelName: 'models/gemini-2.5-flash', options: { temperature: 0.2, maxOutputTokens: 4096 } },
    credentials: { googlePalmApi: { id: 'K79Qvznx7qa4UfFp', name: 'Tài khoảng Gemini' } }
  }
});

const moHinhGroq = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatGroq', version: 1,
  config: {
    name: 'Groq (dự phòng)',
    parameters: { model: 'llama-3.3-70b-versatile', options: { temperature: 0.2, maxTokensToSample: 4096 } },
    credentials: { groqApi: { id: 'AXe1ssETLX8feewe', name: 'Tài khoản Groq' } }
  }
});

const boNho = memory({
  type: '@n8n/n8n-nodes-langchain.memoryBufferWindow', version: 1.3,
  config: { name: 'Nhớ mạch hội thoại', parameters: { sessionIdType: 'customKey', sessionKey: nodeJson(chuanHoa, 'phien'), contextWindowLength: 8 } }
});

const congCuSoLieu = tool({
  type: 'n8n-nodes-base.postgresTool', version: 2.6,
  config: {
    name: 'Tra so lieu timeline',
    parameters: {
      descriptionType: 'manual',
      toolDescription: 'Lấy SỐ LIỆU THẬT của timeline VMP: tổng số hạng mục, số quá hạn, tỷ lệ hoàn thành, phân bố theo điểm trọng yếu, theo người phụ trách, theo loại thẩm định, danh sách quá hạn nặng nhất, sắp đến hạn 30 ngày, và các dòng khớp từ khoá trong câu hỏi. Tính trên TOÀN BỘ bảng nên luôn đúng. LUÔN gọi trước khi trả lời câu hỏi có số, tên thiết bị, mã, người phụ trách, hạn hoặc trạng thái.',
      operation: 'executeQuery',
      query: 'select public.rpc_ai_context($1) as ket_qua',
      options: { queryReplacement: fromAi('cau_hoi', 'Nguyên văn câu hỏi của người dùng, giữ đủ tên thiết bị và mã nếu có') }
    },
    credentials: PG
  }
});

const congCuLuat = tool({
  type: 'n8n-nodes-base.postgresTool', version: 2.6,
  config: {
    name: 'Tra tai lieu luat GMP',
    parameters: {
      descriptionType: 'manual',
      toolDescription: 'Tra tài liệu LUẬT và giải thích: quy tắc sinh timeline VMP01, cách tính deadline đề cương/thẩm định/báo cáo, cách chấm điểm trọng yếu và vì sao một thiết bị được điểm đó, yêu cầu GMP (EU GMP Annex 15, Annex 11, 21 CFR Part 11, ALCOA+, ICH Q9, ISPE), kiến trúc hệ thống. Dùng khi câu hỏi bắt đầu bằng vì sao, thế nào, quy tắc, luật, cách tính, yêu cầu.',
      operation: 'executeQuery',
      query: 'select public.rpc_kb_search_text($1, 6) as ket_qua',
      options: { queryReplacement: fromAi('tu_khoa', 'Cụm từ khoá tiếng Việt mô tả nội dung cần tra') }
    },
    credentials: PG
  }
});

const congCuSoLieu2 = tool({
  type: 'n8n-nodes-base.postgresTool', version: 2.6,
  config: {
    name: 'Tra so lieu timeline (du phong)',
    parameters: {
      descriptionType: 'manual',
      toolDescription: 'Lấy SỐ LIỆU THẬT của timeline VMP, tính trên toàn bộ bảng. LUÔN gọi trước khi trả lời câu hỏi có số, tên thiết bị, mã, người phụ trách, hạn hoặc trạng thái.',
      operation: 'executeQuery',
      query: 'select public.rpc_ai_context($1) as ket_qua',
      options: { queryReplacement: fromAi('cau_hoi', 'Nguyên văn câu hỏi của người dùng') }
    },
    credentials: PG
  }
});

const congCuLuat2 = tool({
  type: 'n8n-nodes-base.postgresTool', version: 2.6,
  config: {
    name: 'Tra tai lieu luat GMP (du phong)',
    parameters: {
      descriptionType: 'manual',
      toolDescription: 'Tra tài liệu luật VMP và yêu cầu GMP. Dùng khi câu hỏi hỏi vì sao, quy tắc, cách tính.',
      operation: 'executeQuery',
      query: 'select public.rpc_kb_search_text($1, 6) as ket_qua',
      options: { queryReplacement: fromAi('tu_khoa', 'Cụm từ khoá tiếng Việt cần tra') }
    },
    credentials: PG
  }
});

const troLyGemini = node({
  type: '@n8n/n8n-nodes-langchain.agent', version: 3.1,
  config: {
    name: 'Trợ lý VMP (Gemini)',
    parameters: { promptType: 'define', text: expr('{{ $("Chuẩn hoá đầu vào").item.json.cau_hoi }}'), options: { systemMessage: LUAT } },
    subnodes: { model: moHinhGemini, memory: boNho, tools: [congCuSoLieu, congCuLuat] },
    onError: 'continueErrorOutput'
  },
  output: [{ output: 'HVAC-C1 hiện chưa có QA phụ trách…' }]
});

const troLyGroq = node({
  type: '@n8n/n8n-nodes-langchain.agent', version: 3.1,
  config: {
    name: 'Trợ lý VMP (Groq dự phòng)',
    parameters: { promptType: 'define', text: expr('{{ $("Chuẩn hoá đầu vào").item.json.cau_hoi }}'), options: { systemMessage: LUAT } },
    subnodes: { model: moHinhGroq, tools: [congCuSoLieu2, congCuLuat2] },
    onError: 'continueErrorOutput'
  },
  output: [{ output: 'HVAC-C1 hiện chưa có QA phụ trách…' }]
});

const ghiNhatKyGemini = node({
  type: 'n8n-nodes-base.postgres', version: 2.6,
  config: {
    name: 'Nhật ký (Gemini)',
    parameters: {
      operation: 'executeQuery',
      query: 'insert into public.vmp_ai_chat_log (user_email, question, answer, model, duong_tra_loi, latency_ms) values ($1, $2, $3, $4, $5, $6)',
      options: { queryReplacement: expr('{{ $("Chuẩn hoá đầu vào").item.json.email }}, {{ $("Chuẩn hoá đầu vào").item.json.cau_hoi }}, {{ $json.output }}, gemini-2.5-flash, gemini, {{ $now.toMillis() - $("Chuẩn hoá đầu vào").item.json.bat_dau }}') }
    },
    onError: 'continueRegularOutput',
    credentials: PG
  },
  output: [{ ok: true }]
});

const ghiNhatKyGroq = node({
  type: 'n8n-nodes-base.postgres', version: 2.6,
  config: {
    name: 'Nhật ký (Groq)',
    parameters: {
      operation: 'executeQuery',
      query: 'insert into public.vmp_ai_chat_log (user_email, question, answer, model, duong_tra_loi, latency_ms) values ($1, $2, $3, $4, $5, $6)',
      options: { queryReplacement: expr('{{ $("Chuẩn hoá đầu vào").item.json.email }}, {{ $("Chuẩn hoá đầu vào").item.json.cau_hoi }}, {{ $json.output }}, llama-3.3-70b, du_phong, {{ $now.toMillis() - $("Chuẩn hoá đầu vào").item.json.bat_dau }}') }
    },
    onError: 'continueRegularOutput',
    credentials: PG
  },
  output: [{ ok: true }]
});

const traLoiGemini = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Trả lời (Gemini)', parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify({ ok: true, nguon: "gemini", tra_loi: $("Trợ lý VMP (Gemini)").item.json.output }) }}') } },
  output: [{ ok: true }]
});

const traLoiGroq = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Trả lời (Groq dự phòng)', parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify({ ok: true, nguon: "du_phong", tra_loi: $("Trợ lý VMP (Groq dự phòng)").item.json.output }) }}') } },
  output: [{ ok: true }]
});

const traLoiHetCach = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Trả lời khi cả hai lỗi', parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify({ ok: false, loi: "Cả Gemini và Groq đều không trả lời được lúc này. Thử hỏi lại theo mẫu ngắn hơn — ví dụ \\"bao nhiêu hạng mục quá hạn\\" — vì những câu đó được trả lời thẳng bằng SQL, không cần AI." }) }}') } },
  output: [{ ok: false }]
});

const ghiChu = sticky('## Ba tầng trả lời, chỉ tầng nào cần mới tốn AI\n\n**Tầng 1 — SQL, không dùng AI** (`rpc_ai_tra_loi_nhanh`)\nCâu hỏi có mẫu quen: đếm quá hạn, tỷ lệ hoàn thành, ai nhiều việc nhất, thiếu QA, sắp đến hạn, nhóm trọng yếu, tra một mã cụ thể.\n~20ms · không bao giờ đếm sai · không tốn hạn mức.\n\n**Tầng 2 — Gemini 2.5 Flash**\nCâu cần suy luận hoặc tra luật. Hai công cụ Postgres: số liệu tính trên toàn bộ bảng, và tài liệu luật.\n\n**Tầng 3 — Groq Llama 3.3 70B (dự phòng)**\nChạy khi Gemini lỗi hoặc hết hạn mức miễn phí.\n\nCột `duong_tra_loi` trong `vmp_ai_chat_log` ghi tầng nào đã trả lời — xem để biết lớp SQL gánh được bao nhiêu phần trăm.', [hoiDapWebhook, troLyGroq], { color: 4 });

export default workflow('vani-vmp-4', 'Vani VMP 4 — Trợ lý hỏi đáp VMP')
  .add(hoiDapWebhook)
  .to(chuanHoa)
  .to(thuTraLoiThang)
  .to(canAiKhong
    .onTrue(ghiNhatKySql.to(traLoiSql))
    .onFalse(troLyGemini
      .onError(troLyGroq.onError(traLoiHetCach).to(ghiNhatKyGroq).to(traLoiGroq))
      .to(ghiNhatKyGemini).to(traLoiGemini)))
  .add(ghiChu);
