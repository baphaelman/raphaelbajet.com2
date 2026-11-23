import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import Slop from '/components/slop.js';

// the slop editor: under `npm run edit`, its Edit text button and the editor itself
Slop.start();

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
