import { IMoneroApi } from './monero-api.interface';
import { decodeRingMemberIndices } from './xmr-rings';

const RCT_NAMES = ['None', 'Full', 'Simple', 'Bulletproof', 'Bulletproof2', 'CLSAG', 'Bulletproof+'];

export function transactionFee(tx: IMoneroApi.TransactionJson): number {
  if (tx.vin.some(v => v.gen)) return 0;
  if (tx.version === 1) {
    const inputs = tx.vin.reduce((sum, v) => sum + BigInt(v.key?.amount ?? 0), 0n);
    const outputs = tx.vout.reduce((sum, v) => sum + BigInt(v.amount), 0n);
    return Number(inputs - outputs);
  }
  return tx.rct_signatures?.txnFee ?? 0;
}

// Tags follow monero-project/monero src/cryptonote_basic/tx_extra.h.
// Preserve the raw bytes even if a future/unknown tag stops decoding.
export function decodeTxExtra(extra: number[] = []): { hex: string; fields: Array<{ label: string; value: string }>; complete: boolean } {
  const bytes = Buffer.from(extra);
  const fields: Array<{ label: string; value: string }> = [];
  let offset = 0;
  const take = (size: number): Buffer => {
    if (!Number.isSafeInteger(size) || size < 0 || offset + size > bytes.length) throw new Error('Truncated extra');
    const result = bytes.subarray(offset, offset + size); offset += size; return result;
  };
  const varint = (): number => {
    let n = 0n, shift = 0n;
    for (let i = 0; i < 10; i++) {
      const b = take(1)[0]; n |= BigInt(b & 127) << shift;
      if (!(b & 128)) { if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Oversized extra'); return Number(n); }
      shift += 7n;
    }
    throw new Error('Invalid varint');
  };
  try {
    while (offset < bytes.length) {
      const tag = take(1)[0];
      if (tag === 0) {
        let count = 1; while (offset < bytes.length && bytes[offset] === 0) { offset++; count++; }
        fields.push({ label: 'Padding', value: `${count} bytes` });
      } else if (tag === 1) fields.push({ label: 'Transaction public key', value: take(32).toString('hex') });
      else if (tag === 2) {
        const nonce = take(varint());
        const payment = nonce[0] === 0 && nonce.length === 33;
        const encrypted = nonce[0] === 1 && nonce.length === 9;
        fields.push({ label: payment ? 'Payment ID' : encrypted ? 'Encrypted payment ID' : 'Extra nonce', value: (payment || encrypted ? nonce.subarray(1) : nonce).toString('hex') });
      } else if (tag === 4) {
        const count = varint();
        if (count > Math.floor((bytes.length - offset) / 32)) throw new Error('Truncated public keys');
        for (let i = 0; i < count; i++) fields.push({ label: `Additional public key ${i + 1}`, value: take(32).toString('hex') });
      } else if (tag === 3 || tag === 222) {
        fields.push({ label: tag === 3 ? 'Merge-mining data' : 'MinerGate data', value: take(varint()).toString('hex') });
      } else throw new Error('Unknown extra tag');
    }
    return { hex: bytes.toString('hex'), fields, complete: true };
  } catch { return { hex: bytes.toString('hex'), fields, complete: false }; }
}

/** Public chain metadata: legacy/coinbase amounts are visible; RingCT amounts are not. */
export function transactionMetadata(tx: IMoneroApi.TransactionJson, outputIndices: number[] = []) {
  const ringct = tx.version >= 2 && (tx.rct_signatures?.type ?? 0) > 0;
  const extra = decodeTxExtra(tx.extra);
  return {
    version: tx.version, locktime: tx.unlock_time, fee: transactionFee(tx),
    ringct, rct_type: tx.rct_signatures?.type ?? 0,
    rct_type_name: RCT_NAMES[tx.rct_signatures?.type ?? 0] ?? 'Unknown',
    has_view_tags: tx.vout.some(v => v.target?.tagged_key?.view_tag !== undefined),
    tx_extra: extra.hex, tx_extra_fields: extra.fields, tx_extra_complete: extra.complete,
    vin: tx.vin.map(v => ({
      is_coinbase: !!v.gen, coinbase_height: v.gen?.height, ringct,
      amount: v.key && !ringct ? v.key.amount : null,
      ring_size: v.key?.key_offsets?.length ?? null,
      key_image: v.key?.k_image ?? '', ring_offsets: v.key?.key_offsets ?? [],
      ring_indices: decodeRingMemberIndices(v.key?.key_offsets ?? []),
      prevout: null, scriptsig: '', scriptsig_asm: '', sequence: 0, witness: [],
    })),
    vout: tx.vout.map((v, i) => ({
      ringct, value: ringct ? 0 : v.amount,
      scriptpubkey: v.target?.tagged_key?.key || v.target?.key || '',
      scriptpubkey_asm: '', scriptpubkey_address: '', scriptpubkey_type: 'stealth_key',
      view_tag: v.target?.tagged_key?.view_tag ?? null, global_index: outputIndices[i] ?? null,
      commitment: tx.rct_signatures?.outPk?.[i] ?? null,
    })),
  };
}

/** Monero's serialized size plus the Bulletproof weight adjustment. */
export function transactionWeight(tx: IMoneroApi.TransactionJson, size: number): number {
  const type = tx.rct_signatures?.type ?? 0;
  if (type < 3 || tx.vout.length <= 2) return size;
  const padded = 2 ** Math.ceil(Math.log2(tx.vout.length));
  const terms = type === 6 ? 6 : 9;
  const base = 32 * (terms + 14) / 2;
  const proof = 32 * (terms + 2 * (6 + Math.log2(padded)));
  return size + Math.floor((base * padded - proof) * 4 / 5);
}
