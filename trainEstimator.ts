import Database from 'better-sqlite3';

// This service simulates processing external data to estimate train velocity and position
export class TrainEstimatorService {
  private trainsDb: Database.Database;

  constructor(trainsDb: Database.Database) {
    this.trainsDb = trainsDb;
  }

  // Input: raw data from external sources
  // Output: updates the database with estimated velocity and position
  public processExternalData(externalTrainData: any[]) {
    const now = Date.now();
    const updateTrain = this.trainsDb.prepare('UPDATE trains SET current_segment = ?, velocity = ?, status = ?, last_updated = ? WHERE code = ?');
    const getTrain = this.trainsDb.prepare('SELECT * FROM trains WHERE code = ?');
    const getRoute = this.trainsDb.prepare('SELECT * FROM routes WHERE id = ?');

    for (const data of externalTrainData) {
      const train = getTrain.get(data.code) as any;
      if (!train) continue;

      const route = getRoute.get(train.current_route_id) as any;
      if (!route) continue;

      // In a real scenario, this would involve complex calculations based on GPS, schedule, etc.
      // Here we just use the provided data or calculate a simple estimate
      let newSegment = data.estimated_segment ?? train.current_segment;
      let newVelocity = data.estimated_velocity ?? train.velocity;
      let newStatus = data.status ?? train.status;

      // Ensure it doesn't go past the route
      if (newSegment >= route.total_segments) {
        newSegment = route.total_segments;
        newStatus = 'arrived';
        newVelocity = 0;
      }

      updateTrain.run(newSegment, newVelocity, newStatus, now, data.code);
    }
  }

  // This function runs the internal estimation loop when no external data is received
  public tickInternalEstimation() {
    const now = Date.now();
    const trains = this.trainsDb.prepare('SELECT * FROM trains WHERE status = "running"').all() as any[];
    const updateTrain = this.trainsDb.prepare('UPDATE trains SET current_segment = ?, status = ?, last_updated = ? WHERE id = ?');
    
    for (const train of trains) {
      const route = this.trainsDb.prepare('SELECT * FROM routes WHERE id = ?').get(train.current_route_id) as any;
      if (!route) continue;

      const timeDiffSec = (now - train.last_updated) / 1000;
      let newSegment = train.current_segment + (train.velocity * timeDiffSec);
      let newStatus = train.status;
      
      if (newSegment >= route.total_segments) {
        newSegment = route.total_segments;
        newStatus = 'arrived';
      }

      updateTrain.run(newSegment, newStatus, now, train.id);
    }
  }
}
