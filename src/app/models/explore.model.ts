import { Song } from './song.model';

/** Género o estado de ánimo de YouTube Music. `params` es opaco: se reenvía tal cual. */
export interface Category {
  title: string;
  color: string;
  params: string;
}

export interface CategorySection {
  title: string;
  items: Category[];
}

export interface Artist {
  id: string;
  name: string;
  thumb: string;
}

export interface PlaylistRef {
  id: string;
  title: string;
  subtitle: string;
  thumb: string;
}

export interface ExploreHome {
  sections: CategorySection[];
  artists: Artist[];
}

export interface CategoryPage {
  title: string;
  playlists: PlaylistRef[];
  songs: Song[];
}

export interface ArtistPage {
  name: string;
  thumb: string;
  songs: Song[];
  related: Artist[];
}

export interface PlaylistPage {
  title: string;
  songs: Song[];
}
