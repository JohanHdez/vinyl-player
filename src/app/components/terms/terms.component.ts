import { Component } from '@angular/core';

/** Términos de uso y privacidad: proyecto personal, sin fines comerciales. */
@Component({
  selector: 'app-terms',
  standalone: true,
  template: `
    <article class="terms">
      <header class="view-header">
        <h1 class="view-title font-display">Términos de uso</h1>
        <p class="view-subtitle">Última actualización: noviembre de 2026</p>
      </header>

      <section>
        <h2>Qué es Vinyl</h2>
        <p>
          Vinyl es un proyecto personal y de portafolio de Johan Hernández, sin fines comerciales. No se vende,
          no tiene publicidad propia y no cobra por su uso. Se ofrece <strong>tal cual</strong>, sin garantías
          de funcionamiento, disponibilidad ni continuidad: puede cambiar, fallar o dejar de estar en línea en
          cualquier momento.
        </p>
      </section>

      <section>
        <h2>La música</h2>
        <p>
          Vinyl no aloja ni distribuye música. Las canciones se reproducen con el reproductor oficial de YouTube
          y pertenecen a sus autores y titulares de derechos. Algunas no se pueden reproducir fuera de YouTube
          por decisión de sus dueños. Al usar Vinyl también aceptas los
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener">Términos de YouTube</a>.
        </p>
        <p>
          Vinyl está pensado para uso personal. Si pones música en un lugar público o en un negocio (un gimnasio,
          un bar, un evento), los permisos y licencias de comunicación pública (en Colombia, por ejemplo, ante la
          OSA – Sayco Acinpro) son responsabilidad de quien la pone, no de Vinyl.
        </p>
      </section>

      <section>
        <h2>Las salas y el chat</h2>
        <p>
          Cada persona es responsable de lo que escribe, comparte y pide en una sala. No publiques datos personales,
          contenido ofensivo, ilegal o que no tengas derecho a compartir. Quien crea una sala es su anfitrión y
          decide qué suena.
        </p>
      </section>

      <section>
        <h2>Privacidad</h2>
        <ul>
          <li>No hay cuentas ni contraseñas. Solo se usa el nombre que escribes para que los demás sepan quién eres.</li>
          <li>Los mensajes y la cola de una sala se guardan en el servidor mientras la sala exista (hasta 30 días sin actividad) y luego se borran.</li>
          <li>Tu nombre, tus salas y tus preferencias se guardan en tu navegador; puedes borrarlos limpiando sus datos.</li>
          <li>Las búsquedas se envían a YouTube para traer resultados. Vinyl no vende ni comparte datos con nadie más.</li>
        </ul>
      </section>

      <section>
        <h2>Responsabilidad</h2>
        <p>
          En la medida que la ley lo permita, Vinyl y su autor no se hacen responsables por el uso que cada persona
          haga de la aplicación, por el contenido de terceros (incluida la música de YouTube) ni por daños derivados
          de fallas o interrupciones del servicio. Si no estás de acuerdo con estos términos, no uses Vinyl.
        </p>
      </section>

      <section>
        <h2>Contacto</h2>
        <p>Si algo de lo que aparece en Vinyl te afecta, escribe a <a href="mailto:jshernandezo97@gmail.com">jshernandezo97&#64;gmail.com</a>.</p>
      </section>
    </article>
  `,
  styles: [`
    :host { display: block; }
    .terms { max-width: 760px; }
    section { margin-top: 26px; }
    h2 { font-family: 'Syne', sans-serif; font-size: 1.05rem; color: var(--text-primary); margin-bottom: 8px; }
    p, li { color: var(--text-secondary); font-size: 0.93rem; line-height: 1.6; }
    p + p { margin-top: 10px; }
    ul { padding-left: 18px; display: grid; gap: 6px; }
    a { color: var(--accent-bright); }
    strong { color: var(--text-primary); }
  `],
})
export class TermsComponent {}
