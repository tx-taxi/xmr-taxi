/** Conservative, one-shot warm strip hydration. Live websocket initialization remains authoritative. */
export function readHubSnapshot(value: unknown, chainId: string, now = Date.now()): any | null {
  try {
    if (!value || typeof value !== 'object') return null;
    const envelope = value as any;
    if (envelope.version !== 1 || envelope.chainId !== chainId || !Number.isFinite(envelope.capturedAt)
      || now - envelope.capturedAt < 0 || now - envelope.capturedAt > 30000) return null;
    if (new TextEncoder().encode(JSON.stringify(envelope)).byteLength > 262144) return null;
    const snapshot = envelope.snapshot;
    const nonnegative = (n: unknown): boolean => typeof n === 'number' && Number.isFinite(n) && n >= 0;
    const fees = (a: unknown): boolean => Array.isArray(a) && a.length >= 1 && a.length <= 128 && a.every(nonnegative);
    if (!snapshot || !Array.isArray(snapshot.blocks) || snapshot.blocks.length < 1 || snapshot.blocks.length > 8
      || !Array.isArray(snapshot.mempoolBlocks) || snapshot.mempoolBlocks.length > 8) return null;
    for (let i = 0; i < snapshot.blocks.length; i++) {
      const block = snapshot.blocks[i];
      if (!block || typeof block.id !== 'string' || !/^(?:0x)?[a-f0-9]{64}$/i.test(block.id)
        || !Number.isSafeInteger(block.height) || block.height < 0
        || !Number.isSafeInteger(block.timestamp) || block.timestamp <= 0
        || !Number.isSafeInteger(block.tx_count) || block.tx_count < 0
        || !nonnegative(block.size) || !nonnegative(block.weight)
        || (i > 0 && block.height !== snapshot.blocks[i - 1].height - 1)) return null;
      if (block.extras && (!nonnegative(block.extras.medianFee) || !nonnegative(block.extras.totalFees)
        || !fees(block.extras.feeRange))) return null;
    }
    if (!snapshot.mempoolBlocks.every((block: any) => block && nonnegative(block.blockSize)
      && nonnegative(block.blockVSize) && Number.isSafeInteger(block.nTx) && block.nTx >= 0
      && nonnegative(block.totalFees) && nonnegative(block.medianFee) && fees(block.feeRange))) return null;
    if (snapshot.difficultyAdjustment !== undefined && (!snapshot.difficultyAdjustment
      || !nonnegative(snapshot.difficultyAdjustment.adjustedTimeAvg)
      || !Number.isFinite(snapshot.difficultyAdjustment.timeOffset))) return null;
    return structuredClone(snapshot);
  } catch { return null; }
}
