"use strict";

// Ocupa el dominio viejo (irontfit-music.up.railway.app) y manda a todos al nuevo.
// Es un servicio aparte en Railway: se despliega con `railway up deploy/dominio-viejo
// --service dominio-viejo` (ver README.md de esta carpeta). Sin dependencias.
//
// - Personas: una página que lee lo que la app guardó en ESTE dominio (Mis salas con
//   las llaves de anfitrión, nombre, preferencias) y lo lleva al nuevo en el enlace
//   (#importar=..., después del "#": no viaja a ningún servidor). Allá se importa.
// - Bots de vista previa (WhatsApp, Telegram...): redirección 301 normal, para que
//   los enlaces viejos sigan mostrando su tarjeta.

const http = require("http");

const NEW_ORIGIN = (process.env.NEW_ORIGIN || "https://johan-hdez-musica.up.railway.app").replace(/\/+$/, "");
const PORT = Number(process.env.PORT) || 8080;
const BOTS = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|twitter|linkedin|skype|embedly/i;

const page = (target) => `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Vinyl Player se mudó</title>
<noscript><meta http-equiv="refresh" content="0; url=${target}"></noscript>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0e0b09; color: #EDE4D6;
         font: 16px/1.5 system-ui, sans-serif; text-align: center; padding: 16px; }
  a { color: #E6B86A; }
</style>
</head>
<body>
<p>Vinyl Player tiene nueva dirección.<br>Te llevamos con tus salas… <a id="go" href="${target}">continuar</a></p>
<script>
(function () {
  var target = ${JSON.stringify(target)};
  try {
    var data = {}, n = 0;
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (/^vinyl[._]/.test(k)) { data[k] = localStorage.getItem(k); n++; }
    }
    if (n) {
      var bytes = new TextEncoder().encode(JSON.stringify(data)), bin = "";
      for (var j = 0; j < bytes.length; j++) bin += String.fromCharCode(bytes[j]);
      target += "#importar=" + encodeURIComponent(btoa(bin));
    }
  } catch (e) { /* sin almacenamiento: se va sin datos */ }
  document.getElementById("go").href = target;
  location.replace(target);
})();
</script>
</body>
</html>`;

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end('{"ok":true,"redirect":true}');
    }
    const target = NEW_ORIGIN + url.pathname + url.search;
    if (BOTS.test(req.headers["user-agent"] || "")) {
      res.writeHead(301, { Location: target });
      return res.end();
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(page(target));
  })
  .listen(PORT, () => console.log(`[dominio-viejo] redirigiendo a ${NEW_ORIGIN} (puerto ${PORT})`));
