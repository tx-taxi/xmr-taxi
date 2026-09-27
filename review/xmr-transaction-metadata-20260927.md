# XMR transaction metadata correction

## Report and observed behavior

The reported 2014 transaction is `69864a18238f8092268b4c39bbd96ead3cecdc77356c336b348e1ae5116c0ba3`. The former transaction adapter labeled every input/output as RingCT, omitted public metadata, read fees only from RingCT signatures, and used a pruned blob as transaction size. A block-list cache could also satisfy the detail page with incomplete synthetic inputs and outputs.

## Implementation

RingCT now requires transaction version 2 or later and a nonzero RingCT type. Legacy fees are the sum of public input amounts minus public output amounts. Miner transactions have zero fee and retain public output amounts. RingCT types follow Monero's `rctTypes.h`; CLSAG and Bulletproof+ are distinguished.

The detail page fetches a complete transaction response and opens public metadata by default. It shows inputs, key images, relative/absolute ring indices, ring members and originating transaction links, output keys and indices, available commitments/view tags, raw transaction extra, decoded extra fields and daemon JSON. Unknown or truncated extra fields preserve raw bytes and are labeled as incompletely decoded. Payment verification remains available below these sections.

The adapter requests full transaction data for detail pages, combines split serialized fields where available, and marks genuinely pruned responses explicitly. Fee rates use Monero weight rather than Bitcoin virtual size.

## Verified locally

- The reported transaction is version 1, has no RingCT, four inputs, three outputs, ring size one, 618 serialized bytes, and a 0.01 XMR fee. Public amounts sum to 2.5 XMR in and 2.49 XMR out. Its transaction public key and payment ID decode from the raw extra.
- A current RingCT type 6 transaction retained hidden amounts and displayed 16 ring members; a miner transaction retained its public reward and zero fee.
- Five focused backend suites passed (19 tests). These cover the demonstrated legacy behavior gap, modern/miner distinctions, extra parsing, ring enrichment and calendar aggregation.
- Backend and production frontend builds passed. Desktop/mobile browser checks showed the public metadata and activity chart without uncaught page errors.

## Limits and provenance

Ring membership is public; the explorer does not identify the real spent member or infer recipients. An RPC source that has pruned historical proofs may only return a pruned blob, which the interface labels accordingly. Extra fields not supported by the decoder remain available in the raw hex and JSON.

Protocol references: [Monero daemon RPC](https://www.getmonero.org/resources/developer-guides/daemon-rpc.html), [RingCT types](https://github.com/monero-project/monero/blob/master/src/ringct/rctTypes.h), [transaction extra](https://github.com/monero-project/monero/blob/master/src/cryptonote_basic/tx_extra.h), and [transaction weight](https://github.com/monero-project/monero/blob/master/src/cryptonote_basic/cryptonote_format_utils.cpp). The supplied p2pool reference page was unavailable during verification; transaction values were verified against daemon data instead.

Deployment verification is recorded separately after release; these local observations are not a claim of production verification.
