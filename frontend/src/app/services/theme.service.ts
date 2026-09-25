import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { nativeMempoolFeeColors, defaultMempoolFeeColors } from '@app/app.constants';
import { StorageService } from '@app/services/storage.service';
import { StateService } from '@app/services/state.service';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly publicThemes = ['default', 'original'];
  style: HTMLLinkElement | null = null;
  theme: string = 'default';
  themeState$: BehaviorSubject<{ theme: string; loading: boolean; }>;
  mempoolFeeColors: string[] = nativeMempoolFeeColors;
  initialLoad: boolean = true;

  constructor(
    private storageService: StorageService,
    private stateService: StateService,
  ) {
    let theme = this.stateService.env.customize?.theme || this.storageService.getValue('theme-preference') || 'default';
    // theme preference must be a valid known public theme
    if (!this.stateService.env.customize?.theme && !this.publicThemes.includes(theme)) {
      theme = 'default';
      this.storageService.setValue('theme-preference', 'default');
    }
    this.storageService.removeItem('april-theme');
    this.storageService.removeItem('april-theme-backup');
    this.themeState$ = new BehaviorSubject({ theme, loading: false });
    this.apply(theme);
  }

  setTheme(theme: string): void {
    this.apply(this.publicThemes.includes(theme) ? theme : 'default');
  }

  private apply(theme: string): void {
    if (this.theme === theme) {
      return;
    }

    this.theme = theme;
    if (theme === 'default') {
      if (this.style) {
        this.style.remove();
        this.style = null;
      }
      if (!this.stateService.env.customize?.theme) {
        this.storageService.setValue('theme-preference', theme);
      }
      this.mempoolFeeColors = nativeMempoolFeeColors;
      this.themeState$.next({ theme, loading: false });
      return;
    }

    // Load theme stylesheet
    this.themeState$.next({ theme, loading: true });
    try {
      if (!this.style) {
        this.style = document.createElement('link');
        this.style.rel = 'stylesheet';
        if (this.initialLoad) {
          this.style.media = 'print'; // Prevent white flash and other CSS issues when using custom theme on initial app load in Safari
        }
        document.head.appendChild(this.style); // load the css now
      }

      this.style.onload = () => {
        if (this.initialLoad) {
          this.style.media = 'all';
          this.initialLoad = false;
        }
        this.mempoolFeeColors = defaultMempoolFeeColors;
        this.themeState$.next({ theme, loading: false });
      };
      this.style.onerror = () => this.apply('default');
      this.style.href = this.getThemeFile(theme);

      if (!this.stateService.env.customize?.theme) {
        this.storageService.setValue('theme-preference', theme);
      }
    } catch (err) {
      console.log('failed to apply theme stylesheet: ', err);
      this.apply('default');
    }
  }

  private getThemeFile(theme: string): string {
    if (theme === 'original') {
      return '/resources/mempool-original.css';
    }
    const themeFiles = (window as any).__env?.THEME_FILES;
    if (themeFiles?.[theme]) {
      return themeFiles[theme];
    }
    return `${theme}.css`;
  }

}
