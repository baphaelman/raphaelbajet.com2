import React from 'react';

import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Home from './Home';
import Art from './Art';
import Dogs from './Dogs';

import './App.css';

function App() {
    return (
        <>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/art" element={<Art />} />
                    <Route path="/dogs" element={<Dogs />} />
                </Routes>
            </BrowserRouter>
        </>
    );
}

export default App;
