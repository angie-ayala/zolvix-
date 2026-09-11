export type ReportType = 'obra' | 'peligro' | 'cicloruta' | 'congestion' | 'otro';
export type ReportStatus = 'activo' | 'en_verificacion' | 'resuelto';

export interface BiciReport {
  id: string;
  type: ReportType;
  title: string;
  description: string;
  lat: number;
  lng: number;
  address?: string;
  createdAt: string;
  status: ReportStatus;
  userEmail?: string;
  userName?: string;
}

export type PoiCategory = 'estacion' | 'taller' | 'parqueadero' | 'descanso' | 'punto_clave';

export interface PointOfInterest {
  id: string;
  name: string;
  category: PoiCategory;
  description: string;
  lat: number;
  lng: number;
  address?: string;
  schedule?: string;
  phone?: string;
}

export interface BiciEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  lat: number;
  lng: number;
  description: string;
  organizer: string;
  distanceKm?: number;
  difficulty: 'Principiante' | 'Intermedio' | 'Avanzado';
}

export interface BiciRoute {
  id?: string;
  name?: string;
  originName: string;
  originCoords: [number, number]; // [lat, lng]
  destinationName: string;
  destinationCoords: [number, number]; // [lat, lng]
  distanceKm: number;
  durationMin: number;
  coordinates: [number, number][]; // Lista de puntos lat, lng para trazar la línea
  createdAt: string;
}

export interface UserStats {
  userId: string;
  ridesCount: number;
  totalKm: number;
  reportsCount: number;
}
