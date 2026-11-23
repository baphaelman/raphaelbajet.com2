// Works out the rupture's ink (slopGoo.js) off the main thread
import { paintGoo } from './slopGoo.js';

self.onmessage = ({ data: { id, width, height } }) => {
    const goo = paintGoo(width, height);
    self.postMessage({ id, ...goo }, [goo.data.buffer, goo.rows.buffer]);
};
