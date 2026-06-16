import React, { createContext, useCallback, useContext, useState } from 'react';
import * as Location from 'expo-location';

type LocationType = { lat: number; lng: number } | null;

interface LocationContextProps {
  myLocation: LocationType;
  loading: boolean;
  refreshLocation: () => Promise<void>;
}

const LocationContext = createContext<LocationContextProps>({
  myLocation: null,
  loading: false,
  refreshLocation: async () => {},
});

export const LocationProvider = ({ children }: { children: React.ReactNode }) => {
  const [myLocation, setMyLocation] = useState<LocationType>(null);
  const [loading, setLoading] = useState(false);

  const refreshLocation = useCallback(async () => {
    try {
      setLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[LocationContext] Permission denied');
        setLoading(false);
        return;
      }

      // 팁: 정확도 Balanced면 충분하고 속도 빠름
      const loc = await Location.getCurrentPositionAsync({ 
        accuracy: Location.Accuracy.Balanced 
      });
      
      setMyLocation({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      });
    } catch (e) {
      console.warn('[LocationContext] Error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <LocationContext.Provider value={{ myLocation, loading, refreshLocation }}>
      {children}
    </LocationContext.Provider>
  );
};

export const useLocationContext = () => useContext(LocationContext);