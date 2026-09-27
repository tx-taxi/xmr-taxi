import { transactionMetadata, transactionFee, transactionWeight, decodeTxExtra } from '../xmr-transaction';
import { IMoneroApi } from '../monero-api.interface';
const fixture = require('./fixtures/legacy-2014.json');

const legacy = JSON.parse(fixture.as_json) as IMoneroApi.TransactionJson;
describe('public Monero metadata across protocol versions', () => {
  it('preserves the public values and metadata of the reported 2014 transaction', () => {
    const tx = transactionMetadata(legacy, fixture.output_indices);
    expect(tx.ringct).toBe(false);
    expect(tx.fee).toBe(10_000_000_000);
    expect(tx.vin.map(v => v.amount)).toEqual([500_000_000_000, 1_000_000_000_000, 100_000_000_000, 900_000_000_000]);
    expect(tx.vout.map(v => v.value)).toEqual([90_000_000_000, 400_000_000_000, 2_000_000_000_000]);
    expect(tx.vout[0].scriptpubkey).toBe('72bdd2e55b47d6c548d7408c264d61353566d55b3bf6a0c3047e8d48293e2a94');
    expect(tx.tx_extra_fields).toContainEqual({ label: 'Payment ID', value: '50bc0d7b6a0b0fadadde358098f6484b2721f37b84ea7ef4c36a632f6b4d6f23' });
    expect(tx.tx_extra_fields).toContainEqual({ label: 'Transaction public key', value: '89e61737454417f61dbe8375e6338c1f61645bf6252e2a811052247ca970d101' });
    expect(transactionWeight(legacy, fixture.as_hex.length / 2)).toBe(618);
  });
  it('does not hide a modern miner reward or treat RingCT type zero as confidential', () => {
    const tx = { version: 2, unlock_time: 60, vin: [{ gen: { height: 0 } }], vout: [{ amount: 600_000_000_000, target: { key: 'a'.repeat(64) } }], extra: [], rct_signatures: { type: 0 } };
    const shaped = transactionMetadata(tx);
    expect(shaped.ringct).toBe(false);
    expect(shaped.vin[0].is_coinbase).toBe(true);
    expect(shaped.vout[0].value).toBe(600_000_000_000);
    expect(transactionFee(tx)).toBe(0);
  });
  it('preserves modern RingCT privacy and distinguishes CLSAG from Bulletproof+', () => {
    const tx = { ...legacy, version: 2, vin: [{ key: { amount: 0, key_offsets: [1, 2], k_image: 'b'.repeat(64) } }], vout: [{ amount: 0, target: { tagged_key: { key: 'c'.repeat(64), view_tag: '3d' } } }], rct_signatures: { type: 5, txnFee: 1234 } };
    const shaped = transactionMetadata(tx);
    expect(shaped.ringct).toBe(true);
    expect(shaped.vin[0].amount).toBeNull();
    expect(shaped.rct_type_name).toBe('CLSAG');
    expect(shaped.vout[0]).toMatchObject({ ringct: true, view_tag: '3d', scriptpubkey: 'c'.repeat(64) });
    expect(transactionMetadata({ ...tx, rct_signatures: { type: 6 } }).rct_type_name).toBe('Bulletproof+');
  });
  it('keeps unrecognized or truncated extra bytes available without inventing decoded fields', () => {
    expect(decodeTxExtra([1, 2, 3])).toEqual({ hex: '010203', fields: [], complete: false });
    expect(decodeTxExtra([250, 1, 2])).toEqual({ hex: 'fa0102', fields: [], complete: false });
  });
});
