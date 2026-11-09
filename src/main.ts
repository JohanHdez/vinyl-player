import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { importFromOldDomain } from './app/services/storage-import';

// Antes de arrancar: si se llegó desde el dominio viejo, trae "Mis salas" y lo demás.
importFromOldDomain();

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));

// PWA: el service worker (public/sw.js) hace la app instalable. En localhost no se
// registra, para que el desarrollo no quede atado a archivos guardados.
if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('[pwa] no se pudo registrar', err));
  });
}
