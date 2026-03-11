import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { Station, Route, Train } from '../types';

// Fix default icon issue in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const trainIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/3214/3214695.png', // Simple train icon
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

const stationIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/1055/1055013.png', // Simple station icon
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

function getPositionAlongPath(path: [number, number][], fraction: number): [number, number] {
  if (path.length === 0) return [0, 0];
  if (path.length === 1) return path[0];
  if (fraction <= 0) return path[0];
  if (fraction >= 1) return path[path.length - 1];

  let totalLength = 0;
  const segmentLengths: number[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i];
    const p2 = path[i+1];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len = Math.sqrt(dx*dx + dy*dy);
    segmentLengths.push(len);
    totalLength += len;
  }

  const targetLength = totalLength * fraction;
  let currentLength = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const len = segmentLengths[i];
    if (currentLength + len >= targetLength) {
      const segmentFraction = (targetLength - currentLength) / len;
      const p1 = path[i];
      const p2 = path[i+1];
      const lat = p1[0] + (p2[0] - p1[0]) * segmentFraction;
      const lng = p1[1] + (p2[1] - p1[1]) * segmentFraction;
      return [lat, lng];
    }
    currentLength += len;
  }

  return path[path.length - 1];
}

export default function Map() {
  console.log('Map component rendering...');
  const [stations, setStations] = useState<Station[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [trains, setTrains] = useState<Train[]>([]);
  const [trainPositions, setTrainPositions] = useState<Record<number, [number, number]>>({});
  const [selectedItem, setSelectedItem] = useState<{ type: 'station' | 'train', data: any } | null>(null);

  const trainsRef = useRef<Train[]>([]);

  useEffect(() => {
    console.log('Map component mounted, fetching data...');
    const fetchData = async () => {
      try {
        const [stationsRes, routesRes, trainsRes] = await Promise.all([
          fetch('/api/stations').then(r => {
            console.log('Fetched stations');
            return r.json();
          }),
          fetch('/api/routes').then(r => {
            console.log('Fetched routes');
            return r.json();
          }),
          fetch('/api/trains').then(r => {
            console.log('Fetched trains');
            return r.json();
          }),
        ]);
        setStations(stationsRes);
        setRoutes(routesRes);
        setTrains(trainsRes);
        trainsRef.current = trainsRes;
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 2000); // Fetch every 2 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let animationFrameId: number;

    const updatePositions = () => {
      const now = Date.now();
      const newPositions: Record<number, [number, number]> = {};

      for (const train of trainsRef.current) {
        const route = routes.find(r => r.id === train.current_route_id);
        if (!route) continue;

        let currentSegment = train.current_segment;
        if (train.status === 'running') {
          const timeDiffSec = (now - train.last_updated) / 1000;
          currentSegment += train.velocity * timeDiffSec;
        }

        const fraction = Math.min(Math.max(currentSegment / route.total_segments, 0), 1);
        newPositions[train.id] = getPositionAlongPath(route.path_json, fraction);
      }

      setTrainPositions(newPositions);
      animationFrameId = requestAnimationFrame(updatePositions);
    };

    if (routes.length > 0) {
      animationFrameId = requestAnimationFrame(updatePositions);
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [routes]);

  return (
    <div className="flex h-screen w-full">
      <div className="flex-1 relative">
        <MapContainer center={[16.0683, 108.2136]} zoom={6} className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {routes.map(route => (
            <Polyline 
              key={route.id} 
              positions={route.path_json} 
              color="blue" 
              weight={3} 
              opacity={0.6} 
            />
          ))}

          {stations.map(station => (
            <Marker 
              key={station.id} 
              position={[station.lat, station.lng]} 
              icon={stationIcon}
              eventHandlers={{
                click: () => setSelectedItem({ type: 'station', data: station })
              }}
            >
              <Popup>
                <div className="font-semibold">{station.name} Station</div>
              </Popup>
            </Marker>
          ))}

          {trains.map(train => {
            const pos = trainPositions[train.id];
            if (!pos) return null;
            return (
              <Marker 
                key={train.id} 
                position={pos} 
                icon={trainIcon}
                eventHandlers={{
                  click: () => setSelectedItem({ type: 'train', data: train })
                }}
              >
                <Popup>
                  <div className="font-semibold">Train {train.code}</div>
                  <div className="text-sm text-gray-600">Status: {train.status}</div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
      
      {/* Sidebar for info */}
      <div className="w-80 bg-white border-l border-gray-200 p-6 shadow-lg z-[1000] flex flex-col">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-4">Vietnam Railway Tracker</h1>
        
        {selectedItem ? (
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-indigo-600 mb-4 uppercase tracking-wider">
              {selectedItem.type === 'station' ? 'Station Info' : 'Train Info'}
            </h2>
            
            {selectedItem.type === 'station' && (
              <div className="space-y-3">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-gray-500">Name</span>
                  <span className="font-medium">{selectedItem.data.name}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-gray-500">Latitude</span>
                  <span className="font-medium">{selectedItem.data.lat.toFixed(4)}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-gray-500">Longitude</span>
                  <span className="font-medium">{selectedItem.data.lng.toFixed(4)}</span>
                </div>
              </div>
            )}

            {selectedItem.type === 'train' && (
              <div className="space-y-3">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-gray-500">Code</span>
                  <span className="font-medium">{selectedItem.data.code}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-gray-500">Status</span>
                  <span className={`font-medium capitalize ${selectedItem.data.status === 'running' ? 'text-green-600' : 'text-gray-600'}`}>
                    {selectedItem.data.status}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-gray-500">Velocity</span>
                  <span className="font-medium">{selectedItem.data.velocity} seg/s</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-gray-500">Current Segment</span>
                  <span className="font-medium">{selectedItem.data.current_segment.toFixed(1)}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-center">
            Click on a station or train on the map to see details.
          </div>
        )}
      </div>
    </div>
  );
}
