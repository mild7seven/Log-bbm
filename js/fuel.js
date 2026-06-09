export function calculateKMPL(distance, liters) {

  if (!liters) return 0;

  return distance / liters;
}

export function calculateCostPerKM(cost, distance) {

  if (!distance) return 0;

  return cost / distance;
}

export function calculateRemainingRange(
  fuelPercent,
  tankCapacity,
  avgKMPL
) {

  const fuelLeft =
    (fuelPercent / 100) * tankCapacity;

  return fuelLeft * avgKMPL;
}
