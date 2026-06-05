'use strict';

exports.calculate = async (event) => {
  const { matrix, originCity, criteria } = event;
  if (!matrix || !originCity || !criteria) {
    throw new Error('Faltan campos requeridos: matrix, originCity, criteria');
  }
  const routes = dijkstraAllDestinations(matrix, originCity, criteria);
  return { routes };
};

function dijkstraAllDestinations(matrix, origin, criteria) {
  const costField = criteria === 'price' ? 'transportCost' : 'distance';

  const allNodes = new Set([
    ...Object.keys(matrix),
    ...Object.values(matrix).flatMap((row) => Object.keys(row)),
  ]);

  const dist = {}, prev = {}, firstHop = {}, hopsCount = {};
  for (const node of allNodes) {
    dist[node] = Infinity;
    prev[node] = null;
    firstHop[node] = null;
    hopsCount[node] = 0;
  }
  dist[origin] = 0;

  const pq = [[0, origin]];

  while (pq.length > 0) {
    pq.sort((a, b) => a[0] - b[0]);
    const [currentCost, currentNode] = pq.shift();
    if (currentCost > dist[currentNode]) continue;

    const neighbors = matrix[currentNode] || {};
    for (const [neighbor, edge] of Object.entries(neighbors)) {
      if (!edge.enabled) continue;
      const edgeCost = edge[costField];
      if (edgeCost == null || edgeCost < 0) continue;

      const newCost = dist[currentNode] + edgeCost;
      if (newCost < dist[neighbor]) {
        dist[neighbor] = newCost;
        prev[neighbor] = currentNode;
        hopsCount[neighbor] = hopsCount[currentNode] + 1;
        firstHop[neighbor] = currentNode === origin ? neighbor : firstHop[currentNode];
        pq.push([newCost, neighbor]);
      }
    }
  }

  const routes = {};
  for (const dest of allNodes) {
    if (dest === origin) continue;
    if (dist[dest] === Infinity) {
      routes[dest] = { reachable: false, routeMetricCost: null, hops: null, nextHop: null, path: [] };
    } else {
      const path = [];
      let cur = dest;
      while (cur !== null) { path.unshift(cur); cur = prev[cur]; }
      routes[dest] = {
        reachable: true,
        routeMetricCost: dist[dest],
        hops: hopsCount[dest],
        nextHop: firstHop[dest],
        path,
      };
    }
  }
  return routes;
}