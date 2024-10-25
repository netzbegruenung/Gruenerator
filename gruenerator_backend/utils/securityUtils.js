const crypto = require('crypto');

exports.generateSecureId = () => {
  return crypto.randomBytes(10).toString('hex');
};