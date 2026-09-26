import {BehaviorSubject, ReplaySubject, Subject} from 'rxjs';
import {nativeMempoolFeeColors} from '@app/app.constants';
export class StateService {
 env={KEEP_BLOCKS_AMOUNT:8,ROOT_NETWORK:'',BASE_MODULE:'mempool',BLOCK_WEIGHT_UNITS:4000000,MEMPOOL_BLOCKS_AMOUNT:8}; network=''; isBrowser=true; blockVSize=1000000; latestBlockHeight=0;
 blocks$=new ReplaySubject<any[]>(1); blocksSubject$=this.blocks$; chainTip$=new ReplaySubject<number>(1);
 mempoolBlocks$=new ReplaySubject<any[]>(1); difficultyAdjustment$=new ReplaySubject<any>(1);
 blockDisplayMode$=new BehaviorSubject('fees'); timeLtr=new BehaviorSubject(false); connectionState$=new BehaviorSubject(2);
 isLoadingWebSocket$=new BehaviorSubject(true);isLoadingMempool$=new BehaviorSubject(true);
 networkChanged$=new BehaviorSubject('');isTabHidden$=new BehaviorSubject(false);markBlock$=new Subject();txConfirmed$=new Subject(); keyNavigation$=new Subject();blockScrolling$=new BehaviorSubject(false);
 fiatCurrency$=new BehaviorSubject('USD');viewAmountMode$=new BehaviorSubject('xmr');conversions$=new BehaviorSubject({});rateUnits$=new BehaviorSubject('vb');
 isLiquid(){return false;}
}
export class CacheService {loadedBlocks$=new Subject();}
export class StorageService {getValue(){return 'fees';}setValue(){}}
export class ThemeService {mempoolFeeColors=nativeMempoolFeeColors;themeState$=new BehaviorSubject({theme:'default',loading:false});}
export class EtaService {mempoolPositionFromFees(){return null;}}
