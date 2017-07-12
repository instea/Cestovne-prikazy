const {buildSchema} = require('graphql');

const userFields = (
  `username: String!,
   password: String,
   isAdmin: Boolean!,
   firstName: String,
   surname: String,
   degrees: String,
   address: String`);

const tripFields = (
  `from: String!,
   to: String!,
   place: String!`);

module.exports = buildSchema(`
   type Result {
      success: Boolean!,
      message: String,
      payload: String
   }

   input TripInput {
      ${tripFields}
   }

   type Trip {
      id: String!,
      ${tripFields}
   }

   input UserInput {
      ${userFields}
   }

   type User {
      id: String!,
      ${userFields}
   }

   input Credentials {
      username: String!,
      password: String!
   }

   type Query {
      getUserInfo: User,
      getUser(id: String!): User,
      getUsers: [User],
      getTrips: [Trip],
      getTrip(id: String!): Trip
   }

   type Mutation {
      loginUser(user: Credentials): Result,
      userPing: Result,
      createTrip(trip: TripInput): Trip,
      updateTrip(id: String!, trip: TripInput): Result,
      removeTrip(id: String!): Result,
      createUser(user: UserInput): Trip,
      updateUser(id: String!, user: UserInput): Result,
      removeUser(id: String!): Result
   }

   schema {
      query: Query,
      mutation: Mutation
   }
`);
