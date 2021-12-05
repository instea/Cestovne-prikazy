const mongoose = require('mongoose');

// Set to true for logging queries
mongoose.set('debug', false);
mongoose.Promise = global.Promise;

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost/data';
const MONGO_OPT = {
  useMongoClient: true,
};

async function connectMongo() {
  try {
    await mongoose.connect(MONGO_URL, MONGO_OPT);
  } catch (err) {
    console.log('Connect to database failed -> exiting');
    // k8s can restart the pod
    process.exit(-1);
  }
}
connectMongo().then(() => console.log('Database connected'));

const db = mongoose.connection;

db.on('error', (err) => console.log('Error connecting to database: ', err));
db.on('disconnected', async (err) => {
  console.log('Disconnected from the database -> exiting: ', err);
  // mongo/mongoose are stupid - can't retry normally. 
  // when I try to reconnect here, it fails with  `MongooseError [OverwriteModelError]: Cannot overwrite `Place` model once compiled.`
  // so it might be better to let k8s to restart the pod
  process.exit(-2);
});
db.on('close', (err) =>
  console.log('Closed the connection to the database: ', err)
);
