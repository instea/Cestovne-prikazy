const BASE_URL = process.env.BASE_URL || '';

const getApprovalUrl = () => {
  if (process.env.NODE_ENV === 'production') {
    return BASE_URL + '/leaves/approval';
  }
  return BASE_URL + '/approval';
};

module.exports = {
  getApprovalUrl
};