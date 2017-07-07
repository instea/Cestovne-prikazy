const {buildSchema} = require('graphql');

module.exports = buildSchema(`
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

   type Query {
      getTrips: [Trip],
      getTrip(id: String!): Trip
   }

   type Mutation {
      createTrip(trip: TripInput): Trip,
      updateTrip(id: String!, trip: TripInput): Trip,
      removeTrip(id: String!): Trip
   }

   schema {
      query: Query,
      mutation: Mutation
   }
`);
