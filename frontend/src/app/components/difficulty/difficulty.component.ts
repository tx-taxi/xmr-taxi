import { ChangeDetectionStrategy, Component, Input, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { StateService } from '@app/services/state.service';
import { BlockPacePoint } from '@components/block-pace-graph/block-pace-graph.component';

const TARGET_BLOCK_SECONDS = 120;

interface DifficultyStatus {
  averageBlockTime: number | null;
  pacePercent: number | null;
  difficultyChangePercent: number | null;
}

@Component({
  selector: 'app-difficulty',
  templateUrl: './difficulty.component.html',
  styleUrls: ['./difficulty.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DifficultyComponent implements OnInit {
  @Input() showTitle = true;
  mode: 'difficulty' | 'rewards' = 'difficulty';
  status$: Observable<DifficultyStatus>;
  isLoadingWebSocket$: Observable<boolean>;
  paceData: BlockPacePoint[] = [];

  private blockHistory = new Map<number, { timestamp: number; difficulty: number }>();

  constructor(public stateService: StateService) {}

  ngOnInit(): void {
    this.isLoadingWebSocket$ = this.stateService.isLoadingWebSocket$;
    this.status$ = this.stateService.blocks$.pipe(map(blocks => {
      const recent = [...blocks]
        .filter(block => Number.isFinite(block.height) && Number.isFinite(block.timestamp))
        .sort((a, b) => a.height - b.height);
      const first = recent[0];
      const last = recent[recent.length - 1];
      if (!first || !last) return { averageBlockTime: null, pacePercent: null, difficultyChangePercent: null };

      for (const block of recent) {
        this.blockHistory.set(block.height, { timestamp: block.timestamp, difficulty: block.difficulty });
      }
      for (const height of this.blockHistory.keys()) {
        if (height > last.height || height < last.height - 99) this.blockHistory.delete(height);
      }
      const history = [...this.blockHistory.entries()].sort(([a], [b]) => a - b);
      const [baselineHeight, baseline] = history[0];
      this.paceData = history.map(([height, block]) => ({
        height,
        timestamp: block.timestamp,
        deviation: (height - baselineHeight) * TARGET_BLOCK_SECONDS - (block.timestamp - baseline.timestamp),
      }));

      const intervals = last.height - first.height;
      const elapsed = last.timestamp - first.timestamp;
      const averageBlockTime = intervals > 0 && elapsed > 0 ? elapsed / intervals : null;
      const pacePercent = averageBlockTime === null ? null : (1 - averageBlockTime / TARGET_BLOCK_SECONDS) * 100;
      const difficultyChangePercent = Number.isFinite(first.difficulty) && first.difficulty > 0 && Number.isFinite(last.difficulty)
        ? (last.difficulty / first.difficulty - 1) * 100
        : null;
      return { averageBlockTime, pacePercent, difficultyChangePercent };
    }));
  }

  setMode(mode: 'difficulty' | 'rewards'): boolean {
    this.mode = mode;
    return false;
  }
}
