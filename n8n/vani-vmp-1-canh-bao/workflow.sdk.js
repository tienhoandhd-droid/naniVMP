import { workflow, node, trigger } from '@n8n/workflow-sdk';

/* Tách từ WF-04 nhánh cảnh báo đến hạn (2026-07-29). */

const n00 = trigger({
  type: "n8n-nodes-base.scheduleTrigger",
  version: 1.2,
  config: {
  "name": "Schedule (hằng ngày 7h)",
  "parameters": {
    "rule": {
      "interval": [
        {
          "field": "hours"
        }
      ]
    }
  }
}
});

const n01 = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
  "name": "CONFIG1",
  "parameters": {
    "jsCode": "// ====== SỬA 2 GIÁ TRỊ Ở ĐÂY ======\n// 1) ID của GOOGLE SHEET chứa DANH SÁCH NGƯỜI NHẬN cảnh báo (sheet bạn tự xây).\n//    Lấy đoạn giữa /d/ và /edit trong URL.\n// 2) Tên TAB chứa danh sách (mặc định \"CanhBao\").\n// 3) SOON_DAYS: số ngày coi là \"sắp đến hạn\" mặc định (nếu dòng không ghi ngưỡng riêng).\nreturn [{ json: { ...($input.first()?.json || {}),\n  ALERT_SHEET_ID: \"1MPG6YbR6m-YrENqb8u7uS3O8RUYk7GCYuzQRbShtqP8\",\n  ALERT_TAB: \"CanhBao\",\n  SOON_DAYS: 7,\n} }];"
  }
}
});

const n02 = node({
  type: "n8n-nodes-base.googleSheets",
  version: 4.5,
  config: {
  "name": "1. Đọc Sheet người nhận (raw)",
  "parameters": {
    "authentication": "serviceAccount",
    "documentId": {
      "__rl": true,
      "value": "={{ $('CONFIG1').first().json.ALERT_SHEET_ID }}",
      "mode": "id"
    },
    "sheetName": {
      "__rl": true,
      "value": "={{ $('CONFIG1').first().json.ALERT_TAB }}",
      "mode": "name"
    },
    "options": {}
  },
  "credentials": {
    "googleApi": {
      "id": "uqbMxdAY6BDmg4Ez",
      "name": "kết nối google"
    }
  }
}
});

const n03 = node({
  type: "n8n-nodes-base.postgres",
  version: 2.5,
  config: {
  "name": "2. Lấy hạng mục đến hạn (rpc_due_alerts)",
  "parameters": {
    "operation": "executeQuery",
    "query": "SELECT (rpc_due_alerts(EXTRACT(YEAR FROM NOW())::int, {{ $('CONFIG').first().json.SOON_DAYS }})) AS due",
    "options": {}
  },
  "retryOnFail": true,
  "maxTries": 3,
  "waitBetweenTries": 2000,
  "credentials": {
    "postgres": {
      "id": "gUbJq0xGJ2sJMjXx",
      "name": "VMP Supabase Postgres"
    }
  }
}
});

const n04 = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
  "name": "1b. Chuẩn hóa người nhận",
  "parameters": {
    "jsCode": "// Chuẩn hóa danh sách người nhận từ Sheet (tiêu đề tiếng Việt -> khóa ngắn).\n// Sheet \"CanhBao\" có các cột (xem mẫu trong hướng dẫn):\n//   Bật | Loại phạm vi | Phạm vi | Email nhận | Tên người nhận | Loại cảnh báo | Ngưỡng ngày\nfunction norm(h){ return String(h==null?'':h).replace(/\\s+/g,' ').trim().toLowerCase(); }\nconst MAP = {\n  'bật':'enabled', 'bat':'enabled',\n  'loại phạm vi':'scope_type', 'loai pham vi':'scope_type',\n  'phạm vi':'scope', 'pham vi':'scope',\n  'email nhận':'email', 'email nhan':'email', 'email':'email',\n  'tên người nhận':'name', 'ten nguoi nhan':'name',\n  'loại cảnh báo':'alert_kind', 'loai canh bao':'alert_kind',\n  'ngưỡng ngày':'threshold_days', 'nguong ngay':'threshold_days',\n};\nconst truthy = (v)=>{ const s=norm(v); return ['true','1','x','yes','co','có','bật','bat','on'].includes(s); };\nconst out=[];\nfor(const it of $input.all()){\n  const raw=it.json||{}; const m={};\n  for(const [k,v] of Object.entries(raw)){ const t=MAP[norm(k)]; if(t) m[t]=v; }\n  if(!truthy(m.enabled)) continue;                 // chỉ lấy dòng đang bật\n  const email=String(m.email||'').trim();\n  if(!email || !email.includes('@')) continue;     // bỏ dòng thiếu email\n  out.push({ json: {\n    scope_type: norm(m.scope_type),                // 'tất cả' | 'bộ phận' | 'đối tượng'\n    scope: String(m.scope||'').trim(),\n    email, name: String(m.name||'').trim(),\n    alert_kind: norm(m.alert_kind),                // 'quá hạn' | 'sắp đến hạn' | 'cả hai'\n    threshold_days: m.threshold_days!=null && String(m.threshold_days).trim()!=='' ? parseInt(m.threshold_days,10) : null,\n  }});\n}\nif(out.length===0) console.log('⚠ Không có dòng người nhận nào đang bật trong Sheet CanhBao.');\nreturn out;"
  }
}
});

const n05 = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
  "name": "2b. Bung danh sách đến hạn",
  "parameters": {
    "jsCode": "// rpc_due_alerts trả về 1 JSONB (mảng). Bung ra mỗi hạng mục = 1 item.\nconst row = $input.first().json;\nlet arr = row.due || row.rpc_due_alerts || [];\nif (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { arr = []; } }\nif (!Array.isArray(arr)) arr = [];\nreturn arr.map(d => ({ json: d }));"
  }
}
});

const n06 = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
  "name": "3. Ghép người nhận × hạng mục",
  "parameters": {
    "jsCode": "// Ghép (người nhận x hạng mục đến hạn) -> danh sách email cần gửi.\n// Lấy dữ liệu qua tham chiếu node (đảm bảo cả 2 nhánh đã chạy).\nconst recips = $('1b. Chuẩn hóa người nhận').all().map(i=>i.json);\nconst dues   = $('2b. Bung danh sách đến hạn').all().map(i=>i.json);\nconst soonDefault = Number($('CONFIG1').first().json.SOON_DAYS) || 7;\nconst n = (s)=>String(s==null?'':s).toLowerCase();\nconst out=[];\nfor (const d of dues) {\n  for (const r of recips) {\n    // 1) khớp phạm vi\n    let scopeOK=false;\n    if (r.scope_type.includes('tất') || n(r.scope)==='all') scopeOK=true;\n    if (r.scope_type.includes('bộ'))  scopeOK = (n(r.scope)===n(d.department));\n    if (r.scope_type.includes('đối')) scopeOK = (n(r.scope)===n(d.object_code) || n(r.scope)===n(d.validation_code));\n    if (!scopeOK) continue;\n    // 2) khớp loại cảnh báo\n    const wantBoth = r.alert_kind.includes('cả') || r.alert_kind==='';\n    const wantOver = r.alert_kind.includes('quá');\n    const wantSoon = r.alert_kind.includes('sắp');\n    if (!(wantBoth || (wantOver && d.alert_type==='overdue') || (wantSoon && d.alert_type==='due_soon'))) continue;\n    // 3) ngưỡng ngày cho 'sắp đến hạn'\n    if (d.alert_type==='due_soon') {\n      const thr = (r.threshold_days!=null) ? r.threshold_days : soonDefault;\n      if (Number(d.days_left) > thr) continue;\n    }\n    const key = `alert:${d.alert_type}:${d.validation_code}:${d.stage}:${d.due_date}:${r.email}`;\n    out.push({ json: { ...d, _email: r.email, _name: r.name||'', _idem: key } });\n  }\n}\nif(out.length===0) console.log('Không có cảnh báo nào cần gửi hôm nay.');\nreturn out;"
  }
}
});

const n07 = node({
  type: "n8n-nodes-base.postgres",
  version: 2.5,
  config: {
  "name": "4. Đăng ký cảnh báo (chống trùng)",
  "parameters": {
    "operation": "executeQuery",
    "query": "SELECT (rpc_register_alert('{{ $json._idem }}', '{{ $json.alert_type }}', '{{ $json.validation_code }}', '{{ $json._email }}', '{{ ($json._name || '').replace(/'/g, \"''\") }}', '{{ (($json.alert_type==='overdue'?'[QUÁ HẠN] ':'[SẮP ĐẾN HẠN] ') + $json.object_code + ' · ' + $json.stage).replace(/'/g, \"''\") }}', '{{ ($json.object_name || '').replace(/'/g, \"''\") }}')) AS r",
    "options": {}
  },
  "retryOnFail": true,
  "maxTries": 3,
  "waitBetweenTries": 2000,
  "credentials": {
    "postgres": {
      "id": "gUbJq0xGJ2sJMjXx",
      "name": "VMP Supabase Postgres"
    }
  }
}
});

const n08 = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
  "name": "4b. Giữ dữ liệu + cờ mới",
  "parameters": {
    "jsCode": "// Sau node Postgres, lấy lại dữ liệu hạng mục gốc của item hiện tại + cờ is_new.\nconst reg = $json.r || {};\nconst base = $('3. Ghép người nhận × hạng mục').item.json;\nreturn [{ json: { ...base, is_new: !!reg.is_new } }];"
  }
}
});

const n09 = node({
  type: "n8n-nodes-base.if",
  version: 2,
  config: {
  "name": "5. Chỉ cảnh báo MỚI",
  "parameters": {
    "conditions": {
      "options": {
        "caseSensitive": true,
        "leftValue": "",
        "typeValidation": "loose",
        "version": 1
      },
      "conditions": [
        {
          "leftValue": "={{ $json.is_new }}",
          "rightValue": "={{ true }}",
          "operator": {
            "type": "boolean",
            "operation": "true",
            "singleValue": true
          }
        }
      ],
      "combinator": "and"
    },
    "options": {}
  }
}
});

const n10 = node({
  type: "n8n-nodes-base.postgres",
  version: 2.5,
  config: {
  "name": "6. Lấy bối cảnh AI (bộ nhớ)",
  "parameters": {
    "operation": "executeQuery",
    "query": "SELECT (rpc_alert_context('{{ $json.validation_code }}', 5)) AS ctx",
    "options": {}
  },
  "retryOnFail": true,
  "maxTries": 3,
  "waitBetweenTries": 2000,
  "credentials": {
    "postgres": {
      "id": "gUbJq0xGJ2sJMjXx",
      "name": "VMP Supabase Postgres"
    }
  }
}
});

const n11 = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
  "name": "7. Dựng prompt AI",
  "parameters": {
    "jsCode": "// Dựng prompt cho Claude (có TRÍ NHỚ: lịch sử + cảnh báo cũ + xu hướng).\nconst ctx = $json.ctx || {};\nconst item = $('4b. Giữ dữ liệu + cờ mới').item.json;\nconst sys = \"Bạn là trợ lý QA dược phẩm (GMP). Viết 2-3 câu tiếng Việt, ngắn gọn, lịch sự, \"\n  + \"nhắc nhở phụ trách về hạng mục thẩm định sắp/đã đến hạn. Dựa vào LỊCH SỬ và XU HƯỚNG được cung cấp: \"\n  + \"nếu hạng mục đã từng bị dời deadline hoặc đã từng quá hạn, hãy nêu rõ để nhấn mạnh mức ưu tiên. \"\n  + \"Không bịa số liệu. Không thêm tiêu đề, chỉ trả về đoạn văn.\";\nconst user = \"DỮ LIỆU HẠNG MỤC:\n\" + JSON.stringify({\n  ma: item.validation_code, doi_tuong: item.object_name, loai: item.validation_type,\n  giai_doan: item.stage, han: item.due_date, con_lai_ngay: item.days_left,\n  loai_canh_bao: item.alert_type, phu_trach: item.owner_name\n}, null, 2) + \"\n\nBỐI CẢNH/BỘ NHỚ:\n\" + JSON.stringify({\n  trang_thai_hien_tai: ctx.now, lich_su: ctx.history, canh_bao_truoc: ctx.past_alerts, xu_huong: ctx.trend\n}, null, 2);\nreturn [{ json: { ...item, _ai_system: sys, _ai_user: user,\n  _ai_body: JSON.stringify({ model: \"claude-sonnet-4-6\", max_tokens: 400,\n    system: sys, messages: [{ role: \"user\", content: user }] }) } }];"
  }
}
});

const n12 = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.2,
  config: {
  "name": "8. Soạn cảnh báo (Claude AI)",
  "parameters": {
    "method": "POST",
    "url": "https://api.anthropic.com/v1/messages",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        {
          "name": "anthropic-version",
          "value": "2023-06-01"
        },
        {
          "name": "content-type",
          "value": "application/json"
        }
      ]
    },
    "sendBody": true,
    "specifyBody": "raw",
    "options": {
      "timeout": 20000
    }
  },
  "onError": "continueRegularOutput",
  "notes": "Credential Header Auth: Name = x-api-key, Value = <ANTHROPIC_API_KEY>. Nếu không dùng AI, xóa node này và nối thẳng 7 -> 9 (sẽ dùng nội dung mặc định)."
}
});

const n13 = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
  "name": "9. Dựng email HTML",
  "parameters": {
    "jsCode": "// Dựng email HTML. Ưu tiên đoạn văn AI; nếu AI lỗi/tắt -> nội dung mặc định.\nconst item = $('7. Dựng prompt AI').item.json;\nlet aiText = '';\ntry {\n  const resp = $json;                 // output node Claude (nếu có)\n  if (resp && resp.content && Array.isArray(resp.content)) {\n    aiText = resp.content.filter(b=>b.type==='text').map(b=>b.text).join(' ').trim();\n  }\n} catch(e) {}\nconst over = item.alert_type === 'overdue';\nconst tone = over ? '#b00020' : '#9a6a00';\nconst label = over ? 'QUÁ HẠN' : 'SẮP ĐẾN HẠN';\nconst fallback = `Hạng mục ${item.validation_code} (${item.object_name||''}) — giai đoạn ${item.stage} ${over?'đã quá hạn':'sắp đến hạn'} `\n  + `vào ${item.due_date}${over?'':` (còn ${item.days_left} ngày)`}. Đề nghị ${item.owner_name||'phụ trách'} kiểm tra và cập nhật tiến độ.`;\nconst body = aiText || fallback;\nconst subject = `[${label}] ${item.object_code} · ${item.stage} · ${item.due_date}`;\nconst html = `\n<div style=\"font-family:Arial,sans-serif;max-width:600px;border:1px solid #eee;border-radius:10px;overflow:hidden\">\n  <div style=\"background:${tone};color:#fff;padding:12px 16px;font-weight:bold\">VMP Monitor · Cảnh báo ${label}</div>\n  <div style=\"padding:16px;color:#222;line-height:1.6\">\n    <p>${body}</p>\n    <table style=\"border-collapse:collapse;font-size:13px;margin-top:8px\">\n      <tr><td style=\"padding:4px 10px;color:#666\">Mã thẩm định</td><td style=\"padding:4px 10px\"><b>${item.validation_code}</b></td></tr>\n      <tr><td style=\"padding:4px 10px;color:#666\">Đối tượng</td><td style=\"padding:4px 10px\">${item.object_name||''} (${item.object_code})</td></tr>\n      <tr><td style=\"padding:4px 10px;color:#666\">Loại</td><td style=\"padding:4px 10px\">${item.validation_type}</td></tr>\n      <tr><td style=\"padding:4px 10px;color:#666\">Giai đoạn</td><td style=\"padding:4px 10px\">${item.stage}</td></tr>\n      <tr><td style=\"padding:4px 10px;color:#666\">Deadline</td><td style=\"padding:4px 10px\"><b>${item.due_date}</b></td></tr>\n      <tr><td style=\"padding:4px 10px;color:#666\">Phụ trách</td><td style=\"padding:4px 10px\">${item.owner_name||'—'}</td></tr>\n    </table>\n    <p style=\"font-size:11px;color:#999;margin-top:14px\">Email tự động từ hệ thống VMP Monitor. Nội dung gợi ý do AI soạn — vui lòng kiểm tra trước khi hành động.</p>\n  </div>\n</div>`;\nreturn [{ json: { ...item, _subject: subject, _html: html } }];"
  }
}
});

const n14 = node({
  type: "n8n-nodes-base.gmail",
  version: 2.1,
  config: {
  "name": "10. Gửi Gmail",
  "parameters": {
    "authentication": "serviceAccount",
    "resource": "message",
    "operation": "send",
    "sendTo": "={{ $json._email }}",
    "subject": "={{ $json._subject }}",
    "message": "={{ $json._html }}",
    "options": {}
  },
  "onError": "continueErrorOutput",
  "notes": "Có thể thay bằng node SMTP (Send Email) nếu dùng mail nội bộ. Lỗi -> nhánh phải đánh dấu failed.",
  "credentials": {
    "googleApi": {
      "id": "uqbMxdAY6BDmg4Ez",
      "name": "kết nối google"
    }
  }
}
});

const n15 = node({
  type: "n8n-nodes-base.postgres",
  version: 2.5,
  config: {
  "name": "11. Đánh dấu đã gửi",
  "parameters": {
    "operation": "executeQuery",
    "query": "SELECT rpc_mark_alert_sent('{{ $json._idem }}', true, NULL)",
    "options": {}
  },
  "retryOnFail": true,
  "maxTries": 3,
  "waitBetweenTries": 2000,
  "credentials": {
    "postgres": {
      "id": "gUbJq0xGJ2sJMjXx",
      "name": "VMP Supabase Postgres"
    }
  }
}
});

const n16 = node({
  type: "n8n-nodes-base.postgres",
  version: 2.5,
  config: {
  "name": "12. Đánh dấu lỗi",
  "parameters": {
    "operation": "executeQuery",
    "query": "SELECT rpc_mark_alert_sent('{{ $json._idem }}', false, 'WF-07: gửi mail thất bại')",
    "options": {}
  },
  "retryOnFail": true,
  "maxTries": 3,
  "waitBetweenTries": 2000,
  "credentials": {
    "postgres": {
      "id": "gUbJq0xGJ2sJMjXx",
      "name": "VMP Supabase Postgres"
    }
  }
}
});

const nWeb = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2,
  config: {
  "name": "Trigger: chạy ngay (tùy chọn)",
  "parameters": {
    "httpMethod": "POST",
    "path": "vmp-alert-now",
    "authentication": "headerAuth",
    "options": {}
  },
  "credentials": {
    "httpHeaderAuth": { "id": "xrCgCgomdKuB9B0I", "name": "x-vmp-secret" }
  }
}
});

export default workflow("vani-vmp-1-canh-bao", "Vani VMP 1 — Cảnh báo đến hạn")
  .add(n00)
  .add(n00).to(n01)
  .add(n01).to(n02)
  .add(n01).to(n03)
  .add(n02).to(n04)
  .add(n03).to(n05)
  .add(n04).to(n06)
  .add(n05).to(n06)
  .add(n06).to(n07)
  .add(n07).to(n08)
  .add(n08).to(n09)
  .add(n09).to(n10)
  .add(n10).to(n11)
  .add(n11).to(n12)
  .add(n12).to(n13)
  .add(n13).to(n14)
  .add(n14).to(n15)
  .add(n14).to(n16)
  .add(nWeb).to(n01);
