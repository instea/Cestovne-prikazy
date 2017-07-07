const path = require('path');
const fs = require('fs');
const jwt = require('express-jwt');
const dbSchema = require('../db/schema');

const publicKey = fs.readFileSync(path.join(__dirname, '../../secrets/public.pem'));
console.log('public-key', publicKey.toString());

module.exports = (app, path) => {
   app.use(path, jwt({
      secret: publicKey,
      credentialsRequired: false
   }));
   app.use(path, (req, res, done) => {
      req.context = {};
      if (!req || !req.user || !req.user.sub) {
         return done();
      }
      dbSchema.User.findOne({id: req.user.sub}, (err, user) => {
         if (err) {
            return done();
         }
         if (user) {
            req.context = {
               user: user
            };
         }
         done();
      });
   });
};
