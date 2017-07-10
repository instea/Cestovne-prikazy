const {buildSchema} = require('graphql');

module.exports = buildSchema(`
   type Result {
      success: Boolean!,
      message: String,
      payload: String
   }

   input TripInput {
      from: String!,
      to: String!,
      place: String!
   }

   type Trip {
      id: String!,
      from: String!,
      to: String!,
      place: String!
   }

   input UserInput {
      name: String!,
      password: String!,
      isAdmin: Boolean!
   }

   input Credentials {
      name: String!,
      password: String!
   }

   type User {
      id: String!,
      name: String!,
      password: String!,
      isAdmin: Boolean!
   }

   type Query {
      getUser: User,
      getTrips: [Trip],
      getTrip(id: String!): Trip
   }

   type Mutation {
      loginUser(user: Credentials): Result,
      createTrip(trip: TripInput): Trip,
      updateTrip(id: String!, trip: TripInput): Result,
      removeTrip(id: String!): Result
   }

   schema {
      query: Query,
      mutation: Mutation
   }
`);
