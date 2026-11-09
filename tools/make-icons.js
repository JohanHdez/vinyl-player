// Genera los íconos PNG de la PWA a partir de public/icons/icon.svg.
// Uso: node tools/make-icons.js <ruta a un node_modules con sharp>
// (sharp no es dependencia del proyecto: solo hace falta para regenerar los íconos;
//  por ejemplo, el de portafolio-web: node tools/make-icons.js ../portafolio-web/node_modules)
const path = require("path");
const sharp = require(path.resolve(process.argv[2] || "node_modules", "sharp"));

const dir = path.join(__dirname, "..", "public", "icons");
const svg = path.join(dir, "icon.svg");
const BG = "#0e0b09";

(async () => {
  for (const size of [192, 512]) {
    await sharp(svg).resize(size, size).png().toFile(path.join(dir, `icon-${size}.png`));
  }
  // Maskable: Android recorta el ícono en círculo o en otras formas; el disco va al 80 %
  // del lienzo (zona segura) sobre el mismo fondo.
  const inner = await sharp(svg).resize(410, 410).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: BG } })
    .composite([{ input: inner, gravity: "center" }]).png().toFile(path.join(dir, "icon-maskable-512.png"));
  // iPhone: 180 px, sin transparencia.
  await sharp(svg).resize(180, 180).flatten({ background: BG }).png().toFile(path.join(dir, "apple-touch-icon.png"));
  console.log("íconos listos en", dir);
})();
