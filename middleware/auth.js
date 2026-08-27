const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set. Refusing to start — see README for required environment variables.");
}

// Verifies the bearer token on every protected request. This is the part that
// actually matters for security: it runs on the SERVER, not in the browser,
// so it can't be bypassed by editing client-side JavaScript.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing or malformed Authorization header." });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, email, role, full_name }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

// Usage: requireRole("staff", "boardDirector") — call AFTER requireAuth.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated." });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Role '${req.user.role}' is not permitted to access this resource.` });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, JWT_SECRET };
