const isAuthenticated = (req, res, next) => {
  console.log("isAuthenticatedCalled");
  if (req.session.loggedIn) {
    next();
  } else {
    next();
  }
};

module.exports = {
  isAuthenticated,
};
