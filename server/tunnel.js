const ngrok = require("@ngrok/ngrok");

const PORT = 3001;

async function start() {
  console.log("Iniciando tunnel ngrok...\n");

  try {
    const listener = await ngrok.forward({
      addr: PORT,
      authtoken_from_env: true,
    });

    const url = listener.url();
    console.log(`Tunnel activo: ${url}  -->  localhost:${PORT}`);
    console.log("\n==========================================");
    console.log("  URL para compartir:");
    console.log(`  ${url}`);
    console.log("==========================================");
    console.log("\nAsegurate de que hayas ejecutado:");
    console.log("  1. npm run build  (compilar Angular)");
    console.log("  2. npm run proxy  (servidor Express)");
    console.log("\nPresiona Ctrl+C para detener el tunnel.\n");

    process.on("SIGINT", async () => {
      console.log("\nCerrando tunnel...");
      await ngrok.disconnect();
      process.exit(0);
    });

    // Keep process alive
    process.stdin.resume();
    setInterval(() => {}, 60000);
  } catch (err) {
    console.error("Error al iniciar tunnel:", err.message);

    if (err.message.includes("authtoken")) {
      console.log("\n--- Configuracion requerida ---");
      console.log("1. Crea una cuenta gratuita en https://dashboard.ngrok.com/signup");
      console.log("2. Copia tu authtoken desde https://dashboard.ngrok.com/get-started/your-authtoken");
      console.log("3. Ejecuta:  set NGROK_AUTHTOKEN=tu_token_aqui");
      console.log("4. Vuelve a ejecutar:  npm run tunnel");
    }

    process.exit(1);
  }
}

start();
