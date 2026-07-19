import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { buildSiwsMessage, verifySiwsSignature, SiwsFields } from './siws';

function fields(overrides: Partial<SiwsFields> = {}): SiwsFields {
  return {
    domain: 'gutcall.fun',
    address: 'PLACEHOLDER',
    statement:
      'Sign in to GutCall. This request will not trigger a transaction or cost any fees.',
    uri: 'https://gutcall.fun',
    nonce: 'abc123',
    issuedAt: '2026-07-18T00:00:00.000Z',
    expirationTime: '2026-07-18T00:05:00.000Z',
    ...overrides,
  };
}

describe('siws', () => {
  const keypair = nacl.sign.keyPair();
  const address = bs58.encode(keypair.publicKey);

  function sign(message: string): string {
    const sig = nacl.sign.detached(
      new TextEncoder().encode(message),
      keypair.secretKey,
    );
    return bs58.encode(sig);
  }

  it('buildSiwsMessage binds domain, address and nonce into a stable template', () => {
    const msg = buildSiwsMessage(fields({ address }));
    expect(msg).toContain(
      'gutcall.fun wants you to sign in with your Solana account:',
    );
    expect(msg).toContain(address);
    expect(msg).toContain('Nonce: abc123');
  });

  it('verifies a genuine signature over the exact message', () => {
    const msg = buildSiwsMessage(fields({ address }));
    expect(verifySiwsSignature(msg, sign(msg), address)).toBe(true);
  });

  it('rejects a signature over a tampered message', () => {
    const msg = buildSiwsMessage(fields({ address }));
    const signature = sign(msg);
    const tampered = buildSiwsMessage(fields({ address, nonce: 'DIFFERENT' }));
    expect(verifySiwsSignature(tampered, signature, address)).toBe(false);
  });

  it('rejects a signature that belongs to a different keypair', () => {
    const msg = buildSiwsMessage(fields({ address }));
    const other = nacl.sign.keyPair();
    const otherSig = bs58.encode(
      nacl.sign.detached(new TextEncoder().encode(msg), other.secretKey),
    );
    expect(verifySiwsSignature(msg, otherSig, address)).toBe(false);
  });

  it('returns false (never throws) on malformed base58 input', () => {
    const msg = buildSiwsMessage(fields({ address }));
    expect(verifySiwsSignature(msg, 'not-base58-0OIl', address)).toBe(false);
    expect(verifySiwsSignature(msg, sign(msg), 'not-a-key')).toBe(false);
  });
});
