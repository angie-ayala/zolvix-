import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { User } from '../models/user.model';

export interface AuthResponse {
  message: string;
  user?: User;
}

export interface RegisterData {
  name: string;
  email: string;
  phone?: string;
  password: string;
}

/**
 * Servicio de autenticación para BiciMap.
 * Gestiona el estado de sesión del usuario de forma local (localStorage)
 * hasta que se integre un backend de autenticación real.
 */
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly STORAGE_KEY = 'bicimap_current_user';
  private readonly USERS_KEY = 'bicimap_users';

  private currentUserSubject: BehaviorSubject<User | null>;
  currentUser$: Observable<User | null>;

  constructor() {
    const storedUser = this.loadUserFromStorage();
    this.currentUserSubject = new BehaviorSubject<User | null>(storedUser);
    this.currentUser$ = this.currentUserSubject.asObservable();
  }

  // -------------------------------------------------------------------------
  // Estado de sesión
  // -------------------------------------------------------------------------

  /** Devuelve el usuario actualmente autenticado o null */
  getCurrentUser(): User | null {
    return this.currentUserSubject.getValue();
  }

  /** True si hay un usuario autenticado */
  isAuthenticated(): boolean {
    return this.currentUserSubject.getValue() !== null;
  }

  // -------------------------------------------------------------------------
  // Autenticación
  // -------------------------------------------------------------------------

  /**
   * Inicia sesión con email y contraseña.
   * Retorna un Observable con el mensaje de éxito o lanza un error.
   */
  login(email: string, password: string): Observable<AuthResponse> {
    const users: Array<User & { password: string }> = this.getStoredUsers();

    // Cuenta demo predefinida
    const demoEmail = 'demo@bicimap.com';
    const demoPassword = 'password123';

    if (email === demoEmail && password === demoPassword) {
      const demoUser: User = {
        uid: 'demo_user',
        name: 'Ciclista Demo',
        email: demoEmail,
        photoURL: null as any
      };
      this.setCurrentUser(demoUser);
      return of({ message: '¡Bienvenido de vuelta, Ciclista Demo! 🚲', user: demoUser }).pipe(delay(500));
    }

    const found = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!found) {
      return throwError(() => new Error('No existe una cuenta con ese correo electrónico.'));
    }

    if (found.password !== password) {
      return throwError(() => new Error('Contraseña incorrecta. Intenta nuevamente.'));
    }

    const { password: _pw, ...user } = found;
    this.setCurrentUser(user as User);
    return of({ message: `¡Bienvenido de vuelta, ${user.name}! 🚲`, user: user as User }).pipe(delay(500));
  }

  /**
   * Registra una nueva cuenta de usuario.
   * Retorna un Observable con el mensaje de éxito o lanza un error.
   */
  register(data: RegisterData): Observable<AuthResponse> {
    const users: Array<User & { password: string }> = this.getStoredUsers();

    const exists = users.some(u => u.email.toLowerCase() === data.email.toLowerCase());
    if (exists) {
      return throwError(() => new Error('Ya existe una cuenta registrada con ese correo.'));
    }

    const newUser: User & { password: string } = {
      uid: 'user_' + Date.now(),
      name: data.name,
      email: data.email,
      phone: data.phone,
      photoURL: undefined,
      createdAt: new Date().toISOString(),
      password: data.password
    };

    users.push(newUser);
    this.saveUsers(users);

    const { password: _pw, ...user } = newUser;
    this.setCurrentUser(user as User);

    return of({ message: `¡Cuenta creada! Bienvenido a BiciMap, ${user.name}! 🚲`, user: user as User }).pipe(delay(600));
  }

  /**
   * Cierra la sesión del usuario actual
   */
  logout(): void {
    this.currentUserSubject.next(null);
    localStorage.removeItem(this.STORAGE_KEY);
  }

  // -------------------------------------------------------------------------
  // Utilidades privadas de almacenamiento
  // -------------------------------------------------------------------------

  private setCurrentUser(user: User): void {
    this.currentUserSubject.next(user);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(user));
  }

  private loadUserFromStorage(): User | null {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  }

  private getStoredUsers(): Array<User & { password: string }> {
    try {
      const raw = localStorage.getItem(this.USERS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveUsers(users: Array<User & { password: string }>): void {
    localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
  }
}
