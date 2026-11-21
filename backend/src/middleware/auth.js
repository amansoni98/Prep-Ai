const jwt = require('jsonwebtoken');

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return s;
}

function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, secret(), { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

/** Verifies the Bearer token and exposes `req.userId` - every query must be scoped by it. */
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, secret());
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

module.exports = { auth, signToken };
