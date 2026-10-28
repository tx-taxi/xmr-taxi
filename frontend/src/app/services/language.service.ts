import { DOCUMENT, getLocaleId } from '@angular/common';
import { LOCALE_ID, Inject, Injectable } from '@angular/core';
import { languages } from '@app/app.constants';
import { readSharedPreference, writeSharedPreference } from '@app/services/shared-preferences';

@Injectable({
  providedIn: 'root'
})
export class LanguageService {
  private language = 'en';
  private languages = languages;
  constructor(
    @Inject(DOCUMENT) private document: Document,
    @Inject(LOCALE_ID) private locale: string,
  ) {
    this.language = getLocaleId(this.locale).substring(0, 2);
    // Carry a previously selected host-only language into the shared setting,
    // but never replace an existing shared choice or navigate on page load.
    if (readSharedPreference('txtaxi_language') === null) {
      try {
        const raw = this.document.cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith('lang='));
        let legacy = raw ? decodeURIComponent(raw.substring(5)).toLowerCase() : '';
        if (legacy === 'en-us') { legacy = 'en'; }
        if (this.languages.some((entry) => entry.code === legacy)) { writeSharedPreference('txtaxi_language', legacy); }
      } catch { /* Ignore malformed or unavailable legacy cookies. */ }
    }
  }

  getLanguage(): string {
    return this.language;
  }

  stripLanguageFromUrl(urlPath: string) {
    let rawUrlPath = urlPath ? urlPath : document.location.pathname;
    const urlLanguage = this.document.location.pathname.split('/')[1];
    if (this.languages.map((lang) => lang.code).indexOf(urlLanguage) != -1) {
      rawUrlPath = rawUrlPath.substring(3);
    }
    return rawUrlPath;
  }

  getLanguageForUrl(): string {
    return this.language === 'en' ? '' : '/' + this.language;
  }

  setLanguage(language: string): void {
    if (!this.languages.some((entry) => entry.code === language)) { return; }
    writeSharedPreference('txtaxi_language', language);
    try {
      document.cookie = `lang=${language}; expires=Thu, 18 Dec 2050 12:00:00 UTC; path=/`;
    } catch (e) { }
  }
}
