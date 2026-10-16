// Draws one invitation card (1200 x 1500) on a canvas: blank template + name + venue + QR.
// Browser only.
import QRCode from 'qrcode';

export const CARD_W = 1200;
export const CARD_H = 1500;
const FONT = 'Inter, "Helvetica Neue", Arial, sans-serif';

let templatePromise = null;
function loadTemplate() {
  if (!templatePromise) {
    templatePromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => { templatePromise = null; reject(new Error('Card background failed to load')); };
      img.src = '/card-template.png';
    });
  }
  return templatePromise;
}

export async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load(`700 84px ${FONT}`),
      document.fonts.load(`400 41px ${FONT}`),
    ]);
  } catch { /* fall back to system font */ }
}

export function passUrl(origin, id) {
  return `${origin.replace(/\/$/, '')}/c/${id}`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function drawCard(canvas, { name, venue, url }) {
  const [img] = await Promise.all([loadTemplate(), fontsReady()]);
  canvas.width = CARD_W; canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, CARD_W, CARD_H);

  // Guest name: left aligned like the original design, shrinks to fit beside the QR.
  // Text stops at x 770, leaving a 100 px gap before the QR tile at x 870.
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'alphabetic';
  const maxW = 670;
  let size = 84;
  ctx.font = `700 ${size}px ${FONT}`;
  while (ctx.measureText(name).width > maxW && size > 48) {
    size -= 2;
    ctx.font = `700 ${size}px ${FONT}`;
  }
  ctx.fillText(name, 100, 1252, maxW);

  // Venue: same for every card.
  if (venue) {
    ctx.font = `400 41px ${FONT}`;
    ctx.fillText(venue, 100, 1364, maxW);
  }

  // QR: white tile, bottom right.
  const box = 230, bx = 870, by = 1140, pad = 14;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, bx, by, box, box, 20);
  ctx.fill();
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const cell = (box - pad * 2) / n;
  ctx.fillStyle = '#000000';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) {
        const x = bx + pad + c * cell, y = by + pad + r * cell;
        ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(cell + 0.5), Math.ceil(cell + 0.5));
      }
    }
  }
}

export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export function fileNameFor(name) {
  return 'hello18-' + (name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'guest') + '.png';
}
