const { createCanvas } = require("@napi-rs/canvas");

// Renders the promotion progress bar as a PNG buffer — pure shapes, no text,
// so it needs no system fonts (safe on a minimal Railway container). The
// percentage and rank labels are carried by the embed's text, not drawn here.
//
// Look mirrors the mockup: a dark rounded track with a Bavarian blue → light
// blue gradient fill.
function renderPromotionBar(percent) {
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));

  // 2× internal resolution for crisp edges when Discord scales it down.
  const scale = 2;
  const W = 760, H = 34, PAD = 3, R = 12;
  const canvas = createCanvas(W * scale, H * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  const roundRect = (x, y, w, h, r) => {
    const rr = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  };

  // Track (dark, near-black)
  roundRect(0, 0, W, H, R);
  ctx.fillStyle = "#1e1f22";
  ctx.fill();

  // Fill
  const innerW = W - PAD * 2;
  const fillW = Math.round((innerW * pct) / 100);
  if (fillW > 0) {
    roundRect(PAD, PAD, Math.max(fillW, R + PAD), H - PAD * 2, R - 3);
    const grad = ctx.createLinearGradient(PAD, 0, PAD + innerW, 0);
    grad.addColorStop(0, "#1E5AA8");
    grad.addColorStop(0.78, "#5b9fd8");
    grad.addColorStop(1, "#8fc0ec");
    ctx.fillStyle = grad;
    ctx.fill();
  }

  return canvas.toBuffer("image/png");
}

module.exports = { renderPromotionBar };
