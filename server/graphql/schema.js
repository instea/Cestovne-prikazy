const {buildSchema} = require('graphql');

const placeFields = (
  `name: String!,
   destinationName: String!,
   originName: String!,
   travelDuration: String!`);

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

   input PlaceInput {
      ${placeFields}
   }

   type Place {
      id: String!,
      ${placeFields}
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
      getTrip(id: String!): Trip,
      getPlaces: [Place],
      getPlace(id: String!): Place
   }

   type Mutation {
      loginUser(user: Credentials): Result,
      userPing: Result,
      createTrip(trip: TripInput): Trip,
      updateTrip(id: String!, trip: TripInput): Result,
      removeTrip(id: String!): Result,
      createUser(user: UserInput): User,
      updateUser(id: String!, user: UserInput): Result,
      removeUser(id: String!): Result,
      createPlace(place: PlaceInput): Place,
      updatePlace(id: String!, place: PlaceInput): Result,
      removePlace(id: String!): Result
   }

   schema {
      query: Query,
      mutation: Mutation
   }
`);
