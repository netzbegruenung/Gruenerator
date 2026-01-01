function errorHandler(err, req, res, next) {
  res.status(500).send('An error occurred on the server');
}

export { errorHandler };