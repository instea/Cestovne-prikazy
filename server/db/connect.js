const mongoose = require('mongoose');

// Set to true for logging queries
mongoose.set('debug', false);
mongoose.Promise = global.Promise;

const MONGO_URL = process.env.MONGO_URL;
mongoose.connect(MONGO_URL || 'mongodb://localhost/data', {
  useMongoClient: true
});

const db = mongoose.connection;

db.on('error', (err) => console.log('Error connecting to database: ', err));
db.on('disconnected', (err) => console.log('Disconnected from the database: ', err));
db.on('close', (err) => console.log('Closed the connection to the database: ', err));