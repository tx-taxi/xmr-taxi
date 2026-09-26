import '@angular/localize/init';
import '@angular/compiler';
import {nativeConnectionTemplate,nativeConnectionStyles} from 'native-status-template';
import { Component, NgModule, ApplicationRef, createComponent, createNgModule, importProvidersFrom, provideZonelessChangeDetection, Injector, Directive, Input, HostBinding, ElementRef, InjectionToken, Inject } from '@angular/core';
import {createApplication, ɵSharedStylesHost as SharedStylesHost} from '@angular/platform-browser';
import {CommonModule,DatePipe,DecimalPipe,Location,DOCUMENT} from '@angular/common';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {FontAwesomeModule,FaIconLibrary} from '@fortawesome/angular-fontawesome';
import {faExchangeAlt,faInfoCircle} from '@fortawesome/free-solid-svg-icons';
import {NgbTooltipModule,NgbTooltipConfig,NgbHighlight} from '@ng-bootstrap/ng-bootstrap';
import {Router} from '@angular/router';
import {StateService,CacheService,StorageService,ThemeService,EtaService} from './facade';
import {BlockchainComponent} from '@app/components/blockchain/blockchain.component';
import {BlockchainBlocksComponent} from '@app/components/blockchain-blocks/blockchain-blocks.component';
import {MempoolBlocksComponent} from '@app/components/mempool-blocks/mempool-blocks.component';
import {AmountComponent} from '@app/components/amount/amount.component';
import {TimeComponent} from '@app/components/time/time.component';
import {MiningPoolComponent} from '@app/shared/components/mining-pool/mining-pool.component';
import {FeeRateComponent} from '@app/shared/components/fee-rate/fee-rate.component';
import {FeeRoundingPipe} from '@app/shared/pipes/fee-rounding/fee-rounding.pipe';
import {RelativeUrlPipe} from '@app/shared/pipes/relative-url/relative-url.pipe';
import {BytesPipe} from '@app/shared/pipes/bytes-pipe/bytes.pipe';
import {CeilPipe} from '@app/shared/pipes/math-ceil/math-ceil.pipe';
import {FiatCurrencyPipe} from '@app/shared/pipes/fiat-currency.pipe';
import {AmountShortenerPipe} from '@app/shared/pipes/amount-shortener.pipe';
import {TimeService} from '@app/services/time.service';
const DESTINATION=new InjectionToken<string>('native-explorer-destination');
@Directive({selector:'[routerLink]',standalone:false})
class NativeLink { constructor(@Inject(DESTINATION) private destination:string){}  @Input() routerLink:any; @Input() state:any;@Input() fragment:string;@HostBinding('attr.href') get href(){const p=Array.isArray(this.routerLink)?this.routerLink.join('/'):this.routerLink;return this.destination+p+(this.fragment?'#'+this.fragment:'');}}
@Component({selector:'native-connection-status',standalone:false,template:nativeConnectionTemplate,styles:[nativeConnectionStyles,':host{position:absolute;right:12px;bottom:0;top:auto;z-index:4;font-size:1.25rem}']})
class NativeConnectionStatus {constructor(public state:StateService){}}
@Component({selector:'native-strip-root',standalone:false,styles:['.native-scroll{height:260px;overflow-x:auto;overflow-y:hidden;position:relative;scrollbar-width:none}.native-scroll::-webkit-scrollbar{display:none}'],template:'<div class="native-scroll" [dir]="state.timeLtr.value ? \'rtl\' : \'ltr\'" tabindex="0" aria-label="Recent and pending blocks. Scroll horizontally to explore."><p *ngIf="empty" role="status">No blocks available</p><app-blockchain style="display:block;position:relative" [style.left.px]="width < 768 ? width * (state.timeLtr.value ? 0.45 : -0.45) : 0" *ngIf="!empty" [containerWidth]="width" [pageIndex]="0" [scrollableMempool]="true" [minScrollWidth]="2560" (mempoolOffsetChange)="position($event)"></app-blockchain></div><native-connection-status role="status" [attr.aria-label]="statusDescription" [title]="statusDescription"></native-connection-status>'})
class Root { private offset=0; empty=false; statusDescription='Loading block data'; width=window.innerWidth;constructor(private element:ElementRef,public state:StateService){} position(offset:number){queueMicrotask(()=>{this.element.nativeElement.firstElementChild.scrollLeft+=(this.state.timeLtr.value?-1:1)*(offset-this.offset);this.offset=offset;});} }
@Directive({selector:'img[src]',standalone:false})
class NativeImage { constructor(private element:ElementRef,@Inject(DESTINATION) private destination:string){const descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');Object.defineProperty(element.nativeElement,'src',{configurable:true,get(){return descriptor.get.call(this);},set(value:string){if(value.startsWith('/resources/'))value=value.endsWith('/default.svg')?new URL('./default.svg',import.meta.url).href:destination+value;descriptor.set.call(this,value);}});}  @Input() set src(value:string){this.element.nativeElement.src=value.startsWith('/resources/')?this.destination+value:value;} }

@NgModule({imports:[CommonModule,BrowserAnimationsModule,FontAwesomeModule,NgbTooltipModule,NgbHighlight],declarations:[Root,NativeConnectionStatus,NativeLink,NativeImage,BlockchainComponent,BlockchainBlocksComponent,MempoolBlocksComponent,AmountComponent,TimeComponent,MiningPoolComponent,FeeRateComponent,FeeRoundingPipe,RelativeUrlPipe,BytesPipe,CeilPipe,FiatCurrencyPipe,AmountShortenerPipe],providers:[DatePipe,DecimalPipe,TimeService,FeeRoundingPipe,RelativeUrlPipe,StateService,CacheService,StorageService,ThemeService,EtaService,{provide:Location,useValue:{path:()=>''}},{provide:Router,useFactory:(origin:string)=>({navigate:(parts:any[])=>{const path=parts.join('/');if(/^\/(block|mempool-block|tx|address|docs|mining)\//.test(path))location.assign(origin+path);}}),deps:[DESTINATION]}]})
class StripModule {}
export async function mount(host:HTMLElement, options:any={}) {
 const destination=options.destination||'https://xmr.tx.taxi'; if(!/^https:\/\/[a-z0-9.-]+$/.test(destination))throw new Error('Invalid native destination');
 const shadow=host.shadowRoot||host.attachShadow({mode:'open'});shadow.replaceChildren();const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./strip.css',import.meta.url).href;shadow.append(css);
 const resourceError=(event:any)=>{const image=event.target;if(image instanceof HTMLImageElement && image.src.startsWith(location.origin+'/resources/'))image.src=destination+new URL(image.src).pathname;};shadow.addEventListener('error',resourceError,true);
 const root=document.createElement('native-strip-root');root.className='native-scope ltr-layout';shadow.append(root);
 const overlay=document.createElement('div');overlay.className='native-overlays';shadow.append(overlay);
 const scopedDocument=new Proxy(document,{get(target,key){if(key==='body')return overlay;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 const app=await createApplication({providers:[importProvidersFrom(StripModule),{provide:DOCUMENT,useValue:scopedDocument},provideZonelessChangeDetection(),{provide:DESTINATION,useValue:destination}]});const mod={injector:app.injector,destroy(){}};mod.injector.get(FaIconLibrary).addIcons(faExchangeAlt,faInfoCircle);
 mod.injector.get(SharedStylesHost).removeHost(document.head);mod.injector.get(SharedStylesHost).addHost(shadow as any);
 const cmp=createComponent(Root,{environmentInjector:mod.injector,hostElement:root});app.attachView(cmp.hostView);const state=mod.injector.get(StateService);cmp.instance.width=host.clientWidth;cmp.changeDetectorRef.detectChanges();
 const resize=new ResizeObserver(()=>{cmp.instance.width=host.clientWidth;cmp.changeDetectorRef.detectChanges();});resize.observe(host);
 let currentBlocks:any[]=[];let hasBlocks=false,hasMempool=false,wasDisconnected=false;
 return {setStatus(detail:any){
 const status=detail?.state||'loading';
 if(status==='stale'||status==='unavailable')wasDisconnected=true;
 const connection=status==='live'?2:status==='unavailable'?0:status==='stale'||wasDisconnected?1:2;
 state.connectionState$.next(connection);
 if(status==='live')wasDisconnected=false;
 // Preserve the actual native strip's retained data on disconnect; only missing feeds stay skeletons.
 state.isLoadingWebSocket$.next(!hasBlocks);state.isLoadingMempool$.next(!hasMempool);
 const received=Number.isFinite(detail?.updatedAt)?'; last received '+new Date(detail.updatedAt).toISOString():'';
 cmp.instance.statusDescription=(status==='live'?'Live block data':status==='stale'?'Reconnecting; showing last received blocks':status==='unavailable'?'Offline; block stream unavailable':'Loading block data')+received;
 cmp.changeDetectorRef.detectChanges();
 },update(data:any){if(Array.isArray(data.blocks)||data.block)hasBlocks=true;if(Array.isArray(data.mempoolBlocks))hasMempool=true;if(Array.isArray(data.blocks)){cmp.instance.empty=data.blocks.length===0;cmp.changeDetectorRef.detectChanges();}if(data.block){currentBlocks=[data.block,...currentBlocks.filter(b=>b.height<data.block.height)].slice(0,8);data={...data,blocks:currentBlocks};}if(data.blocks?.length)currentBlocks=data.blocks;if(data.blocks?.length){state.latestBlockHeight=data.blocks[0].height;state.chainTip$.next(data.blocks[0].height);state.blocks$.next(structuredClone(data.blocks));state.isLoadingWebSocket$.next(false);}if(data.mempoolBlocks){state.mempoolBlocks$.next(structuredClone(data.mempoolBlocks));state.isLoadingMempool$.next(false);}if(data.difficultyAdjustment)state.difficultyAdjustment$.next(data.difficultyAdjustment);cmp.changeDetectorRef.detectChanges();},destroy(){resize.disconnect();shadow.removeEventListener('error',resourceError,true);mod.injector.get(SharedStylesHost).removeHost(shadow as any);cmp.destroy();mod.destroy();app.destroy();}};
}
