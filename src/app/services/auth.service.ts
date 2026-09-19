import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ChatMessage } from '../../models/chat.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AiChatService {
  private readonly GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  private conversationHistory: ChatMessage[] = [];

  private readonly systemPrompt = `Eres "BiciBot" 🚲, el asistente inteligente de Bicimap, una aplicación para ciclistas que buscan rutas seguras y prácticas.

Tu personalidad:
- Amigable, amable y siempre dispuesto a ayudar.
- Entusiasta del ciclismo y de conocer nuevas rutas.
- Respondes siempre en español.
- Explicas la información de manera clara, sencilla y fácil de entender.
- Utilizas emojis relacionados con bicicletas y ciclismo de forma moderada 🚲🗺️📍.
- Eres conciso, pero das la información necesaria para ayudar al usuario.

Tu conocimiento especializado incluye:
- Rutas y ciclorutas para bicicletas.
- Recomendaciones de rutas según el origen y destino.
- Lugares de interés cercanos a las rutas.
- Zonas seguras y recomendaciones para los ciclistas.
- Señalización y normas básicas para circular en bicicleta.
- Consejos para tener una experiencia segura durante el recorrido.
- Información sobre distancia, tiempo aproximado y dificultad de las rutas.
- Uso de las funciones principales de la aplicación Bicimap.

Funciones de Bicimap:
- Consulta de rutas para bicicletas.
- Visualización de rutas en el mapa.
- Búsqueda de rutas según origen y destino.
- Información sobre distancia y tiempo del recorrido.
- Reporte de problemas o situaciones en las ciclorutas.
- Consulta de lugares de interés cercanos.
- Recomendaciones para realizar recorridos de manera segura.

Reglas importantes:
- Si no conoces una información con certeza, dilo honestamente y no inventes datos.
- Siempre recomienda utilizar casco y respetar las normas de tránsito.
- No des consejos médicos ni reemplaces la opinión de un profesional.
- Si el usuario pregunta por una ruta específica, recomienda utilizar la función de búsqueda de rutas de Bicimap.
- Mantén tus respuestas relacionadas con el ciclismo, las rutas y las funciones de la aplicación.
- Responde de forma clara y directa, evitando respuestas demasiado largas.
- Ayuda al usuario a encontrar una ruta que se adapte a sus necesidades y recorrido.`;

  constructor(private http: HttpClient) {}

  /**
   * Envía un mensaje al asistente de IA y retorna la respuesta
   */
  sendMessage(userMessage: string): Observable<ChatMessage> {
    const apiKey = (environment as any).geminiApiKey;

    if (!apiKey || apiKey === 'TU_API_KEY_AQUI') {
      return this.getOfflineResponse(userMessage);
    }

    // Agregar mensaje del usuario al historial
    const userMsg: ChatMessage = {
      id: 'msg_' + Date.now(),
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    };

    this.conversationHistory.push(userMsg);

    // Construir el cuerpo de la petición para Gemini
    const body = this.buildGeminiRequest(userMessage);

    return this.http.post<any>(`${this.GEMINI_URL}?key=${apiKey}`, body).pipe(
      map(response => {
        const text = response?.candidates?.[0]?.content?.parts?.[0]?.text
          || 'Lo siento, no pude generar una respuesta. Intenta de nuevo. 🚲';

        const assistantMsg: ChatMessage = {
          id: 'msg_' + Date.now(),
          role: 'assistant',
          content: text,
          timestamp: new Date()
        };

        this.conversationHistory.push(assistantMsg);
        return assistantMsg;
      }),
      catchError(error => {
        console.error('Error al contactar Gemini API:', error);
        return this.getOfflineResponse(userMessage);
      })
    );
  }

  /**
   * Construye el request body para la API de Gemini
   */
  private buildGeminiRequest(userMessage: string): any {
    const contents: any[] = [];

    const systemInstruction = {
      parts: [{ text: this.systemPrompt }]
    };

    const recentHistory = this.conversationHistory.slice(-10);
    for (const msg of recentHistory) {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      });
    }

    if (contents.length === 0) {
      contents.push({
        role: 'user',
        parts: [{ text: userMessage }]
      });
    }

    return {
      system_instruction: systemInstruction,
      contents,
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 1024
      }
    };
  }

  /**
   * Respuesta offline cuando no hay API key o no hay conexión
   */
  private getOfflineResponse(userMessage: string): Observable<ChatMessage> {
    const query = userMessage.toLowerCase();
    let response: string;

    if (query.includes('hola') || query.includes('hoy') || query.includes('buenas')) {
      response = '👋 ¡Hola! Soy BiciBot 🚲, tu asistente de Bicimap. ¿En qué puedo ayudarte hoy? Puedo darte consejos de rutas, seguridad, mantenimiento de tu bici o ayudarte con la app.';
    } else if (query.includes('ruta') || query.includes('camino') || query.includes('llegar')) {
      response = '🗺️ Para consultar una ruta, ve a la sección "Calcular Ruta" en el menú lateral. Ingresa tu destino y te mostraré la mejor ruta ciclista con distancia y tiempo estimado. ¡Recuerda llevar casco! 🚲';
    } else if (query.includes('reporte') || query.includes('peligro') || query.includes('hueco')) {
      response = '⚠️ Puedes crear un reporte comunitario desde la sección "Reportes". Allí puedes informar sobre obras, peligros, congestión y problemas en las ciclorutas.';
    } else if (query.includes('segur') || query.includes('casco') || query.includes('luz')) {
      response = '🛡️ Consejos de seguridad: usa siempre casco, lleva luces delanteras y traseras, respeta los semáforos y señales, y circula por las ciclorutas cuando sea posible. 🚲';
    } else if (query.includes('manten') || query.includes('llanta') || query.includes('arregl') || query.includes('pinch')) {
      response = '🔧 Para el mantenimiento básico de tu bici: revisa la presión de las llantas antes de salir, lubrica la cadena y verifica que los frenos respondan bien. También puedes buscar un taller en la sección "Puntos de Interés".';
    } else if (query.includes('evento') || query.includes('paseo') || query.includes('ciclopaseo')) {
      response = '🎉 Consulta los próximos eventos ciclistas en la sección "Eventos" del menú. Allí podrás encontrar ciclopaseos, talleres y actividades de la comunidad ciclista.';
    } else if (query.includes('clima') || query.includes('lluvia') || query.includes('tiempo')) {
      response = '🌧️ El clima puede cambiar rápidamente. Te recomiendo llevar una chaqueta impermeable ligera si hay posibilidad de lluvia y reducir la velocidad cuando el piso esté mojado.';
    } else {
      response = '🚲 ¡Gracias por tu mensaje! Soy BiciBot y puedo ayudarte con:\n\n🗺️ Cómo usar las rutas de Bicimap\n⚠️ Crear reportes de peligros\n🔧 Mantenimiento de tu bicicleta\n🛡️ Consejos de seguridad\n🎉 Eventos ciclistas';
    }

    const userMsg: ChatMessage = {
      id: 'msg_' + Date.now(),
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    };

    this.conversationHistory.push(userMsg);

    const assistantMsg: ChatMessage = {
      id: 'msg_' + (Date.now() + 1),
      role: 'assistant',
      content: response,
      timestamp: new Date()
    };

    this.conversationHistory.push(assistantMsg);

    return of(assistantMsg);
  }

  /**
   * Obtiene el historial de conversación actual
   */
  getConversationHistory(): ChatMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Limpia el historial de conversación
   */
  clearConversation(): void {
    this.conversationHistory = [];
  }
}