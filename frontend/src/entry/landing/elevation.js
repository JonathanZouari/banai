// A front elevation of a design as SVG path data, for the landing page's drawing.
// Pure: the design in, path strings out (millimetres, y pointing down as in SVG).
import { frameOf } from '../../viewer/builders/frame.js';

const RAIL_INSET = 20;

export function elevationPaths(design) {
  const frame = frameOf(design);
  const { width, height, panel } = frame;
  const y = (fromFloor) => height - fromFloor;
  const paths = [
    { kind: 'carcass', d: `M0 0H${width}V${height}H0Z` },
    { kind: 'carcass', d: `M${panel} ${y(height - panel)}H${width - panel}` },
    { kind: 'carcass', d: `M${panel} ${y(panel)}H${width - panel}` },
  ];
  design.partitions.forEach((partition, i) => {
    const x = frame.ranges[i][1] + partition.thickness / 2;
    paths.push({ kind: 'partition', d: `M${x} ${y(height - panel)}V${y(panel)}` });
  });
  design.compartments.forEach((compartment, i) => {
    const [x0, x1] = frame.ranges[i];
    compartment.shelves.forEach((shelf) => {
      paths.push({ kind: 'shelf', d: `M${x0} ${y(panel + shelf.y + shelf.thickness / 2)}H${x1}` });
    });
    compartment.drawers.forEach((drawer) => {
      const top = y(panel + drawer.y + drawer.height - 4);
      const bottom = y(panel + drawer.y + 4);
      paths.push({ kind: 'drawer', d: `M${x0 + 6} ${bottom}H${x1 - 6}V${top}H${x0 + 6}Z` });
    });
    compartment.rails.forEach((rail) => {
      paths.push({ kind: 'rail', d: `M${x0 + RAIL_INSET} ${y(panel + rail.y)}H${x1 - RAIL_INSET}` });
    });
  });
  return { width, height, paths };
}
