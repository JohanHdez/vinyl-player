import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { importFromOldDomain } from './app/services/storage-import';

// Antes de arrancar: si se llegó desde el dominio viejo, trae "Mis salas" y lo demás.
importFromOldDomain();

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
