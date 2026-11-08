import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { estaEmFrame, exibirAvisoDeFrame } from './app/core/seguranca/anti-clickjacking';

// RNF-064: dentro de um iframe o app não é inicializado.
if (estaEmFrame(window)) {
  exibirAvisoDeFrame(document, window.location.href);
} else {
  bootstrapApplication(App, appConfig).catch((err) => console.error(err));
}
