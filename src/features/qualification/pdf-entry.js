// Gói in PDF build riêng thành cloud-pdf.js (scripts/build-qualification.mjs).
// pdf-lib + fontkit nặng ~1,3 MB nên KHÔNG nằm trong cloud.js; backend.js chỉ
// tải gói này khi người dùng bấm in.
import { renderPdf } from './pdf.js';
import { renderGasPdf } from './gas-pdf.js';

window.CPC1Pdf = { renderPdf, renderGasPdf };
