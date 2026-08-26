import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { AuthService } from '../services/auth.service';
import { User } from '../models/user.model';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit {
  currentUser$!: Observable<User | null>;

  constructor(
    private authService: AuthService,
    private router: Router,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    this.currentUser$ = this.authService.currentUser$;
  }

  async onLogout() {
    const alert = await this.alertCtrl.create({
      header: 'Cerrar Sesión',
      message: '¿Estás seguro de que deseas salir de tu cuenta?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Sí, Salir',
          role: 'confirm',
          handler: async () => {
            this.authService.logout();
            const toast = await this.toastCtrl.create({
              message: 'Has cerrado sesión exitosamente.',
              duration: 2500,
              position: 'bottom',
              color: 'medium'
            });
            await toast.present();
            this.router.navigate(['/login'], { replaceUrl: true });
          }
        }
      ]
    });

    await alert.present();
  }
}

