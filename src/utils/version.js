import pkg from '../../package.json';

const pad2 = (n) => String(n).padStart(2, '0');

// Fallback for local dev builds (npm start), where the CI-injected env vars
// below aren't set.
const localDate = () => {
  const d = new Date();
  return `${pad2(d.getFullYear() % 100)}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
};

export const APP_VERSION  = pkg.version;
export const BUILD_NUMBER = process.env.REACT_APP_BUILD_NUMBER || 'dev';
export const BUILD_DATE   = process.env.REACT_APP_BUILD_DATE || localDate();
export const VERSION_LABEL = `v${APP_VERSION} · build ${BUILD_NUMBER} · ${BUILD_DATE}`;
