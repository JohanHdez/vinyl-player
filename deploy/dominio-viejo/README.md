# Dominio viejo → nuevo

La app se mudó de `irontfit-music.up.railway.app` a `johan-hdez-musica.up.railway.app`.
Railway permite un solo dominio propio por servicio, así que el nombre viejo lo ocupa
este servicio aparte (`dominio-viejo`, en el proyecto `alert-acceptance`).

- A las personas les muestra una página que se lleva lo que la app guardó en el dominio
  viejo ("Mis salas" con las llaves de anfitrión, nombre y preferencias) al nuevo, en el
  enlace (`#importar=...`). La app lo importa al arrancar (`src/app/services/storage-import.ts`).
- A los bots de vista previa (WhatsApp, Telegram…) les responde con un 301.
- Conserva la ruta y los parámetros: `/?jam=CODIGO` y `/?cancion=...` siguen funcionando.

Publicar cambios de este servicio (no se despliega con el push):

```bash
railway up deploy/dominio-viejo --path-as-root --service dominio-viejo
```

Cuando ya nadie use la dirección vieja (QR impresos, enlaces compartidos), se puede borrar
el servicio. Mientras exista, cuesta casi nada (un proceso de Node sin dependencias).
