// Minimalni service worker - existuje hlavne proto, aby prohlizec appku
// povazoval za instalovatelnou (fullscreen "Add to Home Screen" na Androidu).
self.addEventListener('fetch', () => {});
