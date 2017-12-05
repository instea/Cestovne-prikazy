const { buildSchema } = require('graphql');
const { values: TRAVEL_TYPES } = require('../../src/data/TravelType');
const { COUNTRIES } = require('../../src/data/Countries');

const placeFields = `name: String!,
   destinationName: String!,
   originName: String!,
   travelDuration: String!,
   country: Country`;

const userFields = `username: String!,
   password: String,
   isAdmin: Boolean!,
   firstName: String,
   surname: String,
   degrees: String,
   address: String`;

const tripFields = `userId: String!,
   placeId: String!,
   departureTime: String!,
   arrivalTime: String!,
   purpose: String!,
   travelType: TravelType!,
   priceOfTravel: Float!`;

const leaveFields = `
  startDate: String!,
  endDate: String!
`;

module.exports = buildSchema(`
   type Result {
      success: Boolean!,
      message: String,
      payload: String
   }

   enum TravelType {
      ${TRAVEL_TYPES.map(t => t.code).join('\n')}
   }

   enum Country {
      ${COUNTRIES.map(c => c.code).join('\n')}
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
      ${tripFields},
      user: User!,
      place: Place!
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

   type Leave {
     id: ID!,
     ${leaveFields}
   }

   input LeaveInput {
     ${leaveFields}
   }

   type Query {
      getUserInfo: User,
      getUser(id: String!): User,
      getUsers: [User],
      getTrips: [Trip],
      getTrip(id: String!): Trip,
      getPlaces: [Place],
      getPlace(id: String!): Place,
      getLeaves: [Leave],
   }

   type Mutation {
      loginUser(user: Credentials): Result,
      createTrip(trip: TripInput): Trip,
      updateTrip(id: String!, trip: TripInput): Result,
      removeTrip(id: String!): Result,
      createUser(user: UserInput): User,
      updateUser(id: String!, user: UserInput): Result,
      removeUser(id: String!): Result,
      createPlace(place: PlaceInput): Place,
      updatePlace(id: String!, place: PlaceInput): Result,
      removePlace(id: String!): Result
      createLeave(leave: LeaveInput): Leave,
   }

   schema {
      query: Query,
      mutation: Mutation
   }
`);
