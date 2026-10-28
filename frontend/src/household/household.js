// The people who live with the wardrobe, by height: a planning aid in this browser only.
// The household is not part of the design. It is never sent to the server, the AI or the PDF
// (names are personal data); it is kept in localStorage. All heights are integer millimetres.

export const CHILD_HEIGHT = 1400; // mm: under this, a person is treated as a child (configurable default)
export const ADULT_DEFAULT = 1700;
export const CHILD_DEFAULT = 1000;
export const HEIGHT_RANGE = Object.freeze([500, 2200]);
export const MAX_PEOPLE = 8;
export const MAX_NAME = 30;
export const STORAGE_KEY = 'banai.household';
const REACH = 1.3; // a standing child reaches about 1.3 x their height with a raised arm (estimate)
const RELEASE_STEP = 50; // mm: the release height is rounded up to 5 cm
const MIN_RELEASE = 1200;

let counter = 0;
const newId = () => `p_${Date.now().toString(36)}${(counter += 1).toString(36)}`;

export const isChild = (person) => person.height < CHILD_HEIGHT;

export function validHeight(mm) {
  return Number.isInteger(mm) && mm >= HEIGHT_RANGE[0] && mm <= HEIGHT_RANGE[1];
}

/** Keep only well-formed people (from storage or a caller): id, trimmed name, height in range. */
export function normalizePeople(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => p && typeof p === 'object' && validHeight(p.height))
    .slice(0, MAX_PEOPLE)
    .map((p) => ({
      id: typeof p.id === 'string' && /^p_[a-z0-9]{1,24}$/.test(p.id) ? p.id : newId(),
      name: typeof p.name === 'string' ? p.name.trim().slice(0, MAX_NAME) : '',
      height: p.height,
    }));
}

export function newPerson(height) {
  return { id: newId(), name: '', height };
}

export function loadHousehold(storage = globalThis.localStorage) {
  try {
    return normalizePeople(JSON.parse(storage?.getItem(STORAGE_KEY) ?? '[]'));
  } catch {
    return []; // private mode, blocked storage or a damaged value: start empty
  }
}

export function saveHousehold(people, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(people));
  } catch {
    /* storage unavailable: the household still works for this visit */
  }
}

/** The lowest height for a lock's release button that a standing child cannot reach. */
export function releaseHeightFor(childHeight) {
  return Math.max(MIN_RELEASE, Math.ceil((childHeight * REACH) / RELEASE_STEP) * RELEASE_STEP);
}

/**
 * Child safety for this design and household, or null when no child lives here.
 * `steps`: drawers that start below the tallest child's height, which a child can climb like stairs.
 */
export function childSafety(design, people) {
  const children = people.filter(isChild);
  if (!children.length) return null;
  const tallest = Math.max(...children.map((p) => p.height));
  const shortest = Math.min(...children.map((p) => p.height));
  const steps = design.compartments.reduce((n, c) => n + c.drawers.filter((d) => d.y < tallest).length, 0);
  const releaseHeight = releaseHeightFor(tallest);
  return {
    count: children.length,
    tallest,
    shortest,
    steps,
    hasDoors: design.doors.type !== 'none',
    releaseHeight,
    releaseOnWall: releaseHeight > design.dimensions.height - RELEASE_STEP,
  };
}
