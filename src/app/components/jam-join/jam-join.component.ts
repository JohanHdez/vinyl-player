import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JamService } from '../../services/jam.service';

/** Diálogo que aparece al abrir un enlace de invitación (?jam=CÓDIGO). */
@Component({
  selector: 'app-jam-join',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './jam-join.component.html',
  styleUrl: './jam-join.component.scss',
})
export class JamJoinComponent implements OnInit {
  code = '';
  name = localStorage.getItem('vinyl_jam_name') ?? '';

  constructor(public jam: JamService) {}

  get isOpen(): boolean {
    return this.jam.joinDialogOpen();
  }

  ngOnInit(): void {
    const pendingCode = this.jam.pendingJamCode();
    if (pendingCode) this.code = pendingCode;
  }

  join(): void {
    const c = this.code.trim().toUpperCase();
    if (!c) return;
    this.jam.joinSession(c, this.name.trim() || 'Invitado');
    this.cleanUrl();
  }

  close(): void {
    this.jam.joinDialogOpen.set(false);
    this.jam.pendingJamCode.set('');
    this.cleanUrl();
  }

  private cleanUrl(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete('jam');
    window.history.replaceState({}, '', url.toString());
  }
}
