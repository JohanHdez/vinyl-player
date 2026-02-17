import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { JamService } from '../../services/jam.service';

@Component({
  selector: 'app-jam-join',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './jam-join.component.html',
  styleUrl: './jam-join.component.scss',
})
export class JamJoinComponent {
  code = '';
  name = '';

  constructor(public jam: JamService) {}

  get isOpen(): boolean {
    return this.jam.joinDialogOpen();
  }

  ngOnInit(): void {
    // Pre-fill code from URL if available
    const pendingCode = this.jam.pendingJamCode();
    if (pendingCode) {
      this.code = pendingCode;
    }
  }

  join(): void {
    const c = this.code.trim();
    const n = this.name.trim() || 'Invitado';
    if (!c) return;
    this.jam.joinSession(c, n);
  }

  close(): void {
    this.jam.joinDialogOpen.set(false);
    this.jam.pendingJamCode.set('');
    // Clean URL
    const url = new URL(window.location.href);
    url.searchParams.delete('jam');
    window.history.replaceState({}, '', url.toString());
  }
}
