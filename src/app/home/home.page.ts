import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, ToastController, LoadingController } from '@ionic/angular';
import * as L from 'leaflet';
import { Observable } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { BicimapService } from '../services/bicimap.service';
import { User } from '../models/user.model';
import {
  BiciReport,
  PointOfInterest,
  BiciEvent,
  BiciRoute,
  UserStats,
  ReportType,
  PoiCategory
} from '../models/bicimap.model';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit, AfterViewInit, OnDestroy {
  // Pestaña o vista activa en la app
  activeTab: 'map' | 'routes' | 'reports' | 'places' | 'events' | 'profile' = 'map';

  currentUser$!: Observable<User | null>;
  currentUser: User | null = null;
  userStats: UserStats = { userId: 'demo', ridesCount: 0, totalKm: 0, reportsCount: 0 };
  protected readonly Math = Math;

  // --- MAPA LEAFLET ---
  private map: L.Map | null = null;
  private userMarker: L.Marker | null = null;
  private reportsLayer: L.LayerGroup = L.layerGroup();
  private poisLayer: L.LayerGroup = L.layerGroup();
  private routeLayer: L.Polyline | null = null;
  private destMarker: L.Marker | null = null;

  // Ubicación por defecto (coordenadas de prueba en caso de denegar GPS)
  userCoords: [number, number] = [4.6097, -74.0817];
  hasGpsPermission: boolean = false;
  isGpsLoading: boolean = false;
  private watchId: number | null = null;

  // --- RUTAS CICLISTAS ---
  originLabel: string = 'Mi ubicación actual';
  destinationLabel: string = '';
  destinationCoords: [number, number] | null = null;
  currentRoute: BiciRoute | null = null;
  isCalculatingRoute: boolean = false;
  isRiding: boolean = false;
  rideTimer: any = null;
  rideSeconds: number = 0;

  // Estado de búsqueda y geocodificación de destino
  isSearchingDestination: boolean = false;
  destinationSuggestions: { name: string; lat: number; lng: number; address: string }[] = [];
  showSuggestions: boolean = false;
  private searchDebounceTimer: any = null;
  private lastGeocodedLabel: string = '';

  // Modo de selección en el mapa
  mapSelectionMode: 'destination' | 'report_location' | null = null;

  // --- REPORTES ---
  reports: BiciReport[] = [];
  filteredReports: BiciReport[] = [];
  reportFilter: string = 'todos';
  showReportModal: boolean = false;

  newReport: {
    title: string;
    type: ReportType;
    description: string;
    address: string;
    lat: number;
    lng: number;
  } = {
    title: '',
    type: 'obra',
    description: '',
    address: '',
    lat: 4.6097,
    lng: -74.0817
  };

  // --- PUNTOS DE INTERÉS ---
  pois: PointOfInterest[] = [];
  filteredPois: PointOfInterest[] = [];
  poiFilter: string = 'todos';

  // --- EVENTOS ---
  events: BiciEvent[] = [];

  constructor(
    private authService: AuthService,
    private bicimapService: BicimapService,
    private router: Router,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController
  ) {}

  ngOnInit() {
    this.currentUser$ = this.authService.currentUser$;
    this.currentUser = this.authService.getCurrentUser();
    this.loadAppData();
  }

  ngAfterViewInit() {
    // Inicializar el mapa tras renderizar el DOM
    setTimeout(() => {
      this.initLeafletMap();
      this.requestUserLocation(true);
    }, 300);
  }

  ngOnDestroy() {
    if (this.watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    if (this.rideTimer) {
      clearInterval(this.rideTimer);
    }
  }

  /**
   * Carga los datos de reportes, puntos de interés, eventos y estadísticas
   */
  loadAppData() {
    this.bicimapService.getReports().subscribe(reps => {
      this.reports = reps;
      this.filterReports();
      this.renderReportMarkers();
    });

    this.bicimapService.getPois().subscribe(pois => {
      this.pois = pois;
      this.filterPois();
      this.renderPoiMarkers();
    });

    this.bicimapService.getEvents().subscribe(evts => {
      this.events = evts;
    });

    this.bicimapService.getUserStats().subscribe(stats => {
      this.userStats = stats;
    });
  }

  // =========================================================================
  // 1. INICIALIZACIÓN Y GESTIÓN DEL MAPA LEAFLET
  // =========================================================================

  private initLeafletMap() {
    const mapElement = document.getElementById('biciMapContainer');
    if (!mapElement || this.map) return;

    // Crear mapa Leaflet centrado en ubicación inicial
    this.map = L.map('biciMapContainer', {
      center: this.userCoords,
      zoom: 14,
      zoomControl: false // Los controles los colocaremos estéticamente
    });

    // Añadir controles de zoom en la esquina superior derecha
    L.control.zoom({ position: 'topright' }).addTo(this.map);

    // Capa base de OpenStreetMap gratuita y sin restricciones
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);

    // Añadir capas de marcadores
    this.reportsLayer.addTo(this.map);
    this.poisLayer.addTo(this.map);

    // Evento de clic sobre el mapa para seleccionar puntos
    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.handleMapClick(e);
    });
  }

  /**
   * Refresca el tamaño del contenedor del mapa al cambiar de pestaña
   */
  setTab(tab: 'map' | 'routes' | 'reports' | 'places' | 'events' | 'profile') {
    this.activeTab = tab;
    if (tab === 'map') {
      setTimeout(() => {
        if (this.map) {
          this.map.invalidateSize();
        }
      }, 200);
    }
  }

  // =========================================================================
  // 2. GEOLOCALIZACIÓN Y GPS
  // =========================================================================

  /**
   * Solicita permisos de geolocalización al navegador / celular
   */
  requestUserLocation(autoCenter: boolean = false) {
    if (!navigator.geolocation) {
      this.showToast('La geolocalización no es compatible con este navegador.', 'warning');
      this.updateUserMarker();
      return;
    }

    this.isGpsLoading = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.isGpsLoading = false;
        this.hasGpsPermission = true;
        this.userCoords = [position.coords.latitude, position.coords.longitude];

        this.updateUserMarker();

        if (autoCenter && this.map) {
          this.map.setView(this.userCoords, 15);
        }

        this.showToast('📍 Ubicación GPS obtenida correctamente.', 'success');

        // Mantener seguimiento de ubicación activa
        this.startWatchingLocation();
      },
      (error) => {
        this.isGpsLoading = false;
        this.hasGpsPermission = false;
        console.warn('Permiso de GPS no concedido o error:', error.message);
        this.updateUserMarker();
        this.showToast('Usando ubicación de referencia. Activa el GPS para mayor precisión.', 'medium');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  }

  /**
   * Observa los cambios continuos de posición cuando el usuario se desplaza
   */
  private startWatchingLocation() {
    if (this.watchId !== null) return;

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.userCoords = [pos.coords.latitude, pos.coords.longitude];
        if (this.userMarker) {
          this.userMarker.setLatLng(this.userCoords);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  }

  /**
   * Centra la vista del mapa en la ubicación actual del usuario
   */
  centerOnUser() {
    if (this.map) {
      this.map.flyTo(this.userCoords, 16, { duration: 1 });
      this.showToast('Centrado en tu ubicación', 'primary');
    }
  }

  /**
   * Dibuja o actualiza el marcador pulsante del ciclista en el mapa
   */
  private updateUserMarker() {
    if (!this.map) return;

    const userIcon = L.divIcon({
      className: 'bici-marker-icon pin-user',
      html: '🚲',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -20]
    });

    if (this.userMarker) {
      this.userMarker.setLatLng(this.userCoords);
    } else {
      this.userMarker = L.marker(this.userCoords, { icon: userIcon })
        .addTo(this.map)
        .bindPopup('<b>🚴 ¡Estás aquí!</b><br>Tu ubicación actual.');
    }
  }

  // =========================================================================
  // 3. RUTAS CICLISTAS (OSRM OPEN SOURCE ROUTING)
  // =========================================================================

  /**
   * Activa el modo para seleccionar destino tocando el mapa
   */
  enableMapDestinationSelection() {
    this.mapSelectionMode = 'destination';
    this.showSuggestions = false;
    this.setTab('map');
    this.showToast('👉 Toca en cualquier punto del mapa para fijar tu destino.', 'primary');
  }

  /**
   * Se ejecuta cada vez que el usuario escribe o modifica el destino en el campo de texto
   */
  onDestinationInputChange() {
    const query = this.destinationLabel ? this.destinationLabel.trim() : '';

    // Si el usuario modifica el texto, invalidamos las coordenadas previas
    // para evitar que se use un destino viejo
    if (this.destinationCoords && query.toLowerCase() !== this.lastGeocodedLabel.toLowerCase()) {
      this.destinationCoords = null;
      this.clearRoutePolylineOnly();
    }

    if (!query || query.length < 2) {
      this.destinationSuggestions = [];
      this.showSuggestions = false;
      return;
    }

    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    this.isSearchingDestination = true;
    this.searchDebounceTimer = setTimeout(() => {
      this.bicimapService.geocodeAddress(query, this.userCoords).subscribe({
        next: (results) => {
          this.isSearchingDestination = false;
          this.destinationSuggestions = results || [];
          this.showSuggestions = this.destinationSuggestions.length > 0;
        },
        error: () => {
          this.isSearchingDestination = false;
          this.destinationSuggestions = [];
          this.showSuggestions = false;
        }
      });
    }, 350);
  }

  /**
   * Selecciona una sugerencia de búsqueda de la lista
   */
  selectSuggestion(item: { name: string; lat: number; lng: number; address: string }) {
    this.destinationLabel = item.name;
    this.destinationCoords = [item.lat, item.lng];
    this.lastGeocodedLabel = item.name;
    this.showSuggestions = false;
    this.destinationSuggestions = [];
    this.updateDestinationMarker();
    this.executeRouteCalculation();
  }

  /**
   * Maneja el clic en el mapa según el modo activo
   */
  private handleMapClick(e: L.LeafletMouseEvent) {
    const lat = Math.round(e.latlng.lat * 100000) / 100000;
    const lng = Math.round(e.latlng.lng * 100000) / 100000;

    if (this.mapSelectionMode === 'destination') {
      // Limpiar ruta previa antes de asignar el nuevo destino
      this.clearRoutePolylineOnly();
      this.destinationCoords = [lat, lng];
      this.destinationLabel = `Punto en mapa (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
      this.lastGeocodedLabel = this.destinationLabel;
      this.showSuggestions = false;
      this.destinationSuggestions = [];
      this.mapSelectionMode = null;

      this.updateDestinationMarker();
      this.executeRouteCalculation();
    } else if (this.mapSelectionMode === 'report_location') {
      this.newReport.lat = lat;
      this.newReport.lng = lng;
      this.newReport.address = `Coordenadas: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      this.mapSelectionMode = null;
      this.showReportModal = true;
      this.showToast('Ubicación del reporte seleccionada en el mapa.', 'success');
    }
  }

  /**
   * Marca visualmente el destino seleccionado en el mapa
   */
  private updateDestinationMarker() {
    if (!this.map || !this.destinationCoords) return;

    const destIcon = L.divIcon({
      className: 'bici-marker-icon pin-peligro',
      html: '🏁',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -20]
    });

    if (this.destMarker) {
      this.destMarker.setLatLng(this.destinationCoords);
      this.destMarker.setPopupContent(`<b>🏁 Destino:</b><br>${this.destinationLabel}`);
    } else {
      this.destMarker = L.marker(this.destinationCoords, { icon: destIcon }).addTo(this.map);
      this.destMarker.bindPopup(`<b>🏁 Destino:</b><br>${this.destinationLabel}`);
    }
  }

  /**
   * Inicia el proceso de cálculo de ruta, geocodificando el texto si es necesario
   */
  async calculateBiciRoute() {
    this.showSuggestions = false;
    const trimmed = this.destinationLabel ? this.destinationLabel.trim() : '';

    if (!trimmed && !this.destinationCoords) {
      this.showToast('Por favor escribe un destino o selecciónalo en el mapa.', 'warning');
      return;
    }

    // Si el usuario escribió un destino y aún no tiene coordenadas o cambió el texto del destino
    const needsGeocoding = !this.destinationCoords || (trimmed && trimmed.toLowerCase() !== this.lastGeocodedLabel.toLowerCase());

    if (needsGeocoding && trimmed) {
      this.isCalculatingRoute = true;
      const searchLoading = await this.loadingCtrl.create({
        message: `Buscando ubicación de "${trimmed}"...`,
        duration: 8000
      });
      await searchLoading.present();

      this.bicimapService.geocodeAddress(trimmed, this.userCoords).subscribe({
        next: async (results) => {
          await searchLoading.dismiss();
          if (results && results.length > 0) {
            const match = results[0];
            this.destinationCoords = [match.lat, match.lng];
            this.destinationLabel = match.name;
            this.lastGeocodedLabel = match.name;
            this.updateDestinationMarker();
            this.executeRouteCalculation();
          } else {
            this.isCalculatingRoute = false;
            this.showToast(`No pudimos encontrar "${trimmed}". Prueba agregando la ciudad o selecciónalo en el mapa.`, 'warning');
          }
        },
        error: async () => {
          await searchLoading.dismiss();
          this.isCalculatingRoute = false;
          this.showToast('Error al buscar la ubicación. Intenta de nuevo.', 'danger');
        }
      });
      return;
    }

    this.executeRouteCalculation();
  }

  /**
   * Ejecuta el cálculo y traza la ruta ciclista con OSRM reemplazando cualquier ruta anterior
   */
  private async executeRouteCalculation() {
    if (!this.destinationCoords) return;

    this.isCalculatingRoute = true;

    // IMPORTANTE: Limpiar completamente la ruta previa antes de calcular la nueva
    this.clearRoutePolylineOnly();

    const loading = await this.loadingCtrl.create({
      message: 'Calculando mejor ruta en bicicleta...',
      duration: 6000
    });
    await loading.present();

    this.bicimapService.calculateRoute(
      this.userCoords,
      this.destinationCoords,
      this.originLabel,
      this.destinationLabel || 'Destino'
    ).subscribe({
      next: async (route) => {
        this.isCalculatingRoute = false;
        await loading.dismiss();

        // Asignar y actualizar la ruta actual
        this.currentRoute = route;

        // Dibujar la nueva polilínea sobre el mapa
        this.drawRouteOnMap(route.coordinates);

        // Cambiar a la pestaña de mapa para mostrar la nueva ruta inmediatamente
        this.setTab('map');
        this.showToast(`Ruta lista: ${route.distanceKm} km (~${route.durationMin} min en bici)`, 'success');
      },
      error: async () => {
        this.isCalculatingRoute = false;
        await loading.dismiss();
        this.showToast('No se pudo calcular la ruta. Intenta nuevamente.', 'danger');
      }
    });
  }

  /**
   * Traza la línea de la ruta en el mapa y ajusta la cámara
   */
  private drawRouteOnMap(coords: [number, number][]) {
    if (!this.map) return;

    // Remover ruta previa si existe
    this.clearRoutePolylineOnly();

    // Dibujar nueva línea estilizada con el verde Zolvix
    this.routeLayer = L.polyline(coords, {
      color: '#10b981',
      weight: 6,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round',
      dashArray: '1, 10'
    }).addTo(this.map);

    // Ajustar zoom para abarcar todo el recorrido
    this.map.fitBounds(this.routeLayer.getBounds(), { padding: [50, 50] });
  }

  /**
   * Limpia únicamente la polilínea y el estado de ruta activa
   */
  private clearRoutePolylineOnly() {
    if (this.routeLayer && this.map) {
      this.map.removeLayer(this.routeLayer);
      this.routeLayer = null;
    }
    this.currentRoute = null;
  }

  /**
   * Limpia la ruta activa del mapa y resetea destinos
   */
  clearRoute() {
    this.clearRoutePolylineOnly();
    if (this.destMarker && this.map) {
      this.map.removeLayer(this.destMarker);
      this.destMarker = null;
    }
    this.destinationCoords = null;
    this.destinationLabel = '';
    this.lastGeocodedLabel = '';
    this.showSuggestions = false;
    this.destinationSuggestions = [];
    this.isRiding = false;
    if (this.rideTimer) clearInterval(this.rideTimer);
    this.rideSeconds = 0;
    this.showToast('Ruta despejada', 'medium');
  }

  /**
   * Inicia el recorrido en bicicleta en tiempo real
   */
  startRide() {
    this.isRiding = true;
    this.rideSeconds = 0;
    this.rideTimer = setInterval(() => {
      this.rideSeconds++;
    }, 1000);
    this.showToast('🚴 ¡Buen viaje! Recorrido en marcha...', 'success');
  }

  /**
   * Finaliza el recorrido y suma los kilómetros a las estadísticas
   */
  finishRide() {
    if (this.currentRoute) {
      this.bicimapService.recordCompletedRide(this.currentRoute.distanceKm);
      this.bicimapService.getUserStats().subscribe(s => this.userStats = s);
    }
    this.isRiding = false;
    if (this.rideTimer) clearInterval(this.rideTimer);
    this.showToast('🎉 ¡Recorrido completado! Se han sumado tus kilómetros al perfil.', 'success');
    this.clearRoute();
  }

  /**
   * Establece un punto de interés como destino de ruta directa
   */
  routeToPoi(poi: PointOfInterest) {
    this.clearRoutePolylineOnly();
    this.destinationCoords = [poi.lat, poi.lng];
    this.destinationLabel = poi.name;
    this.lastGeocodedLabel = poi.name;
    this.showSuggestions = false;
    this.destinationSuggestions = [];
    this.updateDestinationMarker();
    this.executeRouteCalculation();
  }

  // =========================================================================
  // 4. REPORTES COMUNITARIOS
  // =========================================================================

  /**
   * Filtra la lista de reportes según la categoría seleccionada
   */
  filterReports() {
    if (this.reportFilter === 'todos') {
      this.filteredReports = [...this.reports];
    } else {
      this.filteredReports = this.reports.filter(r => r.type === this.reportFilter);
    }
  }

  /**
   * Pinta los marcadores de reportes con iconos diferenciados en el mapa
   */
  private renderReportMarkers() {
    if (!this.map) return;
    this.reportsLayer.clearLayers();

    const getReportIcon = (type: ReportType) => {
      let emoji = '⚠️';
      let pinClass = 'pin-peligro';

      switch (type) {
        case 'obra':
          emoji = '🚧';
          pinClass = 'pin-obra';
          break;
        case 'peligro':
          emoji = '⚠️';
          pinClass = 'pin-peligro';
          break;
        case 'cicloruta':
          emoji = '🚲';
          pinClass = 'pin-cicloruta';
          break;
        case 'congestion':
          emoji = '🚗';
          pinClass = 'pin-congestion';
          break;
        default:
          emoji = '📍';
          pinClass = 'pin-otro';
      }

      return L.divIcon({
        className: `bici-marker-icon ${pinClass}`,
        html: emoji,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
      });
    };

    this.reports.forEach(report => {
      const marker = L.marker([report.lat, report.lng], {
        icon: getReportIcon(report.type)
      });

      const popupContent = `
        <div style="min-width: 190px;">
          <h4 style="margin: 0 0 6px 0; color: #0f172a; font-size: 14px; font-weight: bold;">
            ${report.title}
          </h4>
          <p style="margin: 0 0 6px 0; font-size: 12px; color: #475569;">
            ${report.description}
          </p>
          <div style="font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 4px;">
            <b>Ubicación:</b> ${report.address || 'En cicloruta'}<br>
            <b>Reportado por:</b> ${report.userName || 'Ciclista anónimo'}
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
      this.reportsLayer.addLayer(marker);
    });
  }

  /**
   * Abre el formulario para crear un nuevo reporte
   */
  openNewReportModal(useCurrentLocation: boolean = true) {
    if (useCurrentLocation) {
      this.newReport.lat = this.userCoords[0];
      this.newReport.lng = this.userCoords[1];
      this.newReport.address = 'Cerca de mi ubicación actual';
    }
    this.showReportModal = true;
  }

  /**
   * Permite escoger el punto del reporte tocando el mapa
   */
  selectReportLocationOnMap() {
    this.showReportModal = false;
    this.mapSelectionMode = 'report_location';
    this.setTab('map');
    this.showToast('👉 Toca el punto exacto del mapa donde viste el problema.', 'primary');
  }

  /**
   * Guarda un nuevo reporte y lo proyecta en el mapa
   */
  submitReport() {
    if (!this.newReport.title.trim() || !this.newReport.description.trim()) {
      this.showToast('Por favor completa el título y la descripción.', 'warning');
      return;
    }

    const reportData = {
      title: this.newReport.title,
      type: this.newReport.type,
      description: this.newReport.description,
      address: this.newReport.address || 'Cicloruta urbana',
      lat: this.newReport.lat,
      lng: this.newReport.lng,
      userName: this.currentUser?.name || 'Ciclista Zolvix'
    };

    this.bicimapService.addReport(reportData).subscribe(created => {
      this.showReportModal = false;
      this.newReport.title = '';
      this.newReport.description = '';
      this.showToast('✅ ¡Reporte publicado! Gracias por ayudar a la comunidad ciclista.', 'success');

      // Recargar datos y pintar en el mapa
      this.loadAppData();
    });
  }

  // =========================================================================
  // 5. PUNTOS DE INTERÉS (POI)
  // =========================================================================

  filterPois() {
    if (this.poiFilter === 'todos') {
      this.filteredPois = [...this.pois];
    } else {
      this.filteredPois = this.pois.filter(p => p.category === this.poiFilter);
    }
  }

  private renderPoiMarkers() {
    if (!this.map) return;
    this.poisLayer.clearLayers();

    const getPoiEmoji = (cat: PoiCategory) => {
      switch (cat) {
        case 'estacion': return '🚲';
        case 'taller': return '🔧';
        case 'parqueadero': return '🅿️';
        case 'descanso': return '💧';
        default: return '📍';
      }
    };

    this.pois.forEach(poi => {
      const icon = L.divIcon({
        className: 'bici-marker-icon pin-poi',
        html: getPoiEmoji(poi.category),
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15]
      });

      const marker = L.marker([poi.lat, poi.lng], { icon });

      const popupContent = `
        <div style="min-width: 180px;">
          <h4 style="margin: 0 0 4px 0; color: #0284c7; font-size: 13px; font-weight: bold;">
            ${poi.name}
          </h4>
          <p style="margin: 0 0 6px 0; font-size: 12px; color: #334155;">
            ${poi.description}
          </p>
          <div style="font-size: 11px; color: #64748b;">
            <b>Horario:</b> ${poi.schedule || 'Abierto'}<br>
            <b>Dirección:</b> ${poi.address || 'Urbana'}
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
      this.poisLayer.addLayer(marker);
    });
  }

  /**
   * Enfoca un punto de interés o reporte en el mapa
   */
  focusOnLocation(lat: number, lng: number, title: string) {
    this.setTab('map');
    if (this.map) {
      this.map.flyTo([lat, lng], 17, { duration: 1.2 });
      this.showToast(`Ubicando: ${title}`, 'primary');
    }
  }

  // =========================================================================
  // 6. UTILIDADES Y SESIÓN
  // =========================================================================

  formatRideTime(totalSeconds: number): string {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  async showToast(message: string, color: 'success' | 'warning' | 'danger' | 'primary' | 'medium' = 'primary') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3200,
      position: 'bottom',
      color
    });
    await toast.present();
  }

  async onLogout() {
    const alert = await this.alertCtrl.create({
      header: 'Cerrar Sesión',
      message: '¿Estás seguro de que deseas salir de BiciMap?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Sí, Salir',
          role: 'confirm',
          handler: () => {
            this.authService.logout();
            this.router.navigate(['/login'], { replaceUrl: true });
          }
        }
      ]
    });
    await alert.present();
  }
}
