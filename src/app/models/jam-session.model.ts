export interface JamSession {
  sessionId: string;
  code: string;
  hostId: string;
  participants: JamParticipant[];
}

export interface JamParticipant {
  id: string;
  name: string;
  isHost: boolean;
  disconnectedAt?: number;
  oldSocketId?: string;
}

export interface JamEvent {
  type: 'add-song' | 'remove-song' | 'play-song' | 'sync-state';
  payload: any;
  senderId: string;
}
