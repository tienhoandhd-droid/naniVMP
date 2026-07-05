# Data contract cho timeline, diagram va dashboard

Ngay lap: 2026-07-06

Tai lieu nay dinh nghia lop du lieu trung gian de nhieu view cung doc mot mo hinh
thong nhat. Nguon runtime hien tai la `rpc_get_vmp_dashboard` trong Supabase,
duoc nap qua `useVmpData()`.

## Nguon vao

```ts
type VmpDashboardPayload = {
  objects: VmpObject[];
  activities: VmpActivity[];
  updated_at?: string;
};
```

Trong app hien tai:

- `objects` la danh muc doi tuong VMP.
- `activities` la cac hang muc ke hoach/tham dinh, da duoc `enrich()` bo sung
  thong tin doi tuong.
- `_raw` giu lai dong du lieu canonical de tinh trang thai chi tiet.

## TimelineEvent

```ts
type TimelineEvent = {
  id: string;
  code: string;
  title: string;
  start: string;
  end: string;
  target: string;
  status: "done" | "prog" | "over" | "todo" | "plan";
  group: string;
  owner: string;
  criticality: "Cao" | "TB" | "Thap" | string;
  source: "supabase";
};
```

Muc dich:

- Render timeline strip, Gantt nhe, milestone list.
- Sap xep theo `target`.
- Loc theo `status`, `group`, `owner`, `criticality`.

## DiagramNode

```ts
type DiagramNode = {
  id: string;
  label: string;
  type: "source" | "department" | "class" | "status" | "activity";
  status?: string;
  count?: number;
  x?: number;
  y?: number;
  meta?: Record<string, unknown>;
};
```

Muc dich:

- Render process map va entity relation.
- Cho phep click node de mo detail.
- Co the nang len React Flow neu can canvas keo-tha/zoom/pan lon hon.

## DiagramEdge

```ts
type DiagramEdge = {
  id: string;
  source: string;
  target: string;
  relation: string;
  weight?: number;
  status?: string;
};
```

Muc dich:

- Noi nguon Supabase/read model voi nhom, bo phan, trang thai.
- Bieu dien so luong bang `weight`.

## DashboardMetric

```ts
type DashboardMetric = {
  key: string;
  label: string;
  value: number | string;
  tone: "neutral" | "good" | "warn" | "bad";
  helper?: string;
};
```

Muc dich:

- Gom KPI co the hien thi o overview, Visual Explorer va README screenshot sau nay.
- Tach tinh toan khoi UI component.

## Quy uoc trang thai

| Status | Y nghia |
| --- | --- |
| `done` | Hoan thanh VMP hoac da co trang thai VMP hoan thanh |
| `prog` | Dang thuc hien, co it nhat mot moc da/duoc xu ly |
| `over` | Qua han theo ngay hien tai va chua hoan thanh |
| `todo` | Chua thuc hien gan han |
| `plan` | Ke hoach, chua toi giai doan thuc hien |

## Bao mat

- Contract khong chua secret.
- Contract khong mo them duong ghi.
- Neu xuat JSON cho GitHub Pages, phai sanitize truong `_raw`, ten nguoi, email,
  token, URL noi bo va bat ky gia tri nhay cam nao.
