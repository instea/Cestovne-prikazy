module.exports.simpleResult = (resolve, reject) => {
  if (resolve && resolve.then && resolve.catch) {
    const promise = resolve;
    return promise.then(res => ({
      success: true
    })).catch(err => ({
      success: false,
      message: err.message
    }));
  }

  return (err) => {
    if (err) {
      return resolve({
        success: false,
        message: err.message
      });
    }
    resolve({
      success: true
    });
  };
};
