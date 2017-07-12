module.exports.simpleResult = (resolve, reject) => {
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
