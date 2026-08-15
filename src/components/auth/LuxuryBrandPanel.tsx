export default function LuxuryBrandPanel() {
  return (
    <section className="vq-brand-panel" aria-label="V/Q Team"
      /* Panel này CỐ Ý giữ nền sơn mài đậm ở cả hai chế độ: nó là mảng màu
         nhận diện thương hiệu, không phải bề mặt để đọc dữ liệu. Khai báo
         để bộ kiểm thẩm mỹ (luật B6) biết đây là chủ ý. */
      data-lp-surface="fixed">
      <div className="vq-brand-logo-wrap">
        <img className="vq-brand-logo" src="./logo-cpc1hn.png" alt="CPC1 HN" />
      </div>
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
