import nacl from 'tweetnacl';
import bs58 from 'bs58';

/**
 * Fields bound into a Sign-In With Solana style challenge message. The server
 * authors the full message text (see buildSiwsMessage) so nothing about the
 * signed bytes is client-controlled — domain binding is the anti-phishing part.
 */
export interface SiwsFields {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  nonce: string;
  issuedAt: string; // ISO-8601
  expirationTime: string; // ISO-8601
}

/**
 * Deterministic SIWS-style message. The wallet signs these exact UTF-8 bytes
 * via `signMessage`; the server rebuilds the identical string from the stored
 * challenge and verifies against it. Any drift in this template is a breaking
 * change to the signed payload — keep it byte-stable.
 */
export function buildSiwsMessage(f: SiwsFields): string {
  return (
    `${f.domain} wants you to sign in with your Solana account:\n` +
    `${f.address}\n\n` +
    `${f.statement}\n\n` +
    `URI: ${f.uri}\n` +
    `Nonce: ${f.nonce}\n` +
    `Issued At: ${f.issuedAt}\n` +
    `Expiration Time: ${f.expirationTime}`
  );
}

/**
 * Verify an ed25519 signature over `message` by the account `address`, all as
 * the wallet produced them:
 *   - `message`   the exact text that was signed (server-authored)
 *   - `signatureB58` base58 of the 64-byte signature
 *   - `addressB58`   base58 of the 32-byte public key (the wallet address)
 *
 * Returns false (never throws) on any malformed input — a bad signature and a
 * garbage-encoded key are the same "not authenticated" outcome to the caller.
 */
export function verifySiwsSignature(
  message: string,
  signatureB58: string,
  addressB58: string,
): boolean {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const signature = bs58.decode(signatureB58);
    const publicKey = bs58.decode(addressB58);
    if (signature.length !== 64 || publicKey.length !== 32) return false;
    return nacl.sign.detached.verify(messageBytes, signature, publicKey);
  } catch {
    return false;
  }
}
