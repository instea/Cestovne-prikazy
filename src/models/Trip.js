import uuid from 'uuid';

class Trip {

   constructor(from, to, place, id) {
      this.id = typeof id === 'undefined' ? uuid.v4() : id;
      this.from = from;
      this.to = to;
      this.place = place;
   }

}

export default Trip;
