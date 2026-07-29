import { workflow, node, trigger } from '@n8n/workflow-sdk';

/* Tách từ WF-04 nhánh Error Trigger (2026-07-29). */

const n00 = trigger({
  type: "n8n-nodes-base.errorTrigger",
  version: 1,
  config: {
  "name": "Error Trigger",
  "parameters": {}
}
});

const n01 = node({
  type: "n8n-nodes-base.postgres",
  version: 2.5,
  config: {
  "name": "1. Ghi workflow_runs (failed)",
  "parameters": {
    "operation": "executeQuery",
    "query": "INSERT INTO workflow_runs (workflow_id, workflow_name, execution_id, status, error_message, error_details, triggered_by)\nVALUES (\n  '{{ ($json.workflow && $json.workflow.id) ? String($json.workflow.id).replace(/'/g, \"''\") : 'unknown' }}',\n  '{{ ($json.workflow && $json.workflow.name) ? String($json.workflow.name).replace(/'/g, \"''\") : 'unknown' }}',\n  '{{ ($json.execution && $json.execution.id) ? String($json.execution.id).replace(/'/g, \"''\") : '' }}',\n  'failed',\n  '{{ String(($json.execution && $json.execution.error && $json.execution.error.message) || 'Lỗi không xác định').replace(/'/g, \"''\") }}',\n  jsonb_build_object('lastNode', '{{ ($json.execution && $json.execution.lastNodeExecuted) ? String($json.execution.lastNodeExecuted).replace(/'/g, \"''\") : '' }}',\n                     'url', '{{ ($json.execution && $json.execution.url) ? String($json.execution.url).replace(/'/g, \"''\") : '' }}'),\n  'error-trigger'\n);",
    "options": {}
  },
  "onError": "continueRegularOutput",
  "credentials": {
    "postgres": {
      "id": "gUbJq0xGJ2sJMjXx",
      "name": "VMP Supabase Postgres"
    }
  }
}
});

const n02 = node({
  type: "n8n-nodes-base.gmail",
  version: 2.1,
  config: {
  "name": "2. Email admin (tuỳ chọn)",
  "parameters": {
    "authentication": "serviceAccount",
    "sendTo": "Tienhoan.dhd@gmail.com",
    "subject": "=[VMP Monitor] Workflow LỖI: {{ $('Error Trigger').item.json.workflow.name }}",
    "emailType": "text",
    "message": "=Workflow: {{ $('Error Trigger').item.json.workflow.name }}\nNode lỗi: {{ $('Error Trigger').item.json.execution.lastNodeExecuted }}\nLỗi: {{ $('Error Trigger').item.json.execution.error.message }}\nXem: {{ $('Error Trigger').item.json.execution.url }}",
    "options": {}
  },
  "onError": "continueRegularOutput",
  "notes": "Sửa địa chỉ admin@cpc1hn.vn thành email nhận cảnh báo lỗi. Không cần email thì xóa node này.",
  "credentials": {
    "googleApi": {
      "id": "uqbMxdAY6BDmg4Ez",
      "name": "kết nối google"
    }
  }
}
});

export default workflow("vani-vmp-2-xu-ly-loi", "Vani VMP 2 — Xử lý lỗi tập trung")
  .add(n00)
  .add(n00).to(n01)
  .add(n01).to(n02);
