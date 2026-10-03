import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ChatMessage } from '../models/chat.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AiChatService {

  // Groq usa el mismo formato que OpenAI Chat Completions
  private readonly GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

  // Modelo gratuito: llama-3.1-8b-instant (14 400 req/día gratis)
  // Alternativa más potente: llama-3.3-70b-versatile (1 000 req/día gratis)
  private readonly GROQ_MODEL = 'llama-3.1-8b-instant';

  private conversationHistory: ChatMessage[] = [];

  private readonly systemPrompt = `Eres "BiciBot" 🚲, el asistente inteligente de BiciMap, una aplicación colombiana para ciclistas urbanos.

PERSONALIDAD:
- Amigable, entusiasta del ciclismo y siempre dispuesto a ayudar.
- Respondes SIEMPRE en español, de forma clara y concisa.
- Usas emojis relacionados con bicicletas de forma moderada 🚲🗺️⚠️🔧🎉.
- Eres empático con el ciclista urbano: entiendes sus retos diarios.

CONOCIMIENTO ESPECIALIZADO:
- Rutas y ciclorutas para bicicletas en ciudades colombianas (especialmente Bogotá).
- Ciclovías, carriles bici, rutas compartidas y calles de bajo tráfico.
- Reportes de peligros: huecos, obras, invasión de ciclorutas, congestión.
- Parqueaderos para bicicletas, talleres de reparación, estaciones de bici pública.
- Seguridad vial: casco, luces, chalecos reflectivos, normas de tránsito.
- Mantenimiento básico: llantas, cadena, frenos, cambios.
- Eventos ciclistas: ciclopaseos, Ciclovía dominical, rallys, talleres comunitarios.
- Clima y condiciones para pedalear: lluvia, temperatura, visibilidad.
- Beneficios del ciclismo: salud, medio ambiente, ahorro económico.
- Equipo recomendado: candados, alforjas, portabicicletas, GPS.
- Normativa ciclista en Colombia: derechos y deberes del ciclista.
- Zonas de alto riesgo para ciclistas y cómo evitarlas.
- Hidratación, nutrición y preparación física para recorridos largos.
- Tipos de bicicleta: urbana, MTB, ruta, eléctrica — cuál elegir según necesidad.

FUNCIONES DE BICIMAP QUE PUEDES EXPLICAR:
- Calcular Ruta: calcula la mejor ruta ciclista entre origen y destino.
- Mapa interactivo: visualiza ciclorutas, puntos de interés y reportes en tiempo real.
- Reportes comunitarios: reporta y consulta peligros en la vía.
- Puntos de interés: talleres, parqueaderos, estaciones de hidratación.
- Eventos: próximos ciclopaseos y actividades ciclistas.
- Perfil y estadísticas: distancia recorrida, CO2 ahorrado, recorridos completados.

REGLAS:
- Responde SOLO en español.
- Si el usuario pregunta algo fuera del ciclismo o BiciMap, redirige amablemente al tema.
- No inventes datos específicos (direcciones exactas, precios, horarios) si no los conoces con certeza.
- Siempre recomienda casco y respetar las normas de tránsito.
- Respuestas cortas para preguntas simples, más detalladas para consultas complejas.
- Si el usuario describe una emergencia, indícale que llame al 123 (emergencias Colombia).`;

  constructor(private http: HttpClient) {}

  /**
   * Envía un mensaje al BiciBot.
   * Prioridad: 1) Servidor propio → 2) Groq → 3) Offline
   */
  sendMessage(userMessage: string): Observable<ChatMessage> {
    const groqKey    = (environment as any).groqApiKey   as string | undefined;
    const serverUrl  = (environment as any).apiServerUrl as string | undefined;

    // Registrar mensaje del usuario en historial local
    const userMsg: ChatMessage = {
      id: 'msg_' + Date.now(),
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    };
    this.conversationHistory.push(userMsg);

    // 1️⃣ Servidor propio configurado
    if (serverUrl && serverUrl.trim()) {
      return this.callOwnServer(userMessage, serverUrl.trim());
    }

    // 2️⃣ Groq API (key válida empieza con "gsk_")
    if (groqKey && groqKey.startsWith('gsk_')) {
      return this.callGroq(userMessage, groqKey);
    }

    // 3️⃣ Fallback offline
    console.warn('BiciBot: sin API key configurada → modo offline. ' +
      'Obtén una key gratis en https://console.groq.com');
    return this.getOfflineResponse(userMessage);
  }

  // ── Groq API ──────────────────────────────────────────────────────

  private callGroq(userMessage: string, apiKey: string): Observable<ChatMessage> {
    const headers = new HttpHeaders({
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`
    });

    // Construir mensajes en formato OpenAI
    const messages: { role: string; content: string }[] = [
      { role: 'system', content: this.systemPrompt }
    ];

    // Últimos 10 mensajes del historial (sin el que acabamos de agregar)
    const history = this.conversationHistory.slice(-11, -1);
    for (const msg of history) {
      messages.push({
        role:    msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      });
    }

    // Mensaje actual
    messages.push({ role: 'user', content: userMessage });

    const body = {
      model:       this.GROQ_MODEL,
      messages,
      temperature: 0.7,
      max_tokens:  1024,
      top_p:       0.95
    };

    return this.http.post<any>(this.GROQ_URL, body, { headers }).pipe(
      map((res: any) => {
        const text: string =
          res?.choices?.[0]?.message?.content ??
          'Lo siento, no pude generar una respuesta. Intenta de nuevo. 🚲';

        const assistantMsg: ChatMessage = {
          id:        'msg_' + Date.now(),
          role:      'assistant',
          content:   text,
          timestamp: new Date()
        };
        this.conversationHistory.push(assistantMsg);
        return assistantMsg;
      }),
      catchError((err: any) => {
        console.error('BiciBot: error en Groq API →', err);
        return this.getOfflineResponse(userMessage);
      })
    );
  }

  // ── Servidor propio ───────────────────────────────────────────────

  private callOwnServer(userMessage: string, serverUrl: string): Observable<ChatMessage> {
    const payload = {
      message:      userMessage,
      systemPrompt: this.systemPrompt,
      history: this.conversationHistory.slice(-10).map(m => ({
        role:    m.role,
        content: m.content
      }))
    };

    return this.http.post<any>(serverUrl, payload).pipe(
      map((res: any) => {
        const text: string =
          res?.reply ?? res?.response ?? res?.text ?? res?.message ??
          'Sin respuesta del servidor. 🚲';

        const assistantMsg: ChatMessage = {
          id:        'msg_' + Date.now(),
          role:      'assistant',
          content:   text,
          timestamp: new Date()
        };
        this.conversationHistory.push(assistantMsg);
        return assistantMsg;
      }),
      catchError((err: any) => {
        console.error('BiciBot: error en servidor propio →', err);
        // Intentar Groq como respaldo
        const groqKey = (environment as any).groqApiKey as string | undefined;
        if (groqKey && groqKey.startsWith('gsk_')) {
          return this.callGroq(userMessage, groqKey);
        }
        return this.getOfflineResponse(userMessage);
      })
    );
  }

  // ── Respuestas offline enriquecidas ───────────────────────────────

  private getOfflineResponse(userMessage: string): Observable<ChatMessage> {
    const q = userMessage.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    let response: string;

    // Saludos
    if (/^(hola|holi|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hey|que tal|como estas)/.test(q)) {
      response = '👋 ¡Hola! Soy BiciBot 🚲, tu asistente de BiciMap. Puedo ayudarte con rutas, seguridad, reportes, eventos y mucho más. ¿Qué necesitas?';

    // Rutas
    } else if (/ruta|camino|llegar|como voy|como llego|direccion|navegar|ir a|desde|hasta/.test(q)) {
      response = '🗺️ Para calcular tu ruta, ve a la pestaña **Rutas** en la barra inferior. Ingresa tu destino y BiciMap trazará el camino más seguro con distancia y tiempo estimado en bicicleta.\n\n💡 Tip: también puedes tocar directamente en el mapa para fijar el destino.';

    // Ciclovía / ciclorruta
    } else if (/ciclovia|cicloruta|carril|bici carril/.test(q)) {
      response = '🚲 Bogotá tiene más de 600 km de ciclorutas permanentes. Cada domingo la Ciclovía abre ~120 km de vías solo para ciclistas (7am–2pm).\n\nEn BiciMap puedes ver todas las ciclorutas activas en el mapa interactivo.';

    // Reportes / peligros / huecos
    } else if (/reporte|peligro|hueco|obra|bache|caida|accidente|dano|dana|dañ/.test(q)) {
      response = '⚠️ Para reportar un peligro ve a la pestaña **Reportar** o toca el botón "+" en el mapa.\n\nPuedes reportar:\n🚧 Obras y cierres\n⚠️ Huecos y baches\n🚗 Invasión vehicular\n🚲 Mal estado de ciclorutas\n\nTus reportes ayudan a toda la comunidad ciclista.';

    // Seguridad
    } else if (/segur|casco|accidente|caida|robo|hurto|peligroso|zona/.test(q)) {
      response = '🛡️ Consejos de seguridad para ciclistas:\n\n🪖 Usa siempre casco (obligatorio en Colombia)\n🦺 Chaleco reflectivo de noche\n💡 Luces delantera blanca y trasera roja\n🔒 Candado en U para parquear\n📱 No uses el celular mientras pedaleas\n🚦 Respeta semáforos y señales\n\nEn zonas de alto riesgo, prefiere ciclorutas iluminadas.';

    // Mantenimiento
    } else if (/manten|llanta|pinchazo|cadena|freno|cambio|arregl|taller|mecanico/.test(q)) {
      response = '🔧 Mantenimiento básico semanal:\n\n• Presión de llantas: 40-65 PSI (urbana) / 25-35 PSI (MTB)\n• Cadena limpia y lubricada\n• Frenos bien ajustados\n• Tornillos apretados\n\n🏪 Busca talleres cerca en la sección **Puntos de Interés** de BiciMap.';

    // Parqueaderos
    } else if (/parquea|parquear|dejar|bici publica|biciparque/.test(q)) {
      response = '🅿️ En BiciMap puedes encontrar parqueaderos para bicicletas en la sección **Puntos de Interés**, filtrando por "Parqueaderos".\n\nTips para parquear seguro:\n🔒 Usa candado en U + cable\n💡 Prefiere lugares vigilados y bien iluminados\n📍 Anota la ubicación en el mapa.';

    // Eventos / ciclopaseos
    } else if (/evento|paseo|ciclopaseo|rally|grupo|comunidad|salida/.test(q)) {
      response = '🎉 Consulta los próximos eventos en la sección **Eventos** del menú lateral.\n\nEventos populares en Bogotá:\n🚲 Ciclovía dominical (cada domingo 7am–2pm)\n🌙 Ciclovía nocturna (ocasional)\n🏁 Ciclopaseos comunitarios\n🔧 Talleres de mecánica básica\n\n¡Pedalear en grupo es más seguro y divertido!';

    // Clima / lluvia
    } else if (/clima|lluvia|llover|frio|calor|temperatura|nublado/.test(q)) {
      response = '🌦️ Consejos para pedalear con mal clima:\n\n🌧️ Lluvia: reduce velocidad, frena suave, usa impermeable\n☁️ Neblina: enciende luces aunque sea de día\n☀️ Sol fuerte: usa protector solar y lleva agua\n💧 Siempre lleva una chaqueta impermeable ligera\n\nRecuerda que el piso mojado aumenta la distancia de frenado.';

    // Tipos de bici
    } else if (/tipo|clase|bicicleta electrica|mtb|montaña|urbana|ruta|fixie|cual compro/.test(q)) {
      response = '🚲 ¿Qué bicicleta elegir?\n\n🏙️ **Urbana**: ideal para ciudad, cómoda, fácil mantenimiento\n⛰️ **MTB**: para ciclorutas mixtas y terrenos irregulares\n🏎️ **Ruta**: velocidad en asfalto, recorridos largos\n⚡ **Eléctrica**: ideal si hay cuestas o recorridos largos\n🔧 **Fixie**: minimalista, para ciudad plana\n\nPara Bogotá con ciclorutas, una urbana o MTB es lo más práctico.';

    // Salud / beneficios
    } else if (/salud|caloria|ejercicio|beneficio|co2|ambiente|ahorro/.test(q)) {
      response = '💪 Beneficios de ir en bici:\n\n❤️ Mejora salud cardiovascular\n🔥 ~400-600 calorías/hora quemadas\n🌱 0 emisiones de CO2\n💰 Ahorro en transporte vs. bus o carro\n😌 Reduce el estrés\n⏱️ En Bogotá, muchas veces es más rápido que el tráfico\n\nBiciMap registra el CO2 que ahorras en cada recorrido 🌍';

    // Hidratación / nutrición
    } else if (/agua|hidrat|comer|nutricion|energia|gel|snack/.test(q)) {
      response = '💧 Hidratación y nutrición en bici:\n\n• Bebe agua cada 20 min aunque no sientas sed\n• Recorridos +1 hora: lleva snacks energéticos\n• Antes de salir: come algo ligero 1h antes\n• Lleva al menos 500ml de agua en botellera\n\n🏪 Busca puntos de hidratación en BiciMap → Puntos de Interés → "Hidratación".';

    // Normativa / ley
    } else if (/ley|norma|multa|transito|obligatorio|decreto|reglamento/.test(q)) {
      response = '📋 Normativa ciclista en Colombia (Código Nacional de Tránsito):\n\n🪖 Casco obligatorio fuera de ciclovías\n🦺 Chaleco reflectivo obligatorio de noche\n💡 Luces obligatorias de 6pm a 6am\n🚫 Prohibido ir en contravía\n🚫 Prohibido usar el celular mientras pedaleas\n✅ Derecho a usar el carril derecho de la vía\n\nLas multas pueden ir desde $95.000 COP.';

    // Emergencias
    } else if (/emergencia|accidente grave|herido|ambulancia|policia|caida fuerte/.test(q)) {
      response = '🚨 En caso de emergencia:\n\n📞 **Llama al 123** (Emergencias Colombia)\n🚑 **Línea de salud**: 125\n👮 **Policía**: 112\n\nMientras esperas:\n• No muevas a la persona si hay posible lesión en cuello\n• Señaliza el área para avisar a otros\n• Quédate con el accidentado hasta que llegue ayuda';

    // App / cómo usar
    } else if (/como uso|ayuda|funciona|app|aplicacion|tutorial|guia/.test(q)) {
      response = '📱 BiciMap tiene 5 secciones principales:\n\n🗺️ **Mapa**: tu ubicación GPS + ciclorutas + reportes\n🧭 **Rutas**: calcula la mejor ruta ciclista\n⚠️ **Reportar**: informa peligros en la vía\n📍 **Puntos**: talleres, parqueaderos, hidratación\n🎉 **Eventos**: ciclopaseos y actividades\n\n¿Sobre cuál quieres saber más?';

    // Respuesta genérica
    } else {
      response = '🚲 Estoy aquí para ayudarte con todo lo relacionado a ciclismo y BiciMap.\n\nPuedo responder sobre:\n🗺️ Rutas y ciclorutas\n⚠️ Reportes de peligros\n🅿️ Parqueaderos y talleres\n🛡️ Seguridad vial\n🔧 Mantenimiento de tu bici\n🎉 Eventos ciclistas\n💪 Beneficios y salud\n\n¿Qué quieres saber?';
    }

    const assistantMsg: ChatMessage = {
      id:        'msg_' + Date.now(),
      role:      'assistant',
      content:   response,
      timestamp: new Date()
    };
    this.conversationHistory.push(assistantMsg);
    return of(assistantMsg);
  }

  // ── Utilidades ────────────────────────────────────────────────────

  getConversationHistory(): ChatMessage[] {
    return [...this.conversationHistory];
  }

  clearConversation(): void {
    this.conversationHistory = [];
  }
}
