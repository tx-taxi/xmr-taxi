import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { StorageService } from '@app/services/storage.service';
import { StateService } from '@app/services/state.service';
import { timezones } from '@app/app.constants';


const localizedTimezoneNames: Record<string, string> = {
  '-12': $localize`:@@taxi.timezone.minus12:Anywhere on Earth (AoE)`,
  '-11': $localize`:@@taxi.timezone.minus11:Samoa Standard Time (SST)`,
  '-10': $localize`:@@taxi.timezone.minus10:Hawaii Standard Time (HST)`,
  '-9': $localize`:@@taxi.timezone.minus9:Alaska Standard Time (AKST)`,
  '-8': $localize`:@@taxi.timezone.minus8:Pacific Standard Time (PST)`,
  '-7': $localize`:@@taxi.timezone.minus7:Mountain Standard Time (MST)`,
  '-6': $localize`:@@taxi.timezone.minus6:Central Standard Time (CST)`,
  '-5': $localize`:@@taxi.timezone.minus5:Eastern Standard Time (EST)`,
  '-4': $localize`:@@taxi.timezone.minus4:Atlantic Standard Time (AST)`,
  '-3': $localize`:@@taxi.timezone.minus3:Argentina Time (ART)`,
  '-2': $localize`:@@taxi.timezone.minus2:Fernando de Noronha Time (FNT)`,
  '-1': $localize`:@@taxi.timezone.minus1:Azores Time (AZOT)`,
  '+0': $localize`:@@taxi.timezone.plus0:Greenwich Mean Time (GMT)`,
  '+1': $localize`:@@taxi.timezone.plus1:Central European Time (CET)`,
  '+2': $localize`:@@taxi.timezone.plus2:Eastern European Time (EET)`,
  '+3': $localize`:@@taxi.timezone.plus3:Moscow Standard Time (MSK)`,
  '+4': $localize`:@@taxi.timezone.plus4:Armenia Time (AMT)`,
  '+5': $localize`:@@taxi.timezone.plus5:Pakistan Standard Time (PKT)`,
  '+6': $localize`:@@taxi.timezone.plus6:Xinjiang Time (XJT)`,
  '+7': $localize`:@@taxi.timezone.plus7:Indochina Time (ICT)`,
  '+8': $localize`:@@taxi.timezone.plus8:Hong Kong Time (HKT)`,
  '+9': $localize`:@@taxi.timezone.plus9:Japan Standard Time (JST)`,
  '+10': $localize`:@@taxi.timezone.plus10:Australian Eastern Standard Time (AEST)`,
  '+11': $localize`:@@taxi.timezone.plus11:Norfolk Time (NFT)`,
  '+12': $localize`:@@taxi.timezone.plus12:New Zealand Standard Time (NZST)`,
  '+13': $localize`:@@taxi.timezone.plus13:Tonga Time (TOT)`,
  '+14': $localize`:@@taxi.timezone.plus14:Line Islands Time (LINT)`,
};

@Component({
  selector: 'app-timezone-selector',
  templateUrl: './timezone-selector.component.html',
  styleUrls: ['./timezone-selector.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TimezoneSelectorComponent implements OnInit {
  timezoneForm: UntypedFormGroup;
  timezones = timezones.map(timezone => ({ ...timezone, name: localizedTimezoneNames[timezone.offset] || timezone.name }));
  utcTimezoneName = localizedTimezoneNames['+0'];
  localTimezoneOffset: string = '';
  localTimezoneName: string;

  constructor(
    private formBuilder: UntypedFormBuilder,
    private stateService: StateService,
    private storageService: StorageService,
  ) { }

  ngOnInit() {
    this.setLocalTimezone();
    this.timezoneForm = this.formBuilder.group({
      mode: ['local'],
    });
    this.stateService.timezone$.subscribe((mode) => {
      this.timezoneForm.get('mode')?.setValue(mode);
    });
  }

  changeMode() {
    const newMode = this.timezoneForm.get('mode')?.value;
    this.storageService.setValue('timezone-preference', newMode);
    this.stateService.timezone$.next(newMode);
  }

  setLocalTimezone() {
    const offset = new Date().getTimezoneOffset();
    const sign = offset <= 0 ? '+' : '-';
    const absOffset = Math.abs(offset);
    const hours = String(Math.floor(absOffset / 60));
    const minutes = String(absOffset % 60).padStart(2, '0');
    if (minutes === '00') {
      this.localTimezoneOffset = `${sign}${hours}`;
    } else {
      this.localTimezoneOffset = `${sign}${hours.padStart(2, '0')}:${minutes}`;
    }

    const timezone = this.timezones.find(tz => tz.offset === this.localTimezoneOffset);
    this.timezones = this.timezones.filter(tz => tz.offset !== this.localTimezoneOffset && tz.offset !== '+0');
    this.localTimezoneName = timezone ? timezone.name : '';
  }
}
