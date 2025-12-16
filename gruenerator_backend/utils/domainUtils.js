const ALLOWED_DOMAINS = [
  'gruenerator.de',
  'www.gruenerator.de',
  'beta.gruenerator.de',
  'gruenerator.at',
  'www.gruenerator.at',
  'gruenerator.eu',
  'www.gruenerator.eu',
  'gruenerator-test.de',
  'www.gruenerator-test.de',
  'gruenerator.netzbegruenung.verdigado.net',
  'gruenerator-test.netzbegruenung.verdigado.net',
  'xn--grnerator-z2a.de',
  'www.xn--grnerator-z2a.de',
  'beta.xn--grnerator-z2a.de',
  'localhost',
  '127.0.0.1'
];

function getOriginDomain(req) {
  const forwardedHost = req.headers['x-forwarded-host'];
  const host = forwardedHost || req.headers.host || 'localhost:3000';
  return host;
}

function getOriginDomainWithoutPort(req) {
  const domain = getOriginDomain(req);
  return domain.split(':')[0];
}

function isAllowedDomain(domain) {
  const domainWithoutPort = domain.split(':')[0];
  return ALLOWED_DOMAINS.some(allowed =>
    domainWithoutPort === allowed ||
    domainWithoutPort.endsWith('.' + allowed)
  );
}

function buildDomainUrl(domain, path = '', isSecure = true) {
  const protocol = isSecure ? 'https' : 'http';
  const normalizedPath = path.startsWith('/') ? path : (path ? '/' + path : '');
  return `${protocol}://${domain}${normalizedPath}`;
}

function getLocaleFromDomain(domain) {
  const domainLower = domain.toLowerCase();
  if (domainLower.includes('.at') || domainLower.includes('gruenerator.at')) {
    return 'de-AT';
  }
  return 'de-DE';
}

module.exports = {
  ALLOWED_DOMAINS,
  getOriginDomain,
  getOriginDomainWithoutPort,
  isAllowedDomain,
  buildDomainUrl,
  getLocaleFromDomain
};
