import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JamService } from '../../services/jam.service';
import { ListenChoiceComponent } from '../listen-choice/listen-choice.component';
import { I18nService, TPipe } from '../../i18n/i18n.service';

/** Diálogo que aparece al abrir un enlace de invitación (?jam=CÓDIGO). */
@Component({
  selector: 'app-jam-join',
  standalone: true,
  imports: [FormsModule, ListenChoiceComponent, TPipe],
  templateUrl: './jam-join.component.html',
  styleUrl: './jam-join.component.scss',
})
export class JamJoinComponent implements OnInit {
  code = '';
  name = localStorage.getItem('vinyl_jam_name') ?? '';
  /** Lo que eligió la última vez (por defecto: escuchar en la sala). */
  listenHere = false;

  constructor(public jam: JamService, private i18n: I18nService) {}

  get isOpen(): boolean {
    return this.jam.joinDialogOpen();
  }

  ngOnInit(): void {
    const pendingCode = this.jam.pendingJamCode();
    if (pendingCode) this.code = pendingCode;
    this.listenHere = this.jam.listenHere();
  }

  join(): void {
    const c = this.code.trim().toUpperCase();
    if (!c) return;
    this.jam.setListenHere(this.listenHere);
    this.jam.joinSession(c, this.name.trim() || this.i18n.t('rooms.defaultGuest'));
    this.cleanUrl();
  }

  close(): void {
    this.jam.joinDialogOpen.set(false);
    this.jam.pendingJamCode.set('');
    this.cleanUrl();
    // No quiso entrar a la sala del enlace: vuelve a la que estaba (si estaba en una).
    if (!this.jam.isInSession()) this.jam.attemptRejoin();
  }

  private cleanUrl(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete('jam');
    window.history.replaceState({}, '', url.toString());
  }
}
