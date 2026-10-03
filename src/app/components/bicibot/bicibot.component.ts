import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { AiChatService } from '../../services/ai-chat.service';
import { ChatMessage } from '../../models/chat.model';

@Component({
  selector: 'app-bicibot',
  templateUrl: './bicibot.component.html',
  styleUrls: ['./bicibot.component.scss'],
  standalone: false
})
export class BicibotComponent implements OnInit {
  @ViewChild('chatBody') chatBodyRef!: ElementRef;

  isChatOpen: boolean = false;
  chatMessages: ChatMessage[] = [];
  chatInput: string = '';
  isChatLoading: boolean = false;

  chatSuggestions: string[] = [
    '¿Rutas seguras? 🗺️',
    'Seguridad vial 🪖',
    'Mantenimiento 🔧',
    'Reportar peligro ⚠️',
    'Eventos 🎉'
  ];

  constructor(private aiChatService: AiChatService) {}

  ngOnInit(): void {
    this.chatMessages = this.aiChatService.getConversationHistory();
  }

  /** Abre/cierra el panel flotante de chat */
  toggleChat(): void {
    this.isChatOpen = !this.isChatOpen;
    if (this.isChatOpen) {
      this.chatMessages = this.aiChatService.getConversationHistory();
      setTimeout(() => this.scrollChatToBottom(), 100);
    }
  }

  /** Envía un mensaje al BiciBot */
  sendChatMessage(): void {
    const text = this.chatInput?.trim();
    if (!text || this.isChatLoading) return;

    // Agregar mensaje del usuario en la interfaz
    const userMsg: ChatMessage = {
      id: 'ui_' + Date.now(),
      role: 'user',
      content: text,
      timestamp: new Date()
    };
    this.chatMessages.push(userMsg);
    this.chatInput = '';
    this.scrollChatToBottom();
    this.isChatLoading = true;

    // Enviar a la IA (Google Gemini o respuestas locales)
    this.aiChatService.sendMessage(text).subscribe({
      next: () => {
        this.chatMessages = this.aiChatService.getConversationHistory();
        this.isChatLoading = false;
        this.scrollChatToBottom();
      },
      error: () => {
        this.isChatLoading = false;
        const errorMsg: ChatMessage = {
          id: 'err_' + Date.now(),
          role: 'assistant',
          content: '❌ Error al procesar tu solicitud. Intenta de nuevo.',
          timestamp: new Date()
        };
        this.chatMessages.push(errorMsg);
        this.scrollChatToBottom();
      }
    });
  }

  /** Envía una sugerencia rápida */
  sendChatFromSuggestion(suggestion: string): void {
    this.chatInput = suggestion;
    this.sendChatMessage();
  }

  /** Limpia la conversación */
  clearChat(): void {
    this.aiChatService.clearConversation();
    this.chatMessages = [];
  }

  /** Auto-scroll al final del chat */
  private scrollChatToBottom(): void {
    setTimeout(() => {
      const el = this.chatBodyRef?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }, 50);
  }
}

