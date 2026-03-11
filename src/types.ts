export interface Station {
  id: number;
  name: string;
  lat: number;
  lng: number;
}

export interface Route {
  id: number;
  from_station_id: number;
  to_station_id: number;
  total_segments: number;
  path_json: [number, number][];
}

export interface Train {
  id: number;
  code: string;
  current_route_id: number;
  current_segment: number;
  velocity: number;
  status: string;
  last_updated: number;
}

export interface Config {
  key: string;
  value: string;
}
