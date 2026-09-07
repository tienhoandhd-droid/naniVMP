export type CatalogHelpRegion =
  | "objects" | "coverage" | "products" | "alerts"
  | "revalidation" | "import" | "pending" | "history";

export interface CatalogHelpGuide {
  title: string;
  summary: string;
  steps: string[];
  fields?: string[];
  caution?: string;
  readerNote: string;
  editorNote: string;
}

/* Nội dung ở đây mô tả đúng các đường dữ liệu đã được RPC kiểm quyền. Nó
 * không chứa callback hay quyền ghi, để nút trợ giúp luôn an toàn ở chế độ
 * chỉ đọc và không thể trở thành một lối thao tác thứ hai. */
export const CATALOG_HELP_CONTENT: Record<CatalogHelpRegion, CatalogHelpGuide> = {
  objects: {
    title: "Đối tượng", summary: "Danh mục gốc của thiết bị, quy trình, kho, hệ thống phụ trợ và vận chuyển.",
    steps: [
      "Chọn loại đối tượng, tìm theo mã hoặc tên, rồi dùng Bộ lọc để thu hẹp theo Bộ phận, Khu vực, Thẩm định, Tháng đầu tiên, Người phụ trách và Tần suất.",
      "Mở một dòng để kiểm tra dữ liệu; khi được cấp quyền sửa, chọn Thêm đối tượng hoặc Sửa và chỉ lưu sau khi đã rà thông tin.",
      "Các thay đổi Có thẩm định, Tần suất (tháng), Tháng đầu tiên hoặc Năm tham chiếu được lưu ở Dữ liệu nguồn trước; chúng có thể tạo một mục Chờ áp dụng cho timeline.",
    ],
    fields: [
      "Mã đối tượng và Tên đối tượng: bắt buộc khi tạo; mã là khoá nghiệp vụ, không sửa sau khi tạo.",
      "Bộ phận quản lý, Mã khu vực và Dây chuyền: chọn đúng nơi vận hành để lọc và phân quyền theo phạm vi.",
      "Có thẩm định: bật khi đối tượng thuộc kế hoạch; đổi giá trị này cần lý do và có thể tạo thay đổi chờ cho timeline.",
      "Tần suất (tháng), Tháng đầu tiên, Năm tham chiếu: nhập số theo kế hoạch; đổi bất kỳ trường nào cũng cần lý do và được xem ảnh hưởng trước khi đổi timeline.",
      "Người phụ trách: chọn người đúng trong biểu mẫu phân công; thông tin này được lưu riêng để đồng bộ nguồn không ghi đè phân công.",
    ],
    caution: "Các trường chạm luật timeline cần lý do; mã và phạm vi vẫn do máy chủ kiểm tra theo quyền hiện hành.",
    readerNote: "Bạn có thể tìm, lọc và kiểm tra các đối tượng trong phạm vi được cấp; màn này đang chỉ đọc.",
    editorNote: "Mỗi lần lưu thay đổi có thể được ghi vào lịch sử; hãy dùng lý do cụ thể khi biểu mẫu yêu cầu.",
  },
  coverage: {
    title: "Phạm vi xưởng", summary: "Phân công phạm vi Source để người thực hiện nhìn đúng bộ phận và khu vực được giao.",
    steps: [
      "Chọn người thực hiện, rồi chọn Bộ phận và Khu vực từ dữ liệu Source; Dây chuyền là lựa chọn bổ sung khi cần giới hạn chi tiết hơn.",
      "Nhập lý do trước khi Lưu hoặc Thu hồi. Danh sách lựa chọn được tải theo Source, nên hãy tải lại nếu vừa cập nhật danh mục.",
      "Sau khi lưu, kiểm tra lại trạng thái phạm vi trong danh sách; nếu phiên bản đã đổi trên máy chủ, tải lại rồi thực hiện lại trên dữ liệu mới.",
    ],
    fields: ["Người thực hiện", "Bộ phận", "Khu vực", "Dây chuyền", "Lý do thay đổi"],
    caution: "Phạm vi quyết định dữ liệu Source được nhìn thấy, không thay quyền ghi hay quyền sinh timeline.",
    readerNote: "Phạm vi được trình bày để tham khảo; bạn không thể thay đổi phân công trong chế độ chỉ đọc.",
    editorNote: "Chỉ người có quyền quản lý phạm vi xưởng mới thấy các thao tác lưu hoặc thu hồi.",
  },
  products: {
    title: "Sản phẩm GMP", summary: "Danh mục sản phẩm phục vụ thẩm định quy trình.",
    steps: [
      "Tìm theo mã hoặc tên để tránh tạo trùng, rồi mở dòng cần kiểm tra.",
      "Khi thêm hoặc sửa, điền Tên sản phẩm trước; dùng các giá trị gợi ý cho hoạt chất, hàm lượng, dạng bào chế, dây chuyền, bao bì và cỡ lô khi có.",
      "Mã BFO là khoá nghiệp vụ và không sửa được sau khi tạo. Nêu lý do nếu biểu mẫu yêu cầu trước khi lưu.",
    ],
    fields: [
      "Bắt buộc khi tạo: Mã BFO và Tên sản phẩm. Mã BFO là khoá nghiệp vụ, không sửa sau khi tạo.",
      "Hoạt chất là văn bản; Hàm lượng, Dạng bào chế, Dây chuyền, Bao bì sơ cấp, Cỡ lô và Bồn pha dùng giá trị gợi ý khi có để giữ dữ liệu nhất quán.",
      "Đang dùng: tắt để ngừng dùng, không xoá bản ghi; thay đổi trạng thái này bắt buộc nêu lý do.",
    ],
    caution: "Đổi trạng thái Đang dùng được ghi nhận cùng lý do, không xoá vật lý bản ghi.",
    readerNote: "Bạn có thể tra cứu sản phẩm được phép xem; không có thao tác thêm hoặc sửa trong chế độ chỉ đọc.",
    editorNote: "Chỉ Admin và Quản lý QA được thêm hoặc sửa danh mục sản phẩm GMP.",
  },
  alerts: {
    title: "Người nhận cảnh báo", summary: "Danh sách địa chỉ nhận email quá hạn và báo cáo AI định kỳ.",
    steps: [
      "Tìm theo tên hoặc email trước khi thêm để không gửi trùng một luồng cảnh báo.",
      "Kiểm tra tên hiển thị, địa chỉ email, Bộ phận và phạm vi nhận; chọn loại nhận phù hợp như Chỉ quá hạn hoặc Chỉ sắp tới hạn.",
      "Dùng Đang bật để tạm ngừng hoặc khôi phục nhận thư, rồi nêu lý do khi biểu mẫu yêu cầu.",
    ],
    fields: [
      "Email: bắt buộc, theo dạng tên@miền.tld, không có khoảng trắng; email sai sẽ bị chặn ngay trong biểu mẫu.",
      "Phạm vi: chọn Tất cả, Theo bộ phận hoặc Theo khu vực. Giá trị phạm vi để trống khi là Tất cả; với Bộ phận phải chọn mã phạm vi để luồng cảnh báo có nơi so khớp.",
      "Ngưỡng (ngày): để trống hoặc nhập số nguyên không âm, ví dụ 7 để báo trước 7 ngày.",
      "Loại cảnh báo: Cả hai, Chỉ quá hạn hoặc Chỉ sắp tới hạn. Lịch báo cáo AI: Không gửi, Hàng tuần hoặc Hàng tháng.",
      "Đang bật: tắt để ngừng gửi cho địa chỉ này; thay đổi trạng thái cần lý do.",
    ],
    caution: "Tắt người nhận chỉ ngừng gửi cho địa chỉ đó; không thay đổi trạng thái quá hạn của hạng mục.",
    readerNote: "Bạn có thể kiểm tra danh sách người nhận trong phạm vi được cấp; chế độ chỉ đọc không thay đổi luồng email.",
    editorNote: "Chỉ Admin và Quản lý QA được thay đổi danh sách hoặc trạng thái nhận cảnh báo.",
  },
  revalidation: {
    title: "Tái thẩm định", summary: "Các kỳ đề xuất được suy từ ngày hoàn thành thực tế và chu kỳ trong Dữ liệu nguồn.",
    steps: [
      "Chọn trạng thái để xem kỳ Chờ quyết định, Đã tạo kỳ mới, Đã bỏ qua hoặc Không còn hiệu lực.",
      "Dùng Đối chiếu nguồn để làm mới đề xuất sau khi ngày hoàn thành thực tế hoặc chu kỳ thay đổi.",
      "Với một kỳ chờ, chọn Xác nhận để tạo kỳ mới hoặc Bỏ qua; cả hai quyết định đều cần lý do tối thiểu 5 ký tự.",
    ],
    fields: ["Hoàn thành gốc", "Chu kỳ", "Kỳ tiếp theo", "Trạng thái", "Lý do quyết định"],
    caution: "Xác nhận tạo một hạng mục kỳ mới; hãy rà ngày hoàn thành gốc và chu kỳ trước khi quyết định.",
    readerNote: "Bạn có thể xem các đề xuất và trạng thái; không thể đối chiếu hoặc quyết định kỳ trong chế độ chỉ đọc.",
    editorNote: "Các nút Đối chiếu nguồn, Xác nhận và Bỏ qua chỉ hiện cho người có quyền quản lý.",
  },
  import: {
    title: "Nhập Excel", summary: "Nhập theo mẫu chính thức, luôn xem trước và xác nhận có lý do trước khi ghi dữ liệu nguồn.",
    steps: [
      "Chọn đúng bộ dữ liệu trước khi tải mẫu: Đối tượng nguồn hoặc Sản phẩm GMP. Chỉ nhập sheet DU_LIEU, bắt đầu từ dòng 2; không đổi tên sheet hoặc tiêu đề cột, không di chuyển tiêu đề cột.",
      "Mẫu Đối tượng nguồn dùng đúng thứ tự: Loại đối tượng, Mã đối tượng, Tên đối tượng, Bộ phận quản lý, Mã khu vực, Dây chuyền, Có thẩm định (y/n), Tần suất (tháng), Tháng đầu tiên, Năm tham chiếu, Nhóm báo cáo, Nhóm công việc, Số ngày công, Điểm phức tạp, Điểm ảnh hưởng chất lượng, Ghi chú, Đang dùng (y/n).",
      "Mẫu Sản phẩm GMP dùng đúng thứ tự: Mã BFO, Tên sản phẩm, Hoạt chất, Hàm lượng, Dạng bào chế, Dây chuyền, Bao bì sơ cấp, Cỡ lô, Bồn pha, Cỡ lô thành phẩm, Ghi chú, Đang dùng (y/n).",
      "Cột y/n chỉ nhận y hoặc n; cột số nhập số; ô trống nghĩa là không có giá trị. Không dùng công thức. Bản xem trước tách tạo mới, cập nhật, không đổi và lỗi trước khi ghi.",
      "Sửa lỗi hoặc bổ sung lý do theo dòng khi được yêu cầu, rồi nhập lý do cho cả đợt và Xác nhận nhập. Khi nguồn đã lưu, dòng chạm timeline xuất hiện ở Chờ áp dụng để xem ảnh hưởng riêng.",
    ],
    caution: "Xem trước chỉ chuẩn bị đợt nhập, chưa sửa Dữ liệu nguồn; xác nhận nhập mới lưu Dữ liệu nguồn. Không có thao tác nhập nào tự áp mốc timeline.",
    readerNote: "Bạn có thể đọc hướng dẫn quy trình, nhưng chế độ chỉ đọc không cho tải tệp hoặc xác nhận nhập.",
    editorNote: "Quyền nhập không thay quyền áp timeline; hãy mở Chờ áp dụng sau khi đợt nhập đã được lưu.",
  },
  pending: {
    title: "Chờ áp dụng", summary: "Hàng đợi tách việc đã lưu ở Dữ liệu nguồn khỏi việc thay đổi mốc timeline.",
    steps: [
      "Một thay đổi ở Có thẩm định, Tần suất, Tháng đầu tiên hoặc Năm tham chiếu đã lưu ở Dữ liệu nguồn có thể xuất hiện tại đây.",
      "Mở Xem ảnh hưởng & áp dụng để xem trước các mốc sẽ đổi, nhập lý do rồi chọn Áp vào timeline. Timeline chỉ thay đổi sau bước xem trước, lý do và áp dụng này.",
      "Nếu dòng ghi không đổi mốc thời gian, nút áp dụng bị vô hiệu vì không có gì để áp. Đây không phải lỗi lưu dữ liệu nguồn.",
      "Mốc đã có tiến độ được bảo vệ: chỉ dùng ghi đè deadline khi đã xác nhận đặc biệt và nêu rõ lý do; nếu có xung đột, tải lại rồi xem lại ảnh hưởng.",
    ],
    caution: "Áp dụng theo toàn bộ số lượng và luật trong bản xem trước, kể cả khi phần danh sách chỉ hiển thị một số dòng đầu; tiến độ thực tế không bị thay bằng thao tác này.",
    readerNote: "Bạn có thể đọc trạng thái và ảnh hưởng đã công bố; chế độ chỉ đọc không cho áp thay đổi vào timeline.",
    editorNote: "Cần quyền sửa Source và sinh timeline để xem hoặc áp các thay đổi đang chờ.",
  },
  history: {
    title: "Lịch sử", summary: "Nhật ký nghiệp vụ của Dữ liệu nguồn để đối chiếu ai đã thêm, sửa hoặc ngừng dùng bản ghi.",
    steps: [
      "Dùng phân trang để xem các dòng lịch sử theo thứ tự máy chủ trả về.",
      "Đọc người thực hiện, thời điểm và lý do kèm theo mỗi dòng để đối chiếu thay đổi với dữ liệu hiện tại.",
      "Lịch sử chỉ để kiểm tra: muốn sửa dữ liệu, quay về đúng khu vực danh mục và thực hiện qua biểu mẫu có kiểm quyền.",
    ],
    fields: ["Bản ghi", "Thao tác", "Người thực hiện", "Thời điểm", "Lý do"],
    caution: "Lịch sử không phải công cụ hoàn tác và không cho sửa trực tiếp bản ghi đã audit.",
    readerNote: "Nếu bạn được mở khu vực này, bạn có thể đối chiếu lịch sử nhưng không thể sửa hay xoá audit.",
    editorNote: "Quyền xem lịch sử được giới hạn theo vai trò; quyền sửa danh mục không tự cấp quyền thay đổi audit.",
  },
};

export function getCatalogHelp(region: string): CatalogHelpGuide {
  return CATALOG_HELP_CONTENT[region as CatalogHelpRegion] ?? CATALOG_HELP_CONTENT.objects;
}

/** Mirror the actual region action guards; help never grants these capabilities. */
export function canChangeCatalogHelpRegion(region: string, rights: {
  manager: boolean; canEdit: boolean; canManageWorkshopScope: boolean; canGenerateTimeline: boolean;
}): boolean {
  if (region === "history") return false;
  if (region === "coverage") return rights.canManageWorkshopScope;
  if (region === "revalidation") return rights.manager;
  if (region === "pending") return rights.manager && rights.canEdit && rights.canGenerateTimeline;
  return rights.manager && rights.canEdit;
}
