# Visual Explorer research 2026

Ngay lap: 2026-07-06

Pham vi: nghien cuu pattern hien thi timeline, so do va dashboard de nang cap
man `Visual Explorer` cua VMP Monitor. Muc tieu la giu du lieu Supabase hien co,
khong them ghi du lieu, va giup nguoi dung quan sat nhanh tren man hinh web.

## Nguon tham khao

| Nguon | Pattern rut ra | Ung dung trong VMP |
| --- | --- | --- |
| visjs/vis-timeline - https://github.com/visjs/vis-timeline | timeline co truc thoi gian, zoom/move va current marker | Tao timeline co truc thang ro, marker `Hom nay`, bar theo deadline |
| xyflow/xyflow - https://github.com/xyflow/xyflow | node-based UI, tuong tac node/edge, detail khi chon | So do VMP co node nguon/nhom/bo phan/trang thai va detail panel |
| apache/echarts - https://github.com/apache/echarts | dashboard chart nen uu tien tong quan + drill-down | Tach KPI pulse, pipeline 3 moc va grid phan bo trong mot layout |
| mermaid-js/mermaid releases - https://github.com/mermaid-js/mermaid/releases | timeline/architecture diagram can huong va layout on dinh | Dung nhan ngan, lane ro, tranh text chong len truc |
| tldraw/tldraw - https://github.com/tldraw/tldraw | canvas can zoom, focus va controls don gian | Them zoom controls cho so do, giu canvas trong khung quan sat |
| antvis/G6 - https://github.com/antvis/G6 | graph visualization can lane/layout/interactions | Chia so do thanh 4 lane: nguon, nhom doi tuong, bo phan, trang thai |
| TanStack Table - https://github.com/tanstack/table | bang day du lieu can sticky header/column, sort/filter ro | Bang du lieu co header va ma hang muc sticky, scroll noi bo |
| Tremor - https://github.com/tremorlabs | dashboard nen gon, KPI doc nhanh, it trang tri | Console ngan voi KPI pulse, filter gan noi dung |
| Reagraph - https://github.com/reaviz/reagraph | graph lon can zoom/selection va performance-friendly | Gioi han node tong hop thay vi ve moi hang muc thanh node rieng |

## Quyet dinh thiet ke

- Giu 4 che do trong cung mot workspace: Timeline, So do, Bo cuc, Bang.
- Doi hero lon thanh console van hanh ngan: context, tab, density, KPI pulse va
  filter o cung mot cum.
- Khong hien detail rong mac dinh; chi mo panel detail khi nguoi dung chon
  event/node/row.
- Timeline uu tien doc tren desktop: cot hang muc ben trai, truc thang ben phai,
  marker `Hom nay`, legend ngan.
- So do dung node tong hop de tranh qua tai voi hang tram hang muc.
- Dashboard dung KPI + pipeline 3 moc VMP: De cuong, Tham dinh thuc te, Hoan
  thanh VMP.
- Bang dung sticky header/ma hang muc va scroll noi bo de khong keo trang qua
  dai.
- Mobile uu tien khong tran ngang: filter cuon ngang noi bo, pulse metrics 2
  cot, timeline scroll trong panel.

## Gioi han da chu y

- Khong them dependency lon trong phase nay.
- Khong thay doi Supabase RPC, schema, RLS hoac n8n workflow.
- Khong luu snapshot du lieu that vao repo.
- Khong dua helper QA dang nhap local vao commit.
