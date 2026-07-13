import { Component, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './sidebar.component';
import { ChatbotComponent } from '../chatbot/chatbot.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent, ChatbotComponent],
  template: `
    <div class="app-shell"
         [class.sidebar-collapsed]="collapsed()"
         [class.mobile-open]="mobileOpen()">

      <app-sidebar
        [collapsed]="collapsed()"
        [mobileOpen]="mobileOpen()"
        (navItemClick)="closeMobile()">
      </app-sidebar>

      <div class="overlay" *ngIf="mobileOpen()" (click)="closeMobile()"></div>

      <div class="app-main">
        <header class="topbar">
          <button class="toggle-btn" (click)="toggle()" aria-label="Toggle sidebar">
            <i class="pi pi-bars"></i>
          </button>
        </header>
        <main class="app-content">
          <router-outlet></router-outlet>
        </main>
      </div>

      <app-chatbot></app-chatbot>
    </div>
  `,
  styles: [`
    .app-shell {
      display: flex;
      height: 100vh;
      position: relative;
      overflow: hidden;
    }
    .app-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .topbar {
      height: 56px;
      background: white;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      padding: 0 12px;
      flex-shrink: 0;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
    .toggle-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 20px;
      color: #374151;
      padding: 8px 12px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .toggle-btn:hover { background: #f3f4f6; }
    .app-content {
      flex: 1;
      overflow: auto;
      background: #f9fafb;
    }
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      z-index: 998;
      display: none;
    }
    @media (max-width: 767px) {
      .app-shell.mobile-open .overlay { display: block; }
    }
  `]
})
export class MainLayoutComponent {
  collapsed = signal(false);
  mobileOpen = signal(false);

  private isMobile(): boolean {
    return typeof window !== 'undefined' && window.innerWidth < 768;
  }

  toggle(): void {
    if (this.isMobile()) {
      this.mobileOpen.update(v => !v);
    } else {
      this.collapsed.update(v => !v);
    }
  }

  closeMobile(): void {
    this.mobileOpen.set(false);
  }

  @HostListener('window:resize')
  onResize(): void {
    if (!this.isMobile()) this.mobileOpen.set(false);
  }
}
