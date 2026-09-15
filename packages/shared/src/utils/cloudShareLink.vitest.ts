import { describe, expect, it } from 'vitest';

import {
  checkCloudShareLink,
  isCloudShareUrl,
  looksLikeCloudSharePath,
  parseCloudShareLink,
} from './cloudShareLink.js';

describe('parseCloudShareLink', () => {
  it('splits a Grüne-Wolke link into base and token', () => {
    expect(parseCloudShareLink('https://wolke.netzbegruenung.de/s/AbCdEfGhIj')).toEqual({
      baseUrl: 'https://wolke.netzbegruenung.de',
      shareToken: 'AbCdEfGhIj',
      fullPath: '/s/AbCdEfGhIj',
    });
  });

  // The whole point of having one parser: the host is not part of the contract.
  // A Teamtools or LV-run Nextcloud must parse exactly the same way.
  it('accepts any Nextcloud host, not just the Grüne Wolke', () => {
    expect(parseCloudShareLink('https://teamtools.example.org/s/Xy12Ab')?.baseUrl).toBe(
      'https://teamtools.example.org'
    );
  });

  it('accepts an instance running under a sub-path', () => {
    const parsed = parseCloudShareLink('https://example.org/nextcloud/s/Tok123');
    expect(parsed?.shareToken).toBe('Tok123');
    expect(parsed?.baseUrl).toBe('https://example.org');
  });

  it('keeps query and fragmentless path for callers that pass the link on', () => {
    expect(parseCloudShareLink('https://w.example/s/Tok123?foo=1')?.fullPath).toBe(
      '/s/Tok123?foo=1'
    );
  });

  it('rejects a link without a share token', () => {
    expect(parseCloudShareLink('https://wolke.netzbegruenung.de/apps/files')).toBeNull();
  });

  it('rejects anything that is not a URL', () => {
    expect(parseCloudShareLink('wolke.netzbegruenung.de/s/AbCdEf')).toBeNull();
    expect(parseCloudShareLink('')).toBeNull();
  });
});

describe('checkCloudShareLink', () => {
  it('names the problem instead of returning a message', () => {
    expect(checkCloudShareLink('   ')).toEqual({ ok: false, problem: 'empty' });
    expect(checkCloudShareLink('not a url')).toEqual({ ok: false, problem: 'not_a_url' });
    expect(checkCloudShareLink('https://example.org/files')).toEqual({
      ok: false,
      problem: 'no_share_token',
    });
  });

  it('carries the parsed link on success', () => {
    const check = checkCloudShareLink('https://w.example/s/Tok123');
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.parsed.shareToken).toBe('Tok123');
  });
});

describe('isCloudShareUrl', () => {
  // This is the gate that keeps a pasted share link out of the scrape_url path,
  // where it would fetch the Nextcloud SPA shell instead of the folder.
  it('recognises a share link typed into a sentence', () => {
    expect(isCloudShareUrl('https://wolke.netzbegruenung.de/s/AbCdEfGhIj')).toBe(true);
  });

  it('leaves ordinary pages to the web crawler', () => {
    expect(isCloudShareUrl('https://gruene.de/programm')).toBe(false);
    expect(isCloudShareUrl('https://wolke.netzbegruenung.de/apps/files/')).toBe(false);
  });
});

describe('looksLikeCloudSharePath', () => {
  // The live failure this guards: the model cut `s/<token>` out of a pasted
  // share URL and passed it as a file path for cloud_files read.
  it('catches a bare share-URL path in all its spellings', () => {
    expect(looksLikeCloudSharePath('s/AbCdEf')).toBe(true);
    expect(looksLikeCloudSharePath('/s/AbCdEf')).toBe(true);
    expect(looksLikeCloudSharePath('s/AbCdEf/')).toBe(true);
    expect(looksLikeCloudSharePath('index.php/s/AbCdEf')).toBe(true);
  });

  it('catches a full share URL passed as a path', () => {
    expect(looksLikeCloudSharePath('https://wolke.netzbegruenung.de/s/AbCdEfGhIj')).toBe(true);
  });

  it('leaves ordinary folder and file paths alone', () => {
    expect(looksLikeCloudSharePath('Anträge/2026')).toBe(false);
    expect(looksLikeCloudSharePath('Ordner/s/unterordner')).toBe(false);
    expect(looksLikeCloudSharePath('rede.pdf')).toBe(false);
    expect(looksLikeCloudSharePath('')).toBe(false);
  });
});
