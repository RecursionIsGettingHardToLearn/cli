import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { map } from 'rxjs';
import { MENU } from './menu-items';
import { SupabaseService } from '../../core/auth/supabase.service';
import { NavResaltadoService } from '../../core/services/nav-resaltado.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <aside class="sidebar"
           [class.collapsed]="collapsed"
           [class.mobile-open]="mobileOpen">
      <div class="brand">
        <img src="assets/icons/icono.svg" alt="Logo de la clinica" class="brand-logo">
        <span class="label">Clinica</span>
      </div>
      <nav>
        <a *ngFor="let item of items$ | async"
           [routerLink]="item.route"
           routerLinkActive="active"
           class="nav-item"
           [class.resaltado]="resaltado() === item.route"
           [attr.title]="collapsed ? item.label : null"
           (click)="navItemClick.emit()">
          <i class="pi {{ item.icon }}"></i>
          <span class="label">{{ item.label }}</span>
        </a>
      </nav>
      <div class="bottom" *ngIf="user$ | async as u">
        <div class="user-info" *ngIf="!collapsed">
          <div class="user-name">{{ u.nombre }}</div>
          <div class="user-email" [attr.title]="u.email">{{ u.email }}</div>
          <div class="user-role">{{ u.rol }}</div>
        </div>
        <button class="logout" (click)="logout()" [attr.title]="collapsed ? 'Salir' : null">
          <i class="pi pi-sign-out"></i>
          <span class="label">Salir</span>
        </button>
      </div>
    </aside>
  `,
  styles: [`
    .sidebar {
      width: 240px;
      background: #0f6e56;
      color: #f5fbf8;
      display: flex;
      flex-direction: column;
      height: 100vh;
      flex-shrink: 0;
      transition: width 0.2s ease, transform 0.25s ease;
    }
    .sidebar.collapsed { width: 64px; }
    .sidebar.collapsed .label { display: none; }
    .sidebar.collapsed .brand { justify-content: center; padding: 20px 0; }
    .sidebar.collapsed .nav-item { justify-content: center; padding: 12px 0; gap: 0; }
    .sidebar.collapsed .bottom { padding: 12px 8px; }
    .sidebar.collapsed .logout { padding: 8px 0; }

    .brand {
      padding: 20px;
      font-size: 18px;
      font-weight: 700;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      display: flex; align-items: center; gap: 10px;
      white-space: nowrap;
      overflow: hidden;
    }
    .brand-logo { width: 28px; height: 28px; flex-shrink: 0; filter: drop-shadow(0 1px 2px rgba(0,0,0,.25)); }
    nav { flex: 1; padding: 12px 0; overflow-y: auto; overflow-x: hidden; }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 20px;
      color: #d6efe5;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.2s;
      white-space: nowrap;
      overflow: hidden;
    }
    .nav-item:hover { background: rgba(255,255,255,0.08); text-decoration: none; }
    .nav-item.active { background: rgba(255,255,255,0.15); color: white; font-weight: 600; }
    /* Resaltado desde el chatbot: pulso ambar para ensenarle al usuario donde vive el item */
    .nav-item.resaltado {
      background: rgba(255, 209, 102, 0.22);
      color: #fff;
      box-shadow: inset 4px 0 0 #ffd166;
      animation: nav-pulso 0.9s ease-in-out 5;
    }
    @keyframes nav-pulso {
      0%, 100% { background: rgba(255, 209, 102, 0.22); }
      50%      { background: rgba(255, 209, 102, 0.48); }
    }
    .nav-item i { width: 18px; text-align: center; flex-shrink: 0; }
    .bottom {
      padding: 16px 20px;
      border-top: 1px solid rgba(255,255,255,0.1);
    }
    .user-name { font-weight: 600; font-size: 13px; }
    .user-email { font-size: 11px; opacity: 0.75; margin: 1px 0 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .user-role { font-size: 11px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.5px; }
    .logout {
      margin-top: 12px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.2);
      color: #d6efe5;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      width: 100%;
      display: flex; align-items: center; justify-content: center; gap: 6px;
      white-space: nowrap;
    }
    .logout:hover { background: rgba(255,255,255,0.1); }

    @media (max-width: 767px) {
      .sidebar {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 999;
        width: 240px;
        transform: translateX(-100%);
        box-shadow: 2px 0 16px rgba(0,0,0,0.2);
      }
      .sidebar.mobile-open { transform: translateX(0); }
      /* En mobile el modo rail no aplica: siempre full-width cuando abierto */
      .sidebar.collapsed { width: 240px; }
      .sidebar.collapsed .label { display: inline; }
      .sidebar.collapsed .brand { justify-content: flex-start; padding: 20px; }
      .sidebar.collapsed .nav-item { justify-content: flex-start; padding: 10px 20px; gap: 12px; }
      .sidebar.collapsed .bottom { padding: 16px 20px; }
      .sidebar.collapsed .logout { padding: 6px 12px; }
    }
  `]
})
export class SidebarComponent {
  private navResaltado = inject(NavResaltadoService);
  resaltado = this.navResaltado.path;
  @Input() collapsed = false;
  @Input() mobileOpen = false;
  @Output() navItemClick = new EventEmitter<void>();

  private supabase = inject(SupabaseService);
  user$ = this.supabase.user$;
  items$ = this.supabase.role$.pipe(
    map(rol => rol ? MENU.filter(i => i.roles.includes(rol)) : [])
  );

  async logout() {
    await this.supabase.signOut();
    location.href = '/login';
  }
}
