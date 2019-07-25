const { buildSchema } = require('graphql');
const { values: TRAVEL_TYPES } = require('../../src/data/TravelType');
const { COUNTRIES } = require('../../src/data/Countries');
const { LEAVE_TYPES } = require('../../src/data/LeaveType');
const { LEAVE_STATES } = require('../../src/data/LeaveState');

const placeFields = `name: String!,
   destinationName: String!,
   originName: String!,
   travelDuration: String!,
   country: Country`;

const userFields = `
   isAdmin: Boolean!,
   approved: Boolean,
   firstName: String,
   surname: String,
   degrees: String,
   address: String
   email: String`;

const tripFields = `userId: String!,
   placeId: String!,
   departureTime: String!,
   arrivalTime: String!,
   purpose: String!,
   travelType: TravelType!,
   priceOfTravel: Float!`;

/*
generic fields (input and type) that can be changed by standard update operation.
approval and other special changes are executed via special mutations
*/
const leaveFields = `
  startDate: String!,
  endDate: String!,
  type: LeaveType,
  isHalfDay: Boolean,
  numDays: Float,
`;

module.exports = buildSchema(`
   type Result {
      success: Boolean!,
      message: String,
      payload: String
   }
   
   type LoginResult {
   		status: String,
   		jwt: String
   }

   enum TravelType {
      ${TRAVEL_TYPES.map(t => t.code).join('\n')}
   }

   enum Country {
      ${COUNTRIES.map(c => c.code).join('\n')}
   }

   enum LeaveType {
     ${LEAVE_TYPES.map(t => t.code).join('\n')}
   }

   enum LeaveState {
     ${LEAVE_STATES.map(t => t.code).join('\n')}
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
      email: String!,
      approved: Boolean,
      ${userFields}
   }

   type Leave {
     id: ID!,
     requester: User,
     approver: User,
     state: LeaveState,
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
      loginUser(token_id: String!): LoginResult,
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
      removeLeave(id: ID!): Result
      approveLeave(id: String!): Leave,
      rejectLeave(id: String!): Leave,
      approveUser(id: String!): Result
   }

   schema {
      query: Query,
      mutation: Mutation
   }
`);
