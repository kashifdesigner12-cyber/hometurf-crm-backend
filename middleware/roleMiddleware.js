const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    // User authentication check
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, user authentication required',
      });
    }

    // Normalize allowed roles
    const roles = allowedRoles.map((role) =>
      String(role).trim().toUpperCase()
    );

    // Normalize current user role
    const userRole = String(req.user.role || '')
      .trim()
      .toUpperCase();

    // Role permission check
    if (!roles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `User role '${userRole || 'UNKNOWN'}' is not authorized to access this route`,
      });
    }

    next();
  };
};

module.exports = {
  authorize,
};