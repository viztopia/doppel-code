// Helper function to average points in 2D space
function getAvg1d(points) {
  let avg = 0;
  for(let point of points) {
    avg += point;
  }
  return avg / points.length;
}

function getAvg2d(points) {
  let avg = { x : 0, y : 0 };
  for(let point of points) {
    avg.x += point.x;
    avg.y += point.y
  }
  return { x : avg.x / points.length, y : avg.y / points.length};
}



