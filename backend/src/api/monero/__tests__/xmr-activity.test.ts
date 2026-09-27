import { aggregateActivity, nextPeriod, periodStart } from '../xmr-activity';
const seconds = (date: string) => Date.parse(date) / 1000;
describe('Monero transaction activity calendar counts', () => {
  it('sums each hour once across month/year boundaries and marks the current period partial', () => {
    const hours: [number, number, number][] = [
      [seconds('2023-12-31T23:00:00Z'), 10, 3], [seconds('2024-01-01T00:00:00Z'), 20, 5], [seconds('2024-01-01T01:00:00Z'), 7, 2],
    ];
    const buckets = aggregateActivity(hours, 'year', hours[0][0], seconds('2024-01-01T01:30:00Z'));
    expect(buckets.map(b => b.transactions)).toEqual([10, 27]);
    expect(buckets[1]).toMatchObject({ blocks: 7, partial: true });
    expect(buckets.reduce((sum, b) => sum + b.transactions, 0)).toBe(37);
  });
  it('includes zero-transaction hours and observes leap-year calendar months', () => {
    const start = seconds('2024-02-29T00:00:00Z');
    expect(aggregateActivity([[start, 9, 2]], 'hour', start, start + 7200).map(b => b.transactions)).toEqual([9, 0, 0]);
    expect(nextPeriod(periodStart(start, 'month'), 'month')).toBe(seconds('2024-03-01T00:00:00Z'));
  });
});
