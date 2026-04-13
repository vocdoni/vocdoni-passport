import { parseProofRequestPayload, resolveProofRequestPayload } from '../src/utils/requestLinks';
import { fetchProofRequestPayload } from '../src/services/ServerClient';

jest.mock('../src/services/ServerClient', () => ({
  fetchProofRequestPayload: jest.fn(),
}));

const mockedFetchProofRequestPayload = jest.mocked(fetchProofRequestPayload);

const MOCK_PAYLOAD = {
  kind: 'vocdoni-passport-request',
  version: 1,
  aggregateUrl: 'https://nomad.dabax.net/api/proofs/aggregate',
};

describe('requestLinks', () => {
  beforeEach(() => {
    mockedFetchProofRequestPayload.mockReset();
  });

  describe('parseProofRequestPayload', () => {
    it('parses embedded request payload links locally', () => {
      const payload = {
        kind: 'vocdoni-passport-request',
        version: 1,
        aggregateUrl: 'https://nomad.dabax.net/api/proofs/aggregate',
        petitionId: '69dc1a09ef71bbf1140d43e5',
      };
      const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

      expect(
        parseProofRequestPayload(`https://vocdoni.link/passport?request=${encoded}`),
      ).toEqual(payload);
      expect(mockedFetchProofRequestPayload).not.toHaveBeenCalled();
    });
  });

  describe('resolveProofRequestPayload — vocdoni.link compact links', () => {
    it('resolves compact petition deeplinks to the upstream petition JSON endpoint', async () => {
      mockedFetchProofRequestPayload.mockResolvedValue(MOCK_PAYLOAD as any);

      const sign = Buffer.from('nomad.dabax.net|69dc1a09ef71bbf1140d43e5', 'utf8').toString('base64url');
      const result = await resolveProofRequestPayload(`https://vocdoni.link/passport?sign=${sign}`);

      expect(mockedFetchProofRequestPayload).toHaveBeenCalledWith(
        'https://nomad.dabax.net/petition/69dc1a09ef71bbf1140d43e5',
      );
      expect(result).toEqual(MOCK_PAYLOAD);
    });

    it('accepts passport links with a trailing slash', async () => {
      mockedFetchProofRequestPayload.mockResolvedValue(MOCK_PAYLOAD as any);

      const sign = Buffer.from('nomad.dabax.net|69dc1a09ef71bbf1140d43e5', 'utf8').toString('base64url');
      await resolveProofRequestPayload(`https://vocdoni.link/passport/?sign=${sign}`);

      expect(mockedFetchProofRequestPayload).toHaveBeenCalledWith(
        'https://nomad.dabax.net/petition/69dc1a09ef71bbf1140d43e5',
      );
    });

    it('handles standard (non-URL-safe) base64 in the sign parameter', async () => {
      mockedFetchProofRequestPayload.mockResolvedValue(MOCK_PAYLOAD as any);

      // Standard base64 uses + and / instead of - and _
      const signUrlSafe = Buffer.from('nomad.dabax.net|69dc1a09ef71bbf1140d43e5', 'utf8').toString('base64url');
      const signStandard = signUrlSafe.replace(/-/g, '+').replace(/_/g, '/');
      await resolveProofRequestPayload(`https://vocdoni.link/passport?sign=${encodeURIComponent(signStandard)}`);

      expect(mockedFetchProofRequestPayload).toHaveBeenCalledWith(
        'https://nomad.dabax.net/petition/69dc1a09ef71bbf1140d43e5',
      );
    });

    it('throws a clear error when the sign parameter is missing', async () => {
      await expect(
        resolveProofRequestPayload('https://vocdoni.link/passport'),
      ).rejects.toThrow('Passport link is missing sign payload');
    });

    it('throws a clear error when the sign payload is malformed', async () => {
      const badSign = Buffer.from('no-separator-here', 'utf8').toString('base64url');
      await expect(
        resolveProofRequestPayload(`https://vocdoni.link/passport?sign=${badSign}`),
      ).rejects.toThrow('Passport link signature is invalid');
    });

    it('does not match non-passport vocdoni.link paths', async () => {
      mockedFetchProofRequestPayload.mockResolvedValue(MOCK_PAYLOAD as any);

      // /other should fall through to the direct-fetch path
      await resolveProofRequestPayload('https://vocdoni.link/other');

      expect(mockedFetchProofRequestPayload).toHaveBeenCalledWith('https://vocdoni.link/other');
    });
  });

  describe('resolveProofRequestPayload — direct petition URLs', () => {
    it('fetches direct petition URLs as JSON requests', async () => {
      mockedFetchProofRequestPayload.mockResolvedValue(MOCK_PAYLOAD as any);

      await resolveProofRequestPayload('https://nomad.dabax.net/petition/69dc1a09ef71bbf1140d43e5');

      expect(mockedFetchProofRequestPayload).toHaveBeenCalledWith(
        'https://nomad.dabax.net/petition/69dc1a09ef71bbf1140d43e5',
      );
    });
  });

  describe('resolveProofRequestPayload — error cases', () => {
    it('throws on empty input', async () => {
      await expect(resolveProofRequestPayload('')).rejects.toThrow('Empty request payload');
    });

    it('throws a clear error on plain non-URL text', async () => {
      await expect(resolveProofRequestPayload('not a url or json')).rejects.toThrow(
        'Request is neither valid JSON nor a valid URL',
      );
    });
  });
});
