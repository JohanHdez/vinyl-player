import { part } from '../part';

// Textos generales: selector de idioma y mensajes que manda el servidor de salas
// (llegan como clave + datos, y cada persona los lee en su idioma).
export const common = part(
  {
    'lang.label': 'Idioma',
    'lang.es': 'Español',
    'lang.en': 'English',

    // Mensajes del sistema en el chat de la sala (server/jam/sessions.js)
    'srv.room.opened': '{name} abrió «{room}»',
    'srv.host.closed': '{name} cerró la sala por ahora. La música vuelve cuando regrese.',
    'srv.host.disconnected': 'El anfitrión se desconectó. La música vuelve cuando regrese.',
    'srv.host.back': 'El anfitrión volvió 🎶',
    'srv.joined': '{name} se unió a la sala',
    'srv.left': '{name} salió de la sala',
    'srv.song.added': '{name} agregó «{title}» a la cola',
    'srv.kicked': '{by} sacó a {name} de la sala',
    'srv.cohost.on': '{by} hizo co-anfitrión a {name} 🎛️',
    'srv.cohost.off': '{name} ya no es co-anfitrión',
    'srv.transfer': '{from} le pasó el mando a {to} 🎚️',
    // Errores que manda el servidor
    'srv.room.notFound': 'No encontré esa sala. Revisa el código.',
    'srv.vote.missing': 'Esa canción ya no está en la cola. Puedes volver a pedirla.',
    'srv.vote.playing': 'Esa canción ya está sonando 🎶',
    'srv.vote.played': 'Esa canción ya sonó. Puedes volver a pedirla.',
    'srv.chat.tooFast': 'Vas muy rápido. Espera unos segundos.',
    'srv.host.offline': 'El anfitrión no está conectado: la música vuelve cuando regrese.',
  },
  {
    'lang.label': 'Language',
    'lang.es': 'Español',
    'lang.en': 'English',

    'srv.room.opened': '{name} opened “{room}”',
    'srv.host.closed': '{name} closed the room for now. The music comes back when they return.',
    'srv.host.disconnected': 'The host disconnected. The music comes back when they return.',
    'srv.host.back': 'The host is back 🎶',
    'srv.joined': '{name} joined the room',
    'srv.left': '{name} left the room',
    'srv.song.added': '{name} added “{title}” to the queue',
    'srv.kicked': '{by} removed {name} from the room',
    'srv.cohost.on': '{by} made {name} a co-host 🎛️',
    'srv.cohost.off': '{name} is no longer a co-host',
    'srv.transfer': '{from} handed control to {to} 🎚️',
    'srv.room.notFound': "I couldn't find that room. Check the code.",
    'srv.vote.missing': 'That song is no longer in the queue. You can request it again.',
    'srv.vote.playing': 'That song is already playing 🎶',
    'srv.vote.played': 'That song already played. You can request it again.',
    'srv.chat.tooFast': "You're going too fast. Wait a few seconds.",
    'srv.host.offline': "The host isn't connected: the music comes back when they return.",
  },
);
