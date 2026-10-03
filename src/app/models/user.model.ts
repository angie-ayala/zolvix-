export interface User {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  photoURL?: string;
  createdAt?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}
