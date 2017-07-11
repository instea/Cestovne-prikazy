module.exports.userProtected = (resolver) => {
  return (params, context, ...rest) => {
    if (!context.user) {
      return null;
    }
    return resolver(params, context, ...rest);
  };
};

module.exports.ownerProtected = (resolver) => {
  return (params, context, ...rest) => {
    if (!context.user) {
      return null;
    }
    params.ownerId = context.user._id;
    return resolver(params, context, ...rest);
  };
};

module.exports.adminProtected = (resolver) => {
  return (params, context, ...rest) => {
    if (!context.user || !context.user.isAdmin) {
      return null;
    }
    return resolver(params, context, ...rest);
  };
};
