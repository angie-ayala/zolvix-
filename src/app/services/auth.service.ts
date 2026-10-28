import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  Auth,
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from 'firebase/auth';
import { environment } from '../../environments/environment';
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

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly STORAGE_KEY = 'bicimap_current_user';
  private readonly USERS_KEY = 'bicimap_users';

  private currentUserSubject: BehaviorSubject<User | null>;
  currentUser$: Observable<User | null>;

  private firebaseApp: FirebaseApp | null = null;
  private authInstance: Auth | null = null;

  constructor() {
    const firebaseConfig = environment.firebase;
    const hasFirebaseConfig = !!firebaseConfig &&
      !!firebaseConfig.apiKey &&
      !!firebaseConfig.authDomain &&
      !!firebaseConfig.projectId &&
      !!firebaseConfig.appId;

    this.currentUserSubject = new BehaviorSubject<User | null>(null);
    this.currentUser$ = this.currentUserSubject.asObservable();

    if (hasFirebaseConfig) {
      this.firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
      this.authInstance = getAuth(this.firebaseApp);
      localStorage.removeItem(this.STORAGE_KEY);
      this.bindFirebaseAuthState();
      return;
    }

    const storedUser = this.loadUserFromStorage();
    this.currentUserSubject = new BehaviorSubject<User | null>(storedUser);
    this.currentUser$ = this.currentUserSubject.asObservable();
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.getValue();
  }

  isAuthenticated(): boolean {
    return this.currentUserSubject.getValue() !== null;
  }

  login(email: string, password: string): Observable<AuthResponse> {
    const normalizedEmail = email.trim();

    if (this.authInstance) {
      return new Observable<AuthResponse>((observer) => {
        signInWithEmailAndPassword(this.authInstance!, normalizedEmail, password)
          .then(async (credential) => {
            const user = this.mapFirebaseUser(credential.user);
            this.setCurrentUser(user);
            observer.next({ message: `¡Bienvenido de vuelta, ${user.name}! 🚲`, user });
            observer.complete();
          })
          .catch((error: any) => {
            observer.error(new Error(this.getFirebaseAuthError(error)));
          });
      });
    }

    const users: Array<User & { password: string }> = this.getStoredUsers();
    const found = users.find(u => u.email.toLowerCase() === normalizedEmail.toLowerCase());

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

  register(data: RegisterData): Observable<AuthResponse> {
    const normalizedEmail = data.email.trim();

    if (this.authInstance) {
      return new Observable<AuthResponse>((observer) => {
        createUserWithEmailAndPassword(this.authInstance!, normalizedEmail, data.password)
          .then(async (credential) => {
            await updateProfile(credential.user, { displayName: data.name });
            const firebaseUser = { ...credential.user, displayName: data.name } as FirebaseUser;
            const user = this.mapFirebaseUser(firebaseUser);
            this.setCurrentUser(user);
            observer.next({ message: `¡Cuenta creada! Bienvenido a BiciMap, ${user.name}! 🚲`, user });
            observer.complete();
          })
          .catch((error: any) => {
            observer.error(new Error(this.getFirebaseAuthError(error)));
          });
      });
    }

    const users: Array<User & { password: string }> = this.getStoredUsers();
    const exists = users.some(u => u.email.toLowerCase() === normalizedEmail.toLowerCase());
    if (exists) {
      return throwError(() => new Error('Ya existe una cuenta registrada con ese correo.'));
    }

    const newUser: User & { password: string } = {
      uid: 'user_' + Date.now(),
      name: data.name,
      email: normalizedEmail,
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

  logout(): void {
    if (this.authInstance) {
      signOut(this.authInstance).catch(() => undefined);
    }

    this.currentUserSubject.next(null);
    localStorage.removeItem(this.STORAGE_KEY);
  }

  private bindFirebaseAuthState(): void {
    if (!this.authInstance) {
      return;
    }

    onAuthStateChanged(this.authInstance, (firebaseUser: FirebaseUser | null) => {
      if (!firebaseUser) {
        this.currentUserSubject.next(null);
        localStorage.removeItem(this.STORAGE_KEY);
        return;
      }

      const user = this.mapFirebaseUser(firebaseUser);
      this.setCurrentUser(user);
    });
  }

  private mapFirebaseUser(firebaseUser: FirebaseUser): User {
    return {
      uid: firebaseUser.uid,
      name: firebaseUser.displayName || 'Ciclista',
      email: firebaseUser.email || '',
      phone: undefined,
      photoURL: firebaseUser.photoURL || undefined,
      createdAt: firebaseUser.metadata?.creationTime || new Date().toISOString()
    };
  }

  private getFirebaseAuthError(error: any): string {
    const code = error?.code || '';

    switch (code) {
      case 'auth/email-already-in-use':
        return 'Ya existe una cuenta registrada con ese correo.';
      case 'auth/invalid-email':
        return 'El correo ingresado no es válido.';
      case 'auth/weak-password':
        return 'La contraseña es demasiado débil. Usa al menos 6 caracteres.';
      case 'auth/user-not-found':
        return 'No existe una cuenta con ese correo electrónico.';
      case 'auth/wrong-password':
        return 'Contraseña incorrecta. Intenta nuevamente.';
      default:
        return error?.message || 'Error de autenticación. Intenta nuevamente.';
    }
  }

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
