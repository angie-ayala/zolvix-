import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { delay, tap } from 'rxjs/operators';
import { User, AuthSession } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly USERS_STORAGE_KEY = 'zolvix_users';
  private readonly SESSION_STORAGE_KEY = 'zolvix_session';

  private currentUserSubject = new BehaviorSubject<User | null>(this.getUserFromSession());
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor() {
    this.initDefaultUsers();
  }

  /**
   * Inicializa un usuario por defecto si no existen usuarios registrados
   */
  private initDefaultUsers(): void {
    const existingUsers = this.getStoredUsers();
    if (existingUsers.length === 0) {
      const defaultUser: User = {
        id: 'usr_default_1',
        name: 'Administrador Demo',
        email: 'demo@empresa.com',
        password: 'password123',
        phone: '3001234567',
        createdAt: new Date().toISOString()
      };
      localStorage.setItem(this.USERS_STORAGE_KEY, JSON.stringify([defaultUser]));
    }
  }

  /**
   * Obtiene la lista de usuarios almacenados localmente
   */
  private getStoredUsers(): User[] {
    const data = localStorage.getItem(this.USERS_STORAGE_KEY);
    try {
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  /**
   * Obtiene el usuario de la sesión actual
   */
  private getUserFromSession(): User | null {
    const sessionData = localStorage.getItem(this.SESSION_STORAGE_KEY);
    if (!sessionData) return null;
    try {
      const session: AuthSession = JSON.parse(sessionData);
      return session.user || null;
    } catch {
      return null;
    }
  }

  /**
   * Registra un nuevo usuario
   */
  public register(newUser: Omit<User, 'id' | 'createdAt'>): Observable<{ success: boolean; message: string; user?: User }> {
    const users = this.getStoredUsers();
    const normalizedEmail = newUser.email.trim().toLowerCase();

    const emailExists = users.some(u => u.email.toLowerCase() === normalizedEmail);
    if (emailExists) {
      return throwError(() => new Error('Este correo electrónico ya se encuentra registrado.'));
    }

    const createdUser: User = {
      ...newUser,
      id: 'usr_' + Date.now(),
      email: normalizedEmail,
      createdAt: new Date().toISOString()
    };

    users.push(createdUser);
    localStorage.setItem(this.USERS_STORAGE_KEY, JSON.stringify(users));

    // Iniciar sesión automáticamente tras el registro exitoso
    this.saveSession(createdUser);

    return of({
      success: true,
      message: '¡Registro exitoso! Bienvenido a Empresa App.',
      user: createdUser
    }).pipe(delay(500)); // Simula latencia de red
  }

  /**
   * Inicia sesión con credenciales
   */
  public login(email: string, password: string): Observable<{ success: boolean; message: string; user?: User }> {
    const users = this.getStoredUsers();
    const normalizedEmail = email.trim().toLowerCase();

    const user = users.find(u => u.email.toLowerCase() === normalizedEmail);

    if (!user) {
      return throwError(() => new Error('No existe una cuenta registrada con este correo.'));
    }

    if (user.password !== password) {
      return throwError(() => new Error('La contraseña ingresada es incorrecta.'));
    }

    this.saveSession(user);

    return of({
      success: true,
      message: '¡Inicio de sesión exitoso!',
      user
    }).pipe(delay(500)); // Simula latencia de red
  }

  /**
   * Guarda la sesión del usuario en localStorage
   */
  private saveSession(user: User): void {
    // Clonamos el objeto sin exponer la contraseña en la sesión activa
    const { password, ...safeUser } = user;
    const session: AuthSession = {
      user: safeUser as User,
      loginAt: new Date().toISOString(),
      token: 'jwt_mock_token_' + Math.random().toString(36).substring(2)
    };

    localStorage.setItem(this.SESSION_STORAGE_KEY, JSON.stringify(session));
    this.currentUserSubject.next(safeUser as User);
  }

  /**
   * Cierra la sesión activa
   */
  public logout(): void {
    localStorage.removeItem(this.SESSION_STORAGE_KEY);
    this.currentUserSubject.next(null);
  }

  /**
   * Devuelve el usuario actualmente autenticado
   */
  public getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  /**
   * Verifica si hay una sesión activa
   */
  public isAuthenticated(): boolean {
    return this.currentUserSubject.value !== null;
  }
}
