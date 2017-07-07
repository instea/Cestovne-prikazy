const mongoose = require('mongoose');

const {ObjectID} = mongoose.Types;

mongoose.connection.on('open', () => {

   const TripSchema = mongoose.Schema({
      id: {
         type: String,
         reqired: true
      },
      from: {
         type: Date,
         reqired: true
      },
      to: {
         type: Date,
         reqired: true
      },
      place: {
         type: String,
         reqired: true
      }
   });
   TripSchema.index({id: 1});

   module.exports.Trip = mongoose.model('Trip', TripSchema);

});
