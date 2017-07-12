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
      username: String!,
      password: String,
      isAdmin: Boolean!
   }

   input Credentials {
      username: String!,
      password: String!
   }

   type User {
      id: String!,
      username: String!,
      password: String!,
      isAdmin: Boolean!
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
