/* Lazy-load the offline geocoder so a missing package never crashes the app */
let getNearestCity: ((lat: number, lon: number) => { cityName?: string; countryName?: string }) | null = null;
import("offline-geocode-city")
  .then((mod) => { getNearestCity = mod.getNearestCity; })
  .catch(() => { /* package unavailable — geocoding disabled */ });

/* Reverse-geocode a coordinate pair into a "City, Country" string.
   Returns null if the geocoder is unavailable or the lookup fails. */
export const geocodeLocation = (latitude: number, longitude: number): string | null => {
  if (!getNearestCity) return null;
  try {
    const result = getNearestCity(latitude, longitude);
    if (result?.cityName) {
      return result.countryName
        ? `${result.cityName}, ${result.countryName}`
        : result.cityName;
    }
  } catch { /* geocoding failure */ }
  return null;
};
