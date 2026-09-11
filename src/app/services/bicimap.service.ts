import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { BiciReport, PointOfInterest, BiciEvent, BiciRoute, UserStats, ReportType } from '../models/bicimap.model';

@Injectable({
  providedIn: 'root'
})
export class BicimapService {
  private readonly REPORTS_KEY = 'bicimap_reports';
  private readonly STATS_KEY = 'bicimap_user_stats';
  private readonly SAVED_ROUTES_KEY = 'bicimap_saved_routes';

  // Datos semilla de prueba iniciales para reportes
  private defaultReports: BiciReport[] = [
    {
      id: 'rep_1',
      type: 'obra',
      title: 'Reparación de alcantarillado',
      description: 'Cierre de 50 metros en la cicloruta por obras de acueducto.',
      lat: 4.6097,
      lng: -74.0817,
      address: 'Carrera 7 con Calle 32',
      createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      status: 'activo',
      userName: 'Carlos Ruiz'
    },
    {
      id: 'rep_2',
      type: 'peligro',
      title: 'Hueco peligroso sin señalizar',
      description: 'Hueco profundo en el carril bici antes del semáforo. Precaución con llantas delgadas.',
      lat: 4.6150,
      lng: -74.0750,
      address: 'Calle 26 con Carrera 19',
      createdAt: new Date(Date.now() - 3600000 * 8).toISOString(),
      status: 'activo',
      userName: 'Laura Gómez'
    },
    {
      id: 'rep_3',
      type: 'cicloruta',
      title: 'Vidrios y basura en la vía',
      description: 'Botellas rotas esparcidas en la curva del puente peatonal.',
      lat: 4.6030,
      lng: -74.0680,
      address: 'Av. Circunvalar con Calle 19',
      createdAt: new Date(Date.now() - 3600000 * 20).toISOString(),
      status: 'activo',
      userName: 'Mateo Ciclismo'
    },
    {
      id: 'rep_4',
      type: 'congestion',
      title: 'Motos invadiendo la cicloruta',
      description: 'Alto flujo de motocicletas usando el carril exclusivo en hora pico.',
      lat: 4.6220,
      lng: -74.0850,
      address: 'Carrera 10 con Calle 24',
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      status: 'activo',
      userName: 'Andrea Bici'
    }
  ];

  // Puntos de interés para ciclistas
  private pois: PointOfInterest[] = [
    {
      id: 'poi_1',
      name: 'Estación de Bicis Públicas Plaza Central',
      category: 'estacion',
      description: 'Punto de retiro y devolución de bicicletas compartidas.',
      lat: 4.6090,
      lng: -74.0780,
      address: 'Plaza de Bolívar / Cra 7',
      schedule: '06:00 AM - 10:00 PM'
    },
    {
      id: 'poi_2',
      name: 'Taller Comunitario CicloReparaciones',
      category: 'taller',
      description: 'Mecánica rápida, parches, inflado gratuito y repuestos.',
      lat: 4.6180,
      lng: -74.0720,
      address: 'Calle 34 # 13-25',
      schedule: '08:00 AM - 07:00 PM',
      phone: '310 987 6543'
    },
    {
      id: 'poi_3',
      name: 'Bici-Parqueadero Vigilado Estación Central',
      category: 'parqueadero',
      description: 'Capacidad para 80 bicicletas, cámaras de seguridad y candado obligatorio.',
      lat: 4.6050,
      lng: -74.0840,
      address: 'Av. Caracas con Calle 13',
      schedule: '24 Horas'
    },
    {
      id: 'poi_4',
      name: 'Punto de Hidratación y Descanso Parque Nacional',
      category: 'descanso',
      description: 'Bancas con sombra, fuente de agua potable y zona de estiramiento.',
      lat: 4.6240,
      lng: -74.0620,
      address: 'Parque Nacional, zona verde',
      schedule: 'Acceso libre'
    }
  ];

  // Eventos de ciclismo
  private events: BiciEvent[] = [
    {
      id: 'evt_1',
      title: 'Ciclopaseo Nocturno Comunitario',
      date: '2026-09-18',
      time: '07:30 PM',
      location: 'Parque Central - Punto de encuentro fuente',
      lat: 4.6097,
      lng: -74.0817,
      description: 'Recorrido recreativo urbano de 12 km a ritmo suave. Llevar luces delantera/trasera y casco obligatorio.',
      organizer: 'Colectivo Rueda Libre',
      distanceKm: 12,
      difficulty: 'Principiante'
    },
    {
      id: 'evt_2',
      title: 'Gran Fondo Dominical de Ciclovía',
      date: '2026-09-20',
      time: '07:00 AM',
      location: 'Monumento Los Héroes',
      lat: 4.6650,
      lng: -74.0600,
      description: 'Circuito por los principales corredores viales habilitados para ciclistas.',
      organizer: 'BiciMap Comunidad',
      distanceKm: 28,
      difficulty: 'Intermedio'
    },
    {
      id: 'evt_3',
      title: 'Taller de Mecánica Básica y Despinche',
      date: '2026-09-26',
      time: '10:00 AM',
      location: 'Taller Comunitario CicloReparaciones',
      lat: 4.6180,
      lng: -74.0720,
      description: 'Aprende a cambiar una llanta, parchar tu neumático y calibrar tus frenos.',
      organizer: 'Taller Veloz',
      difficulty: 'Principiante'
    }
  ];

  constructor(private http: HttpClient) {
    this.initReportsStorage();
  }

  private initReportsStorage(): void {
    const stored = localStorage.getItem(this.REPORTS_KEY);
    if (!stored) {
      localStorage.setItem(this.REPORTS_KEY, JSON.stringify(this.defaultReports));
    }
  }

  // --- REPORTES ---
  public getReports(): Observable<BiciReport[]> {
    const raw = localStorage.getItem(this.REPORTS_KEY);
    try {
      const reports: BiciReport[] = raw ? JSON.parse(raw) : this.defaultReports;
      return of(reports);
    } catch {
      return of(this.defaultReports);
    }
  }

  public addReport(report: Omit<BiciReport, 'id' | 'createdAt' | 'status'>): Observable<BiciReport> {
    const raw = localStorage.getItem(this.REPORTS_KEY);
    const reports: BiciReport[] = raw ? JSON.parse(raw) : [];

    const newReport: BiciReport = {
      ...report,
      id: 'rep_' + Date.now(),
      createdAt: new Date().toISOString(),
      status: 'activo'
    };

    reports.unshift(newReport);
    localStorage.setItem(this.REPORTS_KEY, JSON.stringify(reports));

    // Incrementar contador de reportes del usuario
    this.incrementReportStat();

    return of(newReport);
  }

  // --- PUNTOS DE INTERÉS ---
  public getPois(): Observable<PointOfInterest[]> {
    return of(this.pois);
  }

  // --- EVENTOS ---
  public getEvents(): Observable<BiciEvent[]> {
    return of(this.events);
  }

  // --- RUTAS Y OSRM (Servicio Gratuito de Rutas en Bicicleta) ---
  public calculateRoute(
    origin: [number, number],
    dest: [number, number],
    originLabel: string = 'Mi ubicación',
    destLabel: string = 'Destino'
  ): Observable<BiciRoute> {
    const [origLat, origLng] = origin;
    const [destLat, destLng] = dest;

    // OSRM público: coordenadas formato lng,lat
    const osrmUrl = `https://router.project-osrm.org/route/v1/bike/${origLng},${origLat};${destLng},${destLat}?overview=full&geometries=geojson`;

    return this.http.get<any>(osrmUrl).pipe(
      map(res => {
        if (res && res.routes && res.routes.length > 0) {
          const routeData = res.routes[0];
          // Distancia en km
          const distanceKm = Math.round((routeData.distance / 1000) * 10) / 10;
          // Duración en minutos (estimada para bicicleta)
          const durationMin = Math.round(routeData.duration / 60);

          // GeoJSON devuelve coordenadas en [lng, lat], Leaflet espera [lat, lng]
          const coordinates: [number, number][] = routeData.geometry.coordinates.map(
            (c: [number, number]) => [c[1], c[0]]
          );

          const biciRoute: BiciRoute = {
            originName: originLabel,
            originCoords: origin,
            destinationName: destLabel,
            destinationCoords: dest,
            distanceKm,
            durationMin,
            coordinates,
            createdAt: new Date().toISOString()
          };

          return biciRoute;
        } else {
          return this.fallbackRouteCalculation(origin, dest, originLabel, destLabel);
        }
      }),
      catchError(() => {
        // En caso de que no haya conexión a internet o falle el servidor de OSRM,
        // la aplicación no se rompe: genera una estimación directa (Línea directa calculada)
        return of(this.fallbackRouteCalculation(origin, dest, originLabel, destLabel));
      })
    );
  }

  /**
   * Cálculo de contingencia cuando OSRM no está disponible (Fórmula de Haversine)
   */
  private fallbackRouteCalculation(
    origin: [number, number],
    dest: [number, number],
    originLabel: string,
    destLabel: string
  ): BiciRoute {
    const [lat1, lon1] = origin;
    const [lat2, lon2] = dest;
    const R = 6371; // Radio terrestre en km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const directKm = R * c;
    const distanceKm = Math.round((directKm * 1.25) * 10) / 10; // Factor 1.25 por calles
    const durationMin = Math.max(1, Math.round((distanceKm / 15) * 60)); // 15 km/h velocidad promedio ciclista

    return {
      originName: originLabel,
      originCoords: origin,
      destinationName: destLabel,
      destinationCoords: dest,
      distanceKm,
      durationMin,
      coordinates: [origin, dest],
      createdAt: new Date().toISOString()
    };
  }

  // --- ESTADÍSTICAS DEL USUARIO ---
  public getUserStats(userId: string = 'demo'): Observable<UserStats> {
    const raw = localStorage.getItem(this.STATS_KEY);
    if (raw) {
      try {
        return of(JSON.parse(raw));
      } catch {
        // continuar
      }
    }
    const initialStats: UserStats = {
      userId,
      ridesCount: 5,
      totalKm: 42.8,
      reportsCount: 3
    };
    localStorage.setItem(this.STATS_KEY, JSON.stringify(initialStats));
    return of(initialStats);
  }

  public recordCompletedRide(km: number): void {
    const raw = localStorage.getItem(this.STATS_KEY);
    const stats: UserStats = raw ? JSON.parse(raw) : { userId: 'demo', ridesCount: 0, totalKm: 0, reportsCount: 0 };
    stats.ridesCount += 1;
    stats.totalKm = Math.round((stats.totalKm + km) * 10) / 10;
    localStorage.setItem(this.STATS_KEY, JSON.stringify(stats));
  }

  private incrementReportStat(): void {
    const raw = localStorage.getItem(this.STATS_KEY);
    if (raw) {
      try {
        const stats: UserStats = JSON.parse(raw);
        stats.reportsCount += 1;
        localStorage.setItem(this.STATS_KEY, JSON.stringify(stats));
      } catch {
        // ignore
      }
    }
  }

  // --- GEOCODIFICACIÓN (Búsqueda de direcciones y lugares con Nominatim OpenStreetMap) ---
  public geocodeAddress(query: string, userCoords?: [number, number]): Observable<{ name: string; lat: number; lng: number; address: string }[]> {
    const trimmed = query.trim();
    if (!trimmed) return of([]);

    // Buscar primero en diccionario local y POIs existentes
    const localMatches = this.findLocalMatches(trimmed);

    // Preparar URL de Nominatim (OpenStreetMap)
    let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&limit=5&addressdetails=1`;
    
    // Si tenemos coordenadas del usuario, sesgamos la búsqueda a su región
    if (userCoords) {
      const [lat, lng] = userCoords;
      const viewbox = `${lng - 0.4},${lat + 0.4},${lng + 0.4},${lat - 0.4}`;
      url += `&viewbox=${viewbox}&bounded=0`;
    }

    return this.http.get<any[]>(url, {
      headers: { 'Accept-Language': 'es' }
    }).pipe(
      map(results => {
        if (results && results.length > 0) {
          const parsed = results.map(r => ({
            name: r.name || r.display_name.split(',')[0],
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon),
            address: r.display_name
          }));
          
          // Combinar resultados locales y remotos evitando duplicados por nombre
          const combined = [...localMatches];
          for (const item of parsed) {
            if (!combined.some(c => c.name.toLowerCase() === item.name.toLowerCase())) {
              combined.push(item);
            }
          }
          return combined;
        }
        return localMatches;
      }),
      catchError(() => of(localMatches))
    );
  }

  private findLocalMatches(query: string): { name: string; lat: number; lng: number; address: string }[] {
    const q = query.toLowerCase();
    const results: { name: string; lat: number; lng: number; address: string }[] = [];

    // Lugares emblemáticos y barrios conocidos para ciclistas
    const knownPlaces = [
      { name: 'Venecia', lat: 4.5862, lng: -74.1389, address: 'Barrio Venecia, Tunjuelito, Bogotá' },
      { name: 'Plaza de Bolívar', lat: 4.6097, lng: -74.0817, address: 'Centro Histórico, Carrera 7 con Calle 11' },
      { name: 'Parque Simón Bolívar', lat: 4.6583, lng: -74.0939, address: 'Av. Calle 63 con Av. 68, Bogotá' },
      { name: 'Parque Nacional', lat: 4.6240, lng: -74.0620, address: 'Carrera 7 con Calle 39, Bogotá' },
      { name: 'Chapinero', lat: 4.6486, lng: -74.0617, address: 'Localidad Chapinero, Bogotá' },
      { name: 'Usaquén', lat: 4.6953, lng: -74.0305, address: 'Plaza de Usaquén, Bogotá' },
      { name: 'Suba Centro', lat: 4.7431, lng: -74.0858, address: 'Plaza Fundacional de Suba, Bogotá' },
      { name: 'Salitre Mágico', lat: 4.6660, lng: -74.0890, address: 'Calle 63 # 60-80, Bogotá' },
      { name: 'Portal 80', lat: 4.7099, lng: -74.1102, address: 'Calle 80 con Transversal 100, Bogotá' },
      { name: 'Portal Norte', lat: 4.7554, lng: -74.0457, address: 'Autopista Norte con Calle 170, Bogotá' },
      { name: 'Monumento Los Héroes', lat: 4.6650, lng: -74.0600, address: 'Autopista Norte con Calle 80' },
      { name: 'Bosa Centro', lat: 4.6220, lng: -74.1870, address: 'Plaza de Bosa, Bogotá' },
      { name: 'Kennedy Central', lat: 4.6280, lng: -74.1530, address: 'Parque Timiza, Kennedy, Bogotá' }
    ];

    for (const p of knownPlaces) {
      if (p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q)) {
        results.push(p);
      }
    }

    for (const poi of this.pois) {
      if (poi.name.toLowerCase().includes(q) || poi.description.toLowerCase().includes(q)) {
        results.push({
          name: poi.name,
          lat: poi.lat,
          lng: poi.lng,
          address: poi.address || poi.description
        });
      }
    }

    return results;
  }
}

