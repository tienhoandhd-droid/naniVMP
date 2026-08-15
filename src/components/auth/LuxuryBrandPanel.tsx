export default function LuxuryBrandPanel() {
  return (
    <section className="vq-brand-panel" aria-label="V/Q Team"
      /* Panel này CỐ Ý giữ nền sơn mài đậm ở cả hai chế độ: nó là mảng màu
         nhận diện thương hiệu, không phải bề mặt để đọc dữ liệu. Khai báo
         để bộ kiểm thẩm mỹ (luật B6) biết đây là chủ ý. */
      data-lp-surface="fixed">
      {/* Logo CPC1 HN đã chuyển sang panel form.
          Lý do đo được: 75% điểm ảnh của logo là đỏ, 15% là navy, độ sáng
          trung bình chỉ 74/255 — tức nó là một hình TỐI. Đặt lên nền sơn
          mài (độ sáng ~30–60) thì chìm, nên bản cũ phải dán một miếng nền
          trắng phía sau. Miếng trắng đó chính là chỗ trông lệch tông.
          Đưa logo sang nền sứ sáng là nó hiện đúng màu thật, không cần
          khung — giống hệt cách nó nằm trên giấy tiêu đề. */}
      <svg data-testid="luxury-crown-mark" className="vq-crown-mark" viewBox="0 0 240 150" aria-hidden="true">
        <path d="M28 104 48 44l46 42 28-66 30 66 42-42 18 60" />
        <path d="M28 104h184M48 122h144" />
      </svg>
      <div className="vq-brand-content">
        <div className="vq-brand-hairline" />
        <div className="vq-brand-wordmark"><span>V/Q</span><strong>TEAM</strong></div>
        <div className="vq-brand-caption">VALIDATION &amp; QUALIFICATION</div>
      </div>
      <div className="vq-brand-department">Phòng Quản lý Chất lượng</div>
    </section>
  );
}
