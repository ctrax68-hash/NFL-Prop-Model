/**
 * Coordinates for currently-in-use domestic NFL stadiums, keyed by nflverse's
 * `stadium_id` — not team abbreviation, since a handful of venues host two
 * teams (SoFi: LAC/LA; MetLife: NYG/NYJ) and a team occasionally has more
 * than one `stadium_id` across seasons (a rename, or a temporary venue).
 *
 * The key set here was built by scanning every distinct `(stadium_id,
 * stadium)` pair nflverse's schedule actually publishes for 2021+ `Home`
 * games, not by guessing a team-to-city mapping by hand — a wrong lat/long
 * would silently misprice every forecast for a stadium's games for a whole
 * season with no obvious symptom. International/neutral-site venues
 * (Wembley, Munich, etc.) are deliberately not included: those games are
 * already excluded from forecasting by their `location !== "Home"`, so
 * there is nothing that would ever look them up.
 */

export interface StadiumCoordinates {
  lat: number;
  lon: number;
  name: string;
}

export const STADIUM_COORDINATES: Record<string, StadiumCoordinates> = {
  ATL97: { lat: 33.7554, lon: -84.4008, name: "Mercedes-Benz Stadium" },
  BAL00: { lat: 39.278, lon: -76.6227, name: "M&T Bank Stadium" },
  BOS00: { lat: 42.0909, lon: -71.2643, name: "Gillette Stadium" },
  BUF00: { lat: 42.7738, lon: -78.787, name: "Highmark Stadium" },
  CAR00: { lat: 35.2258, lon: -80.8528, name: "Bank of America Stadium" },
  CHI98: { lat: 41.8623, lon: -87.6167, name: "Soldier Field" },
  CIN00: { lat: 39.0954, lon: -84.516, name: "Paycor Stadium" },
  CLE00: { lat: 41.5061, lon: -81.6995, name: "Huntington Bank Field" },
  DAL00: { lat: 32.7473, lon: -97.0945, name: "AT&T Stadium" },
  DEN00: { lat: 39.7439, lon: -105.0201, name: "Empower Field at Mile High" },
  DET00: { lat: 42.34, lon: -83.0456, name: "Ford Field" },
  GNB00: { lat: 44.5013, lon: -88.0622, name: "Lambeau Field" },
  HOU00: { lat: 29.6847, lon: -95.4107, name: "NRG Stadium" },
  IND00: { lat: 39.7601, lon: -86.1639, name: "Lucas Oil Stadium" },
  JAX00: { lat: 30.3239, lon: -81.6373, name: "EverBank Stadium" },
  KAN00: { lat: 39.0489, lon: -94.4839, name: "GEHA Field at Arrowhead Stadium" },
  LAX01: { lat: 33.9535, lon: -118.3392, name: "SoFi Stadium" },
  MIA00: { lat: 25.958, lon: -80.2389, name: "Hard Rock Stadium" },
  MIN01: { lat: 44.9736, lon: -93.2575, name: "U.S. Bank Stadium" },
  NAS00: { lat: 36.1665, lon: -86.7713, name: "Nissan Stadium" },
  NOR00: { lat: 29.9511, lon: -90.0812, name: "Caesars Superdome" },
  NYC01: { lat: 40.8135, lon: -74.0745, name: "MetLife Stadium" },
  PHI00: { lat: 39.9008, lon: -75.1675, name: "Lincoln Financial Field" },
  PHO00: { lat: 33.5276, lon: -112.2626, name: "State Farm Stadium" },
  PIT00: { lat: 40.4468, lon: -80.0158, name: "Acrisure Stadium" },
  SEA00: { lat: 47.5952, lon: -122.3316, name: "Lumen Field" },
  SFO01: { lat: 37.4033, lon: -121.9694, name: "Levi's Stadium" },
  TAM00: { lat: 27.9759, lon: -82.5033, name: "Raymond James Stadium" },
  VEG00: { lat: 36.0909, lon: -115.1833, name: "Allegiant Stadium" },
  WAS00: { lat: 38.9077, lon: -76.8645, name: "Northwest Stadium" },
};
